/**
 * Execution engine — Phase 1.4
 *
 * Runs a workflow graph to completion in-process. This intentionally skips
 * the queue/worker split described for later infra hardening
 * (docs mention BullMQ + Redis): no REDIS_URL is configured yet (see
 * /ready's "not_configured" redis check), and Phase 1.4's acceptance
 * criteria — DAG execution, node dispatch, execution tracking, node-level
 * logs — don't require distributed queuing to be met. Swapping this module
 * out for a real queue/worker later shouldn't need to change its public
 * surface (runExecution/requestCancellation), just how it's invoked.
 *
 * Known limitation of the in-process design: cancellation only works from
 * the api-server process that started the run (activeControllers is an
 * in-memory Map), and a server restart mid-run leaves that execution's row
 * stuck in "running" forever (no external job store to recover from). Both
 * are acceptable for a single-instance MVP.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db, executionLogs, executions, type Execution } from "@workspace/db";
import type { Graph, GraphNode } from "../lib/graph";
import type { ExecutionPlan } from "./graphBuilder";
import { runNode } from "./nodeRunner";

/** 5 minutes — the execution-level timeout backstop (docs/07-workflow-engine.md "Timeouts"). Individual node types may impose their own, shorter timeout (e.g. http_request); this is the ceiling for the whole run. */
export const EXECUTION_TIMEOUT_MS = 5 * 60 * 1000;

class ExecutionTimeoutError extends Error {
  constructor() {
    super(`Execution exceeded the ${EXECUTION_TIMEOUT_MS / 1000}s execution timeout`);
    this.name = "ExecutionTimeoutError";
  }
}

class ExecutionCancelledError extends Error {
  constructor() {
    super("Execution cancelled by user request");
    this.name = "ExecutionCancelledError";
  }
}

// ─── Cancellation registry ──────────────────────────────────────────────────
// In-memory only — see the module doc comment above.
const activeControllers = new Map<string, AbortController>();

type NodeOutcome = { status: "success"; output: unknown; branch?: string } | { status: "skipped" };

/**
 * Walks every node in the plan to completion. Scheduling is dependency
 * driven, not a precomputed topological batch list: `resolve(key)` recurses
 * into a node's upstream dependencies (memoized so a node with multiple
 * consumers only runs once) and only calls runNode once all of them have
 * settled, which gives correct sequencing, parallel fan-out for independent
 * branches, and fan-in for merge points for free.
 *
 * Branch skipping: a node fed only by "if" connections whose handle doesn't
 * match the branch actually taken (or fed only by upstream nodes that were
 * themselves skipped) has no live incoming edge, so it's marked `skipped`
 * and not executed. Downstream nodes check that status on their own
 * upstream outcomes, so skips cascade naturally through the rest of that
 * branch, while a reconverging node still runs once its other, live path
 * completes.
 */
async function walkGraph(
  executionId: string,
  plan: ExecutionPlan,
  triggerPayload: unknown,
  controller: AbortController,
): Promise<Map<string, NodeOutcome>> {
  const { signal } = controller;
  const inFlight = new Map<string, Promise<NodeOutcome>>();

  function resolve(key: string): Promise<NodeOutcome> {
    let promise = inFlight.get(key);
    if (!promise) {
      promise = resolveUncached(key);
      inFlight.set(key, promise);
    }
    return promise;
  }

  async function resolveUncached(key: string): Promise<NodeOutcome> {
    const node = plan.nodesByKey.get(key) as GraphNode;
    const incomingConnections = plan.incoming.get(key) ?? [];

    let input: unknown = triggerPayload ?? null;

    if (incomingConnections.length > 0) {
      const upstreamKeys = [...new Set(incomingConnections.map((c) => c.sourceKey))];
      const upstreamOutcomes = await Promise.all(upstreamKeys.map((k) => resolve(k)));
      const bySourceKey = new Map(upstreamKeys.map((k, i) => [k, upstreamOutcomes[i]]));

      const live: { sourceKey: string; output: unknown }[] = [];
      for (const connection of incomingConnections) {
        const outcome = bySourceKey.get(connection.sourceKey);
        if (!outcome || outcome.status !== "success") continue; // upstream didn't run or was skipped
        if (connection.sourceHandle != null && connection.sourceHandle !== outcome.branch) continue; // branch not taken
        live.push({ sourceKey: connection.sourceKey, output: outcome.output });
      }

      if (live.length === 0) {
        await recordSkipped(executionId, node);
        return { status: "skipped" };
      }
      input =
        live.length === 1
          ? live[0].output
          : Object.fromEntries(live.map((entry) => [entry.sourceKey, entry.output]));
    }

    if (signal.aborted) throw signal.reason instanceof Error ? signal.reason : new Error("Execution aborted");

    const result = await runNode(executionId, node, input, signal);
    return { status: "success", output: result.output, branch: result.branch };
  }

  const keys = [...plan.nodesByKey.keys()];
  let firstError: unknown;
  await Promise.allSettled(
    keys.map((key) =>
      resolve(key).catch((err: unknown) => {
        // Abort on the *first* node failure so sibling in-flight nodes (e.g.
        // a parallel branch mid-delay or mid-fetch) stop promptly instead of
        // running to completion pointlessly. Idempotent if already aborted.
        if (firstError === undefined) {
          firstError = err;
          if (!controller.signal.aborted) {
            controller.abort(err instanceof Error ? err : new Error(String(err)));
          }
        }
        throw err;
      }),
    ),
  );
  if (firstError !== undefined) throw firstError;

  const finalOutcomes = new Map<string, NodeOutcome>();
  for (const key of keys) finalOutcomes.set(key, await resolve(key));
  return finalOutcomes;
}

