/**
 * Schedule CRUD — Phase 2.1
 * Mounted at /api/v1/schedules
 *
 * Schedules are linked 1-to-1 with a workflow. Creating or updating a
 * schedule also arms/re-arms the in-process cron timer via schedulerService.
 * Deleting a schedule cancels the timer and removes the DB row.
 */
import { Router } from "express";
import { z } from "zod/v4";
import { and, eq, isNull } from "drizzle-orm";
import { db, schedules, workflows } from "@workspace/db";
import { AppError } from "../../lib/errors";
import {
  scheduleWorkflow,
  unscheduleWorkflow,
} from "../../scheduler/schedulerService";
import { CronExpressionParser } from "cron-parser";
import { requireAuth } from "../../middlewares/requireAuth";

const router = Router();

router.use(requireAuth);

/** Validate a cron expression; throws AppError on invalid. */
function assertValidCron(expr: string) {
  try {
    CronExpressionParser.parse(expr);
  } catch {
    throw new AppError("VALIDATION_ERROR", `Invalid cron expression: "${expr}"`);
  }
}

/** Compute the ISO timestamp of the next cron tick. */
function nextRunIso(expr: string, tz: string): string {
  try {
    const it = CronExpressionParser.parse(expr, { tz });
    return it.next().toDate().toISOString();
  } catch {
    return new Date(Date.now() + 60_000).toISOString();
  }
}

function toPublic(row: typeof schedules.$inferSelect) {
  return {
    id: row.id,
    workflowId: row.workflowId,
    cronExpression: row.cronExpression,
    timezone: row.timezone,
    isActive: row.isActive,
    lastRunAt: row.lastRunAt,
    nextRunAt: row.nextRunAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ─── GET /v1/schedules ────────────────────────────────────────────────────────

router.get("/", async (req, res) => {
  const workflowId = typeof req.query["workflowId"] === "string" ? req.query["workflowId"] : undefined;

  const rows = workflowId
    ? await db.select().from(schedules).where(eq(schedules.workflowId, workflowId)).orderBy(schedules.createdAt)
    : await db.select().from(schedules).orderBy(schedules.createdAt);

  res.json({ schedules: rows.map(toPublic) });
});

// ─── POST /v1/schedules ───────────────────────────────────────────────────────

const createBody = z.object({
  workflowId: z.string().uuid("workflowId must be a UUID"),
  cronExpression: z.string().min(1, "cronExpression is required"),
  timezone: z.string().default("UTC"),
  isActive: z.boolean().default(true),
});

router.post("/", async (req, res) => {
  const body = createBody.parse(req.body);
  assertValidCron(body.cronExpression);

  // Verify workflow exists and belongs to the authenticated user
  const userId = req.user!.id;
  const [workflow] = await db
    .select({ id: workflows.id })
    .from(workflows)
    .where(and(eq(workflows.id, body.workflowId), eq(workflows.userId, userId), isNull(workflows.deletedAt)))
    .limit(1);
  if (!workflow) throw new AppError("NOT_FOUND", `Workflow ${body.workflowId} not found`);

  // One schedule per workflow
  const [existing] = await db
    .select({ id: schedules.id })
    .from(schedules)
    .where(eq(schedules.workflowId, body.workflowId))
    .limit(1);
  if (existing) {
    throw new AppError("CONFLICT", `Workflow ${body.workflowId} already has a schedule. Use PATCH to update it.`);
  }

  const nextRunAt: Date | null = body.isActive ? new Date(nextRunIso(body.cronExpression, body.timezone)) : null;

  const [row] = await db
    .insert(schedules)
    .values({
      workflowId: body.workflowId,
      cronExpression: body.cronExpression,
      timezone: body.timezone,
      isActive: body.isActive,
      nextRunAt,
    })
    .returning();

  if (row.isActive) {
    scheduleWorkflow(row.workflowId, row.cronExpression, row.timezone);
  }

  res.status(201).json({ schedule: toPublic(row) });
});

// ─── GET /v1/schedules/:scheduleId ───────────────────────────────────────────

router.get("/:scheduleId", async (req, res) => {
  const [row] = await db
    .select()
    .from(schedules)
    .where(eq(schedules.id, req.params.scheduleId))
    .limit(1);
  if (!row) throw new AppError("NOT_FOUND", `Schedule ${req.params.scheduleId} not found`);
  res.json({ schedule: toPublic(row) });
});

// ─── PATCH /v1/schedules/:scheduleId ─────────────────────────────────────────

const patchBody = z.object({
  cronExpression: z.string().optional(),
  timezone: z.string().optional(),
  isActive: z.boolean().optional(),
});

router.patch("/:scheduleId", async (req, res) => {
  const body = patchBody.parse(req.body);

  const [existing] = await db
    .select()
    .from(schedules)
    .where(eq(schedules.id, req.params.scheduleId))
    .limit(1);
  if (!existing) throw new AppError("NOT_FOUND", `Schedule ${req.params.scheduleId} not found`);

  const cronExpression = body.cronExpression ?? existing.cronExpression;
  const timezone = body.timezone ?? existing.timezone;
  const isActive = body.isActive ?? existing.isActive;

  if (body.cronExpression) assertValidCron(cronExpression);

  const nextRunAt = isActive ? new Date(nextRunIso(cronExpression, timezone)) : null;

  const [updated] = await db
    .update(schedules)
    .set({ cronExpression, timezone, isActive, nextRunAt, updatedAt: new Date() })
    .where(eq(schedules.id, req.params.scheduleId))
    .returning();

  // Re-arm or cancel the in-process scheduler
  if (updated.isActive) {
    scheduleWorkflow(updated.workflowId, updated.cronExpression, updated.timezone);
  } else {
    unscheduleWorkflow(updated.workflowId);
  }

  res.json({ schedule: toPublic(updated) });
});

// ─── DELETE /v1/schedules/:scheduleId ────────────────────────────────────────

router.delete("/:scheduleId", async (req, res) => {
  const [existing] = await db
    .select()
    .from(schedules)
    .where(eq(schedules.id, req.params.scheduleId))
    .limit(1);
  if (!existing) throw new AppError("NOT_FOUND", `Schedule ${req.params.scheduleId} not found`);

  unscheduleWorkflow(existing.workflowId);
  await db.delete(schedules).where(eq(schedules.id, req.params.scheduleId));
  res.status(204).send();
});

export default router;
