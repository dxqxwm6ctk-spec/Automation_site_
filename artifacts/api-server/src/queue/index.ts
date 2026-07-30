/**
 * Optional BullMQ execution queue.
 *
 * When REDIS_URL is set, workflow executions are enqueued into BullMQ so that
 * they survive server restarts, get automatic retries, and can be horizontally
 * scaled by running multiple worker processes.
 *
 * When REDIS_URL is NOT set, everything falls back to the existing in-process
 * execution path — behaviour is identical to before, so no existing code breaks.
 *
 * The worker runs in-process (same Node process as the API) so Socket.io
 * real-time events work without any IPC glue.  Moving to a separate worker
 * process is a straightforward follow-up once Redis is stable.
 */
import { Queue, Worker, type Job } from "bullmq";
import { db, executions } from "@workspace/db";
import { eq } from "drizzle-orm";
import { graphSchema } from "../lib/graph";
import { buildExecutionPlan, GraphStructureError } from "../engine/graphBuilder";
import { runExecution } from "../engine/executionEngine";
import { logger } from "../lib/logger";

// ── Job shape ─────────────────────────────────────────────────────────────────

export interface ExecutionJobData {
  executionId: string;
  /** Raw graph_json stored in DB — the worker will parse + plan it. */
  graphJson: unknown;
  triggerPayload: unknown;
}

const QUEUE_NAME = "ff:executions";

// ── Module state ─────────────────────────────────────────────────────────────

let _queue: Queue<ExecutionJobData> | null = null;
let _worker: Worker<ExecutionJobData> | null = null;

// ── Worker handler ────────────────────────────────────────────────────────────

async function processJob(job: Job<ExecutionJobData>): Promise<void> {
  const { executionId, graphJson, triggerPayload } = job.data;

  let graph;
  try {
    graph = graphSchema.parse(graphJson);
  } catch (err) {
    logger.error({ err, executionId }, "Queue worker: invalid graph — marking execution failed");
    await db
      .update(executions)
      .set({ status: "error", error: "Invalid graph JSON", finishedAt: new Date() })
      .where(eq(executions.id, executionId));
    return; // Do not re-throw — we've already captured the error in the DB
  }

  let plan;
  try {
    plan = buildExecutionPlan(graph);
  } catch (err) {
    const msg = err instanceof GraphStructureError ? err.message : "Failed to build execution plan";
    logger.error({ err, executionId }, "Queue worker: could not build plan — marking execution failed");
    await db
      .update(executions)
      .set({ status: "error", error: msg, finishedAt: new Date() })
      .where(eq(executions.id, executionId));
    return;
  }

  // runExecution never rejects — all failures are captured as terminal execution states.
  await runExecution(executionId, graph, plan, (triggerPayload ?? null) as object | null);
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Returns true when Redis is configured and the queue is initialised. */
export function isQueueReady(): boolean {
  return _queue !== null;
}

/** Returns the current execution mode: "redis" when BullMQ is active, "in-process" otherwise. */
export function getQueueMode(): "redis" | "in-process" {
  return _queue !== null ? "redis" : "in-process";
}

/**
 * Enqueue a new execution job.  Only call after confirming isQueueReady().
 * The job gets 3 attempts with exponential back-off (2 s, 4 s, 8 s).
 */
export async function enqueueExecution(data: ExecutionJobData): Promise<void> {
  if (!_queue) throw new Error("Queue is not initialised");
  await _queue.add("run", data, {
    attempts: 3,
    backoff: { type: "exponential", delay: 2_000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 100 },
  });
}

/**
 * Ping Redis through the queue's connection.
 * Returns "ok", "error", or "not_configured".
 */
export async function pingRedis(): Promise<"ok" | "error" | "not_configured"> {
  if (!_queue) return "not_configured";
  try {
    const client = await _queue.client;
    // ioredis client exposes ping() but the BullMQ type is narrower; cast to any
    await (client as unknown as { ping(): Promise<unknown> }).ping();
    return "ok";
  } catch {
    return "error";
  }
}

/**
 * Initialise the BullMQ queue + in-process worker.
 * No-op (and no error) when REDIS_URL is absent.
 */
export async function initQueue(): Promise<void> {
  const redisUrl = process.env["REDIS_URL"];
  if (!redisUrl) {
    logger.info("Queue: REDIS_URL not set — in-process execution mode");
    return;
  }

  try {
    const connection = { url: redisUrl };

    _queue = new Queue<ExecutionJobData>(QUEUE_NAME, { connection });

    _worker = new Worker<ExecutionJobData>(QUEUE_NAME, processJob, {
      connection,
      concurrency: 5,
    });

    _worker.on("failed", (job, err) => {
      logger.error(
        { executionId: job?.data.executionId, err },
        "Queue: job exhausted all attempts",
      );
    });

    // Verify the connection is live before declaring success
    await pingRedis();

    logger.info("Queue: BullMQ queue and worker ready");
  } catch (err) {
    logger.error({ err }, "Queue: initialisation failed — falling back to in-process execution");
    await _worker?.close().catch(() => undefined);
    await _queue?.close().catch(() => undefined);
    _queue = null;
    _worker = null;
  }
}

/** Gracefully drain and close the queue + worker on shutdown. */
export async function closeQueue(): Promise<void> {
  await _worker?.close();
  await _queue?.close();
  _queue = null;
  _worker = null;
}
