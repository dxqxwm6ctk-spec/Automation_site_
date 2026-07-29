/**
 * Execution routes — Phase 1.4
 * Mounted at /api/v1/executions
 *
 * Implements: GET list, GET :id (with its node-level logs), POST :id/cancel.
 * Executions themselves are created by POST /v1/workflows/:workflowId/execute
 * (see routes/v1/workflows.ts) — there's no direct "create" here.
 */
import { Router } from "express";
import { z } from "zod/v4";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db, executionLogs, executions, EXECUTION_STATUSES } from "@workspace/db";
import { AppError } from "../../lib/errors";
import { decodeCursor, encodeCursor } from "../../lib/cursor";
import { requestCancellation } from "../../engine/executionEngine";

const router = Router();

const listQuerySchema = z.object({
  workflowId: z.string().uuid().optional(),
  status: z.enum(EXECUTION_STATUSES).optional(),
  after: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ─── GET /v1/executions ───────────────────────────────────────────────────────

router.get("/", async (req, res) => {
  const query = listQuerySchema.parse({
    workflowId: req.query.workflowId,
    status: req.query.status,
    after: req.query.after,
    limit: req.query.limit,
  });

  const baseConditions = [];
  if (query.workflowId) baseConditions.push(eq(executions.workflowId, query.workflowId));
  if (query.status) baseConditions.push(eq(executions.status, query.status));

  const pageConditions = [...baseConditions];
  if (query.after) {
    const cursor = decodeCursor(query.after);
    if (cursor) {
      pageConditions.push(
        sql`(${executions.createdAt}, ${executions.id}) < (${cursor.createdAt.toISOString()}::timestamptz, ${cursor.id}::uuid)`,
      );
    }
  }

  const [rows, [{ count }]] = await Promise.all([
    db
      .select()
      .from(executions)
      .where(pageConditions.length > 0 ? and(...pageConditions) : undefined)
      .orderBy(desc(executions.createdAt), desc(executions.id))
      .limit(query.limit + 1),
    db
      .select({ count: sql<string>`count(*)` })
      .from(executions)
      .where(baseConditions.length > 0 ? and(...baseConditions) : undefined),
  ]);

  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;
  const nextCursor = hasMore
    ? encodeCursor(page[page.length - 1].createdAt, page[page.length - 1].id)
    : null;

  res.json({ executions: page, nextCursor, total: parseInt(count, 10) });
});

// ─── GET /v1/executions/:executionId ──────────────────────────────────────────

router.get("/:executionId", async (req, res) => {
  const [execution] = await db
    .select()
    .from(executions)
    .where(eq(executions.id, req.params.executionId))
    .limit(1);
  if (!execution) throw new AppError("NOT_FOUND", `Execution ${req.params.executionId} not found`);

  const logs = await db
    .select()
    .from(executionLogs)
    .where(eq(executionLogs.executionId, execution.id))
    .orderBy(asc(executionLogs.startedAt), asc(executionLogs.createdAt));

  res.json({ execution, logs });
});

// ─── POST /v1/executions/:executionId/cancel ─────────────────────────────────

router.post("/:executionId/cancel", async (req, res) => {
  const [execution] = await db
    .select()
    .from(executions)
    .where(eq(executions.id, req.params.executionId))
    .limit(1);
  if (!execution) throw new AppError("NOT_FOUND", `Execution ${req.params.executionId} not found`);

  if (execution.status !== "pending" && execution.status !== "running") {
    throw new AppError(
      "CONFLICT",
      `Execution ${execution.id} already finished with status "${execution.status}" and cannot be cancelled`,
    );
  }

  await requestCancellation(execution.id);

  const [updated] = await db.select().from(executions).where(eq(executions.id, execution.id)).limit(1);
  res.json({ execution: updated });
});

export default router;
