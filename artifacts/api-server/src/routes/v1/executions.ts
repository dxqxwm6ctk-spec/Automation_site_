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
import { db, executionLogs, executions, workflows, EXECUTION_STATUSES } from "@workspace/db";
import { AppError } from "../../lib/errors";
import { decodeCursor, encodeCursor } from "../../lib/cursor";
import { requestCancellation } from "../../engine/executionEngine";
import { requireAuth } from "../../middlewares/requireAuth";

const router = Router();

router.use(requireAuth);

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

  const userId = req.user!.id;

  // Always join with workflows so results are scoped to the authenticated user.
  const baseConditions = [eq(workflows.userId, userId)];
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
      .select({ execution: executions })
      .from(executions)
      .innerJoin(workflows, eq(executions.workflowId, workflows.id))
      .where(and(...pageConditions))
      .orderBy(desc(executions.createdAt), desc(executions.id))
      .limit(query.limit + 1),
    db
      .select({ count: sql<string>`count(*)` })
      .from(executions)
      .innerJoin(workflows, eq(executions.workflowId, workflows.id))
      .where(and(...baseConditions)),
  ]);

  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;
  const nextCursor = hasMore
    ? encodeCursor(page[page.length - 1].execution.createdAt, page[page.length - 1].execution.id)
    : null;

  res.json({
    executions: page.map((r) => r.execution),
    nextCursor,
    total: parseInt(count, 10),
  });
});

// ─── GET /v1/executions/:executionId ──────────────────────────────────────────

router.get("/:executionId", async (req, res) => {
  const userId = req.user!.id;

  const [row] = await db
    .select({ execution: executions })
    .from(executions)
    .innerJoin(workflows, eq(executions.workflowId, workflows.id))
    .where(and(eq(executions.id, req.params.executionId), eq(workflows.userId, userId)))
    .limit(1);
  if (!row) throw new AppError("NOT_FOUND", `Execution ${req.params.executionId} not found`);

  const logs = await db
    .select()
    .from(executionLogs)
    .where(eq(executionLogs.executionId, row.execution.id))
    .orderBy(asc(executionLogs.startedAt), asc(executionLogs.createdAt));

  res.json({ execution: row.execution, logs });
});

// ─── POST /v1/executions/:executionId/cancel ─────────────────────────────────

router.post("/:executionId/cancel", async (req, res) => {
  const userId = req.user!.id;

  const [row] = await db
    .select({ execution: executions })
    .from(executions)
    .innerJoin(workflows, eq(executions.workflowId, workflows.id))
    .where(and(eq(executions.id, req.params.executionId), eq(workflows.userId, userId)))
    .limit(1);
  if (!row) throw new AppError("NOT_FOUND", `Execution ${req.params.executionId} not found`);

  const { execution } = row;

  if (execution.status !== "pending" && execution.status !== "running") {
    throw new AppError(
      "CONFLICT",
      `Execution ${execution.id} already finished with status "${execution.status}" and cannot be cancelled`,
    );
  }

  await requestCancellation(execution.id);

  const [updated] = await db
    .select({ execution: executions })
    .from(executions)
    .innerJoin(workflows, eq(executions.workflowId, workflows.id))
    .where(and(eq(executions.id, execution.id), eq(workflows.userId, userId)))
    .limit(1);
  res.json({ execution: updated?.execution });
});

export default router;