/** Nodes with no outgoing connection — candidates for the execution's final `output`. */
function findTerminalKeys(plan: ExecutionPlan): string[] {
  return [...plan.nodesByKey.keys()].filter((key) => (plan.outgoing.get(key)?.length ?? 0) === 0);
}

/** If exactly one terminal node ran, its output is the execution's output; with several, they're merged by node key; with none reached (e.g. every branch from the entry was skipped), the output is null. */
function computeFinalOutput(plan: ExecutionPlan, outcomes: Map<string, NodeOutcome>): unknown {
  const reached = findTerminalKeys(plan)
    .map((key) => outcomes.get(key))
    .filter((outcome): outcome is Extract<NodeOutcome, { status: "success" }> => outcome?.status === "success");
  if (reached.length === 0) return null;
  if (reached.length === 1) return reached[0].output;
  return Object.fromEntries(
    findTerminalKeys(plan)
      .map((key) => [key, outcomes.get(key)] as const)
      .filter((entry): entry is [string, Extract<NodeOutcome, { status: "success" }>] => entry[1]?.status === "success")
      .map(([key, outcome]) => [key, outcome.output]),
  );
}

async function recordSkipped(executionId: string, node: GraphNode): Promise<void> {
  const now = new Date();
  await db.insert(executionLogs).values({
    executionId,
    nodeKey: node.key,
    status: "skipped",
    startedAt: now,
    finishedAt: now,
    durationMs: 0,
  });
}

/** Only updates an execution that's still pending/running — lets whichever of (natural completion, timeout, explicit cancel) reaches the database first win, instead of a later write clobbering an already-terminal status. */
async function finalize(
  executionId: string,
  fields: {
    status: Execution["status"];
    output?: unknown;
    error?: unknown;
    finishedAt: Date;
    durationMs: number;
  },
): Promise<void> {
  await db
    .update(executions)
    .set({
      status: fields.status,
      output: (fields.output ?? null) as object | null,
      error: (fields.error ?? null) as object | null,
      finishedAt: fields.finishedAt,
      durationMs: fields.durationMs,
    })
    .where(and(eq(executions.id, executionId), inArray(executions.status, ["pending", "running"])));
}

/**
 * Runs `graph` (already validated into `plan`) for `executionId` to
 * completion, persisting the final status/output/error onto the
 * `executions` row and a running/success/error/skipped `execution_logs` row
 * per node along the way. Never throws — every failure mode (a node
 * erroring, the 5-minute execution timeout, or an explicit cancel request)
 * is caught and turned into a terminal execution status instead.
 */
export async function runExecution(
  executionId: string,
  graph: Graph,
  plan: ExecutionPlan,
  triggerPayload: unknown,
): Promise<void> {
  const controller = new AbortController();
  activeControllers.set(executionId, controller);

  const startedAt = new Date();
  await db
    .update(executions)
    .set({ status: "running", startedAt })
    .where(and(eq(executions.id, executionId), eq(executions.status, "pending")));

  const timeoutTimer = setTimeout(() => {
    controller.abort(new ExecutionTimeoutError());
  }, EXECUTION_TIMEOUT_MS);

  try {
    const outcomes = await walkGraph(executionId, plan, triggerPayload, controller);
    const finishedAt = new Date();
    await finalize(executionId, {
      status: "success",
      output: computeFinalOutput(plan, outcomes),
      finishedAt,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
    });
  } catch (err) {
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();
    const reason = controller.signal.aborted ? controller.signal.reason : err;
    if (reason instanceof ExecutionTimeoutError) {
      await finalize(executionId, {
        status: "timeout",
        error: { message: reason.message },
        finishedAt,
        durationMs,
      });
    } else if (reason instanceof ExecutionCancelledError) {
      await finalize(executionId, {
        status: "cancelled",
        error: { message: reason.message },
        finishedAt,
        durationMs,
      });
    } else {
      const message = err instanceof Error ? err.message : String(err);
      await finalize(executionId, { status: "error", error: { message }, finishedAt, durationMs });
    }
  } finally {
    clearTimeout(timeoutTimer);
    activeControllers.delete(executionId);
  }
}

/**
 * Requests cancellation of a running execution. Returns true if an
 * in-process run was found and asked to stop OR the row itself was still
 * pending/running and got flipped to "cancelled" directly (belt-and-braces:
 * covers the case where the row exists but, for whatever reason, this
 * process has no active controller for it). Returns false if the execution
 * was already terminal.
 */
export async function requestCancellation(executionId: string): Promise<boolean> {
  const controller = activeControllers.get(executionId);
  controller?.abort(new ExecutionCancelledError());

  const result = await db
    .update(executions)
    .set({ status: "cancelled", finishedAt: new Date() })
    .where(and(eq(executions.id, executionId), inArray(executions.status, ["pending", "running"])))
    .returning({ id: executions.id });

  return controller !== undefined || result.length > 0;
}
