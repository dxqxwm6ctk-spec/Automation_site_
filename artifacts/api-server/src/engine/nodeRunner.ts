import { and, eq, isNull } from "drizzle-orm";
import { db, executionLogs, credentials } from "@workspace/db";
import { getNodeDefinition } from "@workspace/node-registry";
import type { GraphNode } from "../lib/graph";
import { emitNodeDone, emitNodeStart } from "../realtime/socket";
import { decryptSecretData } from "../lib/crypto";

/**
 * Resolves an http_request node's `auth.type === "credential"` into a
 * concrete basic/bearer shape by decrypting the referenced credential. Kept
 * here (Node-only, api-server-only) rather than in @workspace/node-registry
 * so the shared registry package never needs DB access — it's also bundled
 * into the browser for config validation.
 */
async function resolveHttpRequestConfig(
  config: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!("auth" in config)) return config;
  const auth = config["auth"];
  if (
    typeof auth !== "object" ||
    auth === null ||
    (auth as { type?: unknown }).type !== "credential"
  ) {
    return config;
  }

  const credentialId = (auth as { credentialId?: unknown }).credentialId;
  if (typeof credentialId !== "string") {
    throw new Error("HTTP Request auth references a credential but no credentialId was set");
  }

  const [credential] = await db
    .select()
    .from(credentials)
    .where(and(eq(credentials.id, credentialId), isNull(credentials.deletedAt)))
    .limit(1);
  if (!credential) {
    throw new Error(`Credential ${credentialId} not found or has been deleted`);
  }

  const data = decryptSecretData({
    dataEncrypted: credential.dataEncrypted,
    dataIv: credential.dataIv,
  });

  if (credential.credentialType === "basic") {
    return {
      ...config,
      auth: { type: "basic", username: data["username"] ?? "", password: data["password"] ?? "" },
    };
  }
  if (credential.credentialType === "bearer") {
    return { ...config, auth: { type: "bearer", token: data["token"] ?? "" } };
  }
  throw new Error(
    `Credential "${credential.name}" has type "${credential.credentialType}", which HTTP Request auth cannot use (expected "basic" or "bearer")`,
  );
}

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

/** Sleep helper for retry backoff. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new Error("Aborted")); return; }
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => { clearTimeout(t); reject(new Error("Aborted")); }, { once: true });
  });
}

/**
 * Runs a single node to completion, recording its `execution_logs` row
 * (running -> success/error) around the call. Supports automatic retry
 * via node.retry.maxAttempts / node.retry.backoffMs. Each attempt gets its
 * own log row. Rethrows on final failure so the caller (the execution engine)
 * decides how that failure affects the rest of the run.
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

  // Retry config can come from the top-level `node.retry` field (graph schema)
  // or from `node.config.__retry` (set by the frontend via the NodeInspector UI).
  const configRetry = node.config?.__retry as { maxAttempts?: number; backoffMs?: number } | undefined;
  const retrySource = node.retry ?? (configRetry ? { maxAttempts: configRetry.maxAttempts ?? 1, backoffMs: configRetry.backoffMs ?? 1000 } : undefined);
  const maxAttempts = retrySource?.maxAttempts ?? 1;
  const backoffMs = retrySource?.backoffMs ?? 1_000;

  let config = definition.configSchema.parse(node.config ?? {});
  if (node.type === "http_request") {
    config = await resolveHttpRequestConfig(config);
  }

  let lastError: Error = new Error("Unknown error");

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Back off before retrying (not before the first attempt)
    if (attempt > 1) {
      try {
        await sleep(backoffMs, signal);
      } catch {
        throw new Error(`Execution cancelled during retry backoff`);
      }
    }

    const startedAt = new Date();

    const [log] = await db
      .insert(executionLogs)
      .values({
        executionId,
        nodeKey: node.key,
        status: "running",
        input: (input ?? null) as object | null,
        attempt,
        startedAt,
      })
      .returning({ id: executionLogs.id });

    // Only emit node start on the first attempt (avoids duplicate overlay pulses)
    if (attempt === 1) {
      emitNodeStart({ executionId, nodeKey: node.key });
    }

    try {
      const result = await definition.execute({ config, input, signal });
      const finishedAt = new Date();
      const durationMs = finishedAt.getTime() - startedAt.getTime();
      await db
        .update(executionLogs)
        .set({
          status: "success",
          output: (result.output ?? null) as object | null,
          finishedAt,
          durationMs,
        })
        .where(eq(executionLogs.id, log.id));
      emitNodeDone({ executionId, nodeKey: node.key, status: "success", durationMs, output: result.output });
      return { output: result.output, branch: result.branch };
    } catch (err) {
      const finishedAt = new Date();
      const durationMs = finishedAt.getTime() - startedAt.getTime();
      lastError = err instanceof Error ? err : new Error(String(err));
      const message = lastError.message;

      const isFinalAttempt = attempt >= maxAttempts;
      await db
        .update(executionLogs)
        .set({
          status: isFinalAttempt ? "error" : "error",
          error: { message, name: lastError.name, attempt, willRetry: !isFinalAttempt },
          finishedAt,
          durationMs,
        })
        .where(eq(executionLogs.id, log.id));

      if (isFinalAttempt) {
        emitNodeDone({ executionId, nodeKey: node.key, status: "error", durationMs, error: { message } });
        throw lastError;
      }
      // Will retry — emit a transient error state so the overlay shows the retry
      emitNodeDone({ executionId, nodeKey: node.key, status: "error", durationMs, error: { message } });
    }
  }

  // Unreachable, but TypeScript needs it
  throw lastError;
}
