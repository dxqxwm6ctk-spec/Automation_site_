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
import { db, executions, schedules, workflows, workflowVersions } from "@workspace/db";
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

/** The absolute Date of the next cron tick — used to keep `schedules.nextRunAt` accurate. */
function computeNextRun(cronExpression: string, timezone: string): Date {
  return new Date(Date.now() + msUntilNext(cronExpression, timezone));
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

  void runExecution(execution.id, graph, plan, null, workflow.userId).catch((err: unknown) =>
    logger.error({ err, executionId: execution.id, workflowId }, "Scheduler: execution error"),
  );

  // Keep the schedules row's lastRunAt/nextRunAt in sync with what actually
  // fired, so the Schedules page reflects reality instead of going stale
  // after the very first run.
  const [scheduleRow] = await db.select().from(schedules).where(eq(schedules.workflowId, workflowId)).limit(1);
  if (scheduleRow) {
    const nextRunAt = computeNextRun(scheduleRow.cronExpression, scheduleRow.timezone);
    await db
      .update(schedules)
      .set({ lastRunAt: new Date(), nextRunAt, updatedAt: new Date() })
      .where(eq(schedules.id, scheduleRow.id));
  }

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
 * Called once at server start-up. Arms a timer for every active `schedules`
 * row belonging to an active, non-deleted workflow.
 *
 * The `schedules` table (managed by the `/v1/schedules` CRUD routes) is the
 * single source of truth for cron/timezone — this used to re-derive
 * schedules by scanning each workflow's graph for a `schedule_trigger`
 * node, which silently ignored any edits made through the Schedules page
 * and would re-arm the *original* graph config on every restart.
 */
export async function bootstrapScheduler(): Promise<void> {
  const activeSchedules = await db
    .select({
      workflowId: schedules.workflowId,
      cronExpression: schedules.cronExpression,
      timezone: schedules.timezone,
    })
    .from(schedules)
    .innerJoin(workflows, eq(schedules.workflowId, workflows.id))
    .where(and(eq(schedules.isActive, true), eq(workflows.isActive, true), isNull(workflows.deletedAt)));

  let count = 0;
  for (const s of activeSchedules) {
    arm(s.workflowId, s.cronExpression, s.timezone);
    count++;
  }

  logger.info({ count }, "Scheduler: bootstrap complete");
}
