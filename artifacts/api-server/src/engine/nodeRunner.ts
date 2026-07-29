import { eq } from "drizzle-orm";
import { db, executionLogs } from "@workspace/db";
import { getNodeDefinition } from "@workspace/node-registry";
import type { GraphNode } from "../lib/graph";
import { emitNodeDone, emitNodeStart } from "../realtime/socket";

export interface NodeRunOutcome {
  output: unknown;
  branch?: string;
}

/**
 * Thrown when a node's type isn't registered, or is registered but declares
 * no `execute`. Should never happen for a graph that passed save-time
 * validation (@workspace/node-registry's validateWorkflowGraph already
 * rejects unknown types) — this is a defensive guard, not an expected
 * user-facing failure mode.
 */
export class UnrunnableNodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnrunnableNodeError";
  }
}

/**
 * Runs a single node to completion, recording its `execution_logs` row
 * (running -> success/error) around the call. Rethrows on failure so the
 * caller (the execution engine) decides how that failure affects the rest
 * of the run — the log row is written either way, so the failure is visible
 * in the execution's logs regardless of what happens next.
 */
export async function runNode(
  executionId: string,
  node: GraphNode,
  input: unknown,
  signal: AbortSignal,
): Promise<NodeRunOutcome> {
  const definition = getNodeDefinition(node.type);
  if (!definition?.execute) {
    throw new UnrunnableNodeError(`Node type "${node.type}" cannot be executed`);
  }

  const config = definition.configSchema.parse(node.config ?? {});
  const startedAt = new Date();

  const [log] = await db
    .insert(executionLogs)
    .values({
      executionId,
      nodeKey: node.key,
      status: "running",
      input: (input ?? null) as object | null,
      startedAt,
    })
    .returning({ id: executionLogs.id });

  try {
    const result = await definition.execute({ config, input, signal });
    const finishedAt = new Date();
    await db
      .update(executionLogs)
      .set({
        status: "success",
        output: (result.output ?? null) as object | null,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
      })
      .where(eq(executionLogs.id, log.id));
    return { output: result.output, branch: result.branch };
  } catch (err) {
    const finishedAt = new Date();
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(executionLogs)
      .set({
        status: "error",
        error: { message, name: err instanceof Error ? err.name : "Error" },
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
      })
      .where(eq(executionLogs.id, log.id));
    throw err instanceof Error ? err : new Error(message);
  }
}
