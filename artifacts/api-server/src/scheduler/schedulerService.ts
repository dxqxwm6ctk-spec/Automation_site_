/**
 * Schedule Trigger runner — wires the `schedule_trigger` node type to real
 * cron-based execution without adding a job queue.
 *
 * Strategy: for each active workflow that has a `schedule_trigger` node we
 * arm a one-shot `setTimeout` calibrated to the next cron tick.  After the
 * job fires we re-arm immediately so the workflow keeps running until
 * unscheduleWorkflow() or bootstrapScheduler() says otherwise.
 *
 * Why setTimeout instead of setInterval?  setInterval drifts over time and
 * can miscount when the OS puts the process to sleep.  Recalculating the
 * next tick from the cron expression after every firing stays exact.
 */
import { CronExpressionParser } from "cron-parser";
import { and, eq, isNull } from "drizzle-orm";
import { db, executions, workflows, workflowVersions } from "@workspace/db";
import { graphSchema, type Graph } from "../lib/graph";
import { buildExecutionPlan, GraphStructureError } from "../engine/graphBuilder";
import { runExecution } from "../engine/executionEngine";
import { logger } from "../lib/logger";

// ── Internal state ────────────────────────────────────────────────────────────

type ScheduledJob = {
  workflowId: string;
  cronExpression: string;
  timezone: string;
  timer: ReturnType<typeof setTimeout>;
};

const jobs = new Map<string, ScheduledJob>();

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Milliseconds until the next cron tick (minimum 1 000 to avoid tight loops). */
function msUntilNext(cronExpression: string, timezone: string): number {
  const it = CronExpressionParser.parse(cronExpression, { tz: timezone });
  return Math.max(it.next().toDate().getTime() - Date.now(), 1_000);
}

/** Fire a single scheduled execution for the workflow. */
async function fire(workflowId: string): Promise<void> {
  // Reload from DB — the workflow may have been edited or deactivated since arming.
  const [workflow] = await db
    .select()
    .from(workflows)
    .where(and(eq(workflows.id, workflowId), isNull(workflows.deletedAt)))
    .limit(1);

  if (!workflow?.isActive || !workflow.activeVersionId) {
    unscheduleWorkflow(workflowId);
    return;
  }

  const [version] = await db
    .select()
    .from(workflowVersions)
    .where(eq(workflowVersions.id, workflow.activeVersionId))
    .limit(1);
  if (!version) return;

  let graph: Graph;
  try {
    graph = graphSchema.parse(version.graphJson);
  } catch (err) {
    logger.warn({ workflowId, err }, "Scheduler: could not parse graph — skipping");
    return;
  }

  let plan;
  try {
    plan = buildExecutionPlan(graph);
  } catch (err) {
    if (err instanceof GraphStructureError) {
      logger.warn({ workflowId, msg: err.message }, "Scheduler: invalid graph structure — skipping");
    } else {
      logger.error({ workflowId, err }, "Scheduler: unexpected error building plan");
    }
    return;
  }

  const [execution] = await db
    .insert(executions)
    .values({
      workflowId,
      versionId: version.id,
      status: "pending" as const,
      triggerType: "schedule" as const,
      triggerPayload: null,
    })
    .returning();

  void runExecution(execution.id, graph, plan, null).catch((err: unknown) =>
    logger.error({ err, executionId: execution.id, workflowId }, "Scheduler: execution error"),
  );

  logger.info({ workflowId, executionId: execution.id }, "Scheduler: fired scheduled execution");
}

/** Arm the next single-shot timer for a workflow. */
function arm(workflowId: string, cronExpression: string, timezone: string): void {
  let delay: number;
  try {
    delay = msUntilNext(cronExpression, timezone);
  } catch (err) {
    logger.error({ workflowId, cronExpression, err }, "Scheduler: invalid cron expression — not arming");
    return;
  }

  const timer = setTimeout(() => {
    void fire(workflowId).finally(() => {
      // Re-arm only if the job is still registered (not cancelled during fire())
      const job = jobs.get(workflowId);
      if (job) arm(workflowId, job.cronExpression, job.timezone);
    });
  }, delay);

  jobs.set(workflowId, { workflowId, cronExpression, timezone, timer });

  const nextRun = new Date(Date.now() + delay).toISOString();
  logger.info({ workflowId, cronExpression, timezone, nextRun }, "Scheduler: job armed");
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Schedule (or reschedule) a workflow.  Cancels any existing timer before
 * arming a new one so it is safe to call on every workflow save.
 */
export function scheduleWorkflow(
  workflowId: string,
  cronExpression: string,
  timezone = "UTC",
): void {
  unscheduleWorkflow(workflowId);
  arm(workflowId, cronExpression, timezone);
}

/** Cancel a scheduled workflow.  No-op if it was not scheduled. */
export function unscheduleWorkflow(workflowId: string): void {
  const job = jobs.get(workflowId);
  if (!job) return;
  clearTimeout(job.timer);
  jobs.delete(workflowId);
  logger.info({ workflowId }, "Scheduler: job cancelled");
}

/**
 * Called once at server start-up.  Loads every active workflow that has a
 * `schedule_trigger` node and arms a timer for each.
 */
export async function bootstrapScheduler(): Promise<void> {
  const activeWorkflows = await db
    .select({ id: workflows.id, activeVersionId: workflows.activeVersionId })
    .from(workflows)
    .where(and(eq(workflows.isActive, true), isNull(workflows.deletedAt)));

  let count = 0;
  for (const w of activeWorkflows) {
    if (!w.activeVersionId) continue;

    const [version] = await db
      .select()
      .from(workflowVersions)
      .where(eq(workflowVersions.id, w.activeVersionId))
      .limit(1);
    if (!version) continue;

    let graph: Graph;
    try {
      graph = graphSchema.parse(version.graphJson);
    } catch {
      continue;
    }

    const scheduleNode = graph.nodes.find((n) => n.type === "schedule_trigger");
    if (!scheduleNode) continue;

    const cfg = (scheduleNode.config ?? {}) as { cronExpression?: string; timezone?: string };
    arm(w.id, cfg.cronExpression ?? "0 * * * *", cfg.timezone ?? "UTC");
    count++;
  }

  logger.info({ count }, "Scheduler: bootstrap complete");
}
