/**
 * Workspace-level variables CRUD — Phase 2.2
 * Mounted at /api/v1/variables
 *
 * Variables are injected as `$vars.<key>` into every node's execution
 * context. Secret variables are stored as plaintext but their values are
 * masked (replaced with "***") in API responses — they are only resolved
 * inside the execution engine.
 */
import { Router } from "express";
import { z } from "zod/v4";
import { eq } from "drizzle-orm";
import { db, variables } from "@workspace/db";
import { AppError } from "../../lib/errors";
import { requireAuth } from "../../middlewares/requireAuth";

const router = Router();

router.use(requireAuth);

const MASKED = "***";

function toPublic(row: typeof variables.$inferSelect) {
  return {
    id: row.id,
    key: row.key,
    value: row.isSecret ? MASKED : row.value,
    isSecret: row.isSecret,
    description: row.description,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ─── GET /v1/variables ───────────────────────────────────────────────────────

router.get("/", async (_req, res) => {
  const rows = await db.select().from(variables).orderBy(variables.key);
  res.json({ variables: rows.map(toPublic) });
});

// ─── POST /v1/variables ──────────────────────────────────────────────────────

const createBody = z.object({
  key: z
    .string()
    .min(1, "Key is required")
    .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "Key must be a valid identifier (letters, digits, _)"),
  value: z.string().default(""),
  isSecret: z.boolean().default(false),
  description: z.string().optional(),
});

router.post("/", async (req, res) => {
  const body = createBody.parse(req.body);

  const [existing] = await db
    .select({ id: variables.id })
    .from(variables)
    .where(eq(variables.key, body.key))
    .limit(1);
  if (existing) {
    throw new AppError("CONFLICT", `A variable with key "${body.key}" already exists`);
  }

  const [row] = await db
    .insert(variables)
    .values({ key: body.key, value: body.value, isSecret: body.isSecret, description: body.description ?? null })
    .returning();

  res.status(201).json({ variable: toPublic(row) });
});

// ─── GET /v1/variables/:variableId ───────────────────────────────────────────

router.get("/:variableId", async (req, res) => {
  const [row] = await db
    .select()
    .from(variables)
    .where(eq(variables.id, req.params.variableId))
    .limit(1);
  if (!row) throw new AppError("NOT_FOUND", `Variable ${req.params.variableId} not found`);
  res.json({ variable: toPublic(row) });
});

// ─── PATCH /v1/variables/:variableId ─────────────────────────────────────────

const patchBody = z.object({
  value: z.string().optional(),
  isSecret: z.boolean().optional(),
  description: z.string().nullable().optional(),
});

router.patch("/:variableId", async (req, res) => {
  const body = patchBody.parse(req.body);

  const [existing] = await db
    .select()
    .from(variables)
    .where(eq(variables.id, req.params.variableId))
    .limit(1);
  if (!existing) throw new AppError("NOT_FOUND", `Variable ${req.params.variableId} not found`);

  const updates: Partial<typeof variables.$inferInsert> = { updatedAt: new Date() };
  if (body.value !== undefined) updates.value = body.value;
  if (body.isSecret !== undefined) updates.isSecret = body.isSecret;
  if (body.description !== undefined) updates.description = body.description;

  const [updated] = await db
    .update(variables)
    .set(updates)
    .where(eq(variables.id, req.params.variableId))
    .returning();

  res.json({ variable: toPublic(updated) });
});

// ─── DELETE /v1/variables/:variableId ────────────────────────────────────────

router.delete("/:variableId", async (req, res) => {
  const [existing] = await db
    .select({ id: variables.id })
    .from(variables)
    .where(eq(variables.id, req.params.variableId))
    .limit(1);
  if (!existing) throw new AppError("NOT_FOUND", `Variable ${req.params.variableId} not found`);

  await db.delete(variables).where(eq(variables.id, req.params.variableId));
  res.status(204).send();
});

export default router;
