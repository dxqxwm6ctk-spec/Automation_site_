/**
 * Workflow CRUD routes — Phase 1.1
 * Mounted at /api/v1/workflows
 *
 * Implements: GET list, POST create, GET :id, PUT :id (new version),
 * PATCH :id (metadata), DELETE :id (soft), GET :id/versions, POST :id/versions/:vid/restore
 */
import { Router } from "express";
import { z } from "zod/v4";
import { and, desc, eq, ilike, isNull, sql } from "drizzle-orm";
import { db, workflows, workflowVersions } from "@workspace/db";
import { validateWorkflowGraph, type WorkflowGraphValidationResult } from "@workspace/node-registry";
import { AppError } from "../../lib/errors";

const router = Router();

// ─── Zod schemas ─────────────────────────────────────────────────────────────

/**
 * Graph JSON shape stored in workflow_versions.graph_json. Mirrors the
 * required/optional split of WorkflowGraphNode/WorkflowGraphConnection in
 * openapi.yaml — `key`/`type` (and `sourceKey`/`targetKey`) are structurally
 * required, `config` stays a loose record so @workspace/node-registry can
 * validate it against the node type's own schema (see
 * `assertValidGraph` below).
 */
const graphNodeSchema = z.object({
  key: z.string(),
  type: z.string(),
  label: z.string().nullable().optional(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

const graphConnectionSchema = z.object({
  sourceKey: z.string(),
  sourceHandle: z.string().nullable().optional(),
  targetKey: z.string(),
  targetHandle: z.string().nullable().optional(),
});

export const graphSchema = z.object({
  nodes: z.array(graphNodeSchema).default([]),
  connections: z.array(graphConnectionSchema).default([]),
});

/** Graph JSON shape, as persisted in `workflow_versions.graph_json`. Reused by the execution engine. */
export type Graph = z.infer<typeof graphSchema>;

const createWorkflowBodySchema = z.object({
  name: z.string().min(1, "name is required").max(255),
  description: z.string().optional(),
  tags: z.array(z.string()).default([]),
  graph: graphSchema.default({ nodes: [], connections: [] }),
});

const putWorkflowBodySchema = z.object({
  graph: graphSchema,
  description: z.string().optional(),
});

const patchWorkflowBodySchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().nullable().optional(),
    tags: z.array(z.string()).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: "At least one field must be provided",
  });

const listQuerySchema = z.object({
  // Accept both ?tags[]=a&tags[]=b and ?tags=a
  tags: z
    .union([z.array(z.string()), z.string()])
    .transform((v) => (Array.isArray(v) ? v : [v]))
    .optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  search: z.string().optional(),
  after: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ─── Cursor helpers ───────────────────────────────────────────────────────────

/** Encodes (createdAt, id) into an opaque base64 cursor. */
function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id })).toString(
    "base64url",
  );
}

/** Returns null on invalid/tampered cursors — treated as no cursor. */
function decodeCursor(raw: string): { createdAt: Date; id: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "createdAt" in parsed &&
      "id" in parsed &&
      typeof (parsed as { createdAt: unknown }).createdAt === "string" &&
      typeof (parsed as { id: unknown }).id === "string"
    ) {
      return {
        createdAt: new Date((parsed as { createdAt: string }).createdAt),
        id: (parsed as { id: string }).id,
      };
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Fetch a non-deleted workflow or throw 404. */
async function getWorkflowOrThrow(workflowId: string) {
  const [workflow] = await db
    .select()
    .from(workflows)
    .where(and(eq(workflows.id, workflowId), isNull(workflows.deletedAt)))
    .limit(1);
  if (!workflow) throw new AppError("NOT_FOUND", `Workflow ${workflowId} not found`);
  return workflow;
}

function formatGraphErrors(errors: WorkflowGraphValidationResult["errors"]): string {
  return errors.map((error) => `${error.nodeId}.${error.field}: ${error.message}`).join("; ");
}

/**
 * Runs the shared node-registry validator over a graph and throws a 422
 * AppError (with per-node/per-field errors in `context.errors`) if any node
 * has an unknown type or a config that fails its type's schema. Called
 * before every graph write so an invalid graph can never be persisted.
 */
function assertValidGraph(graph: z.infer<typeof graphSchema>): void {
  const result = validateWorkflowGraph(graph);
  if (!result.valid) {
    throw new AppError("VALIDATION_ERROR", `Workflow graph is invalid: ${formatGraphErrors(result.errors)}`, {
      errors: result.errors,
    });
  }
}

// ─── GET /v1/workflows ────────────────────────────────────────────────────────

router.get("/", async (req, res) => {
  const query = listQuerySchema.parse({
    // Express parses ?tags[]=a as req.query["tags[]"]
    tags: req.query["tags[]"] ?? req.query.tags,
    isActive: req.query.isActive,
    search: req.query.search,
    after: req.query.after,
    limit: req.query.limit,
  });

  // Base filter conditions (used for both paginated rows and total count)
  const baseConditions = [isNull(workflows.deletedAt)];
  if (query.isActive !== undefined) baseConditions.push(eq(workflows.isActive, query.isActive));
  if (query.search) baseConditions.push(ilike(workflows.name, `%${query.search}%`));
  if (query.tags && query.tags.length > 0) {
    // For each required tag: tag = ANY(tags_column) — workflow must have ALL of them
    for (const tag of query.tags) {
      baseConditions.push(sql`${tag} = ANY(${workflows.tags})`);
    }
  }

  // Cursor condition (excluded from total count)
  const pageConditions = [...baseConditions];
  if (query.after) {
    const cursor = decodeCursor(query.after);
    if (cursor) {
      // Keyset: (createdAt DESC, id DESC) — rows "before" the cursor
      pageConditions.push(
        sql`(${workflows.createdAt}, ${workflows.id}) < (${cursor.createdAt.toISOString()}::timestamptz, ${cursor.id}::uuid)`,
      );
    }
  }

  const [rows, [{ count }]] = await Promise.all([
    db
      .select()
      .from(workflows)
      .where(and(...pageConditions))
      .orderBy(desc(workflows.createdAt), desc(workflows.id))
      .limit(query.limit + 1), // fetch one extra to detect next page
    db
      .select({ count: sql<string>`count(*)` })
      .from(workflows)
      .where(and(...baseConditions)),
  ]);

  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;
  const nextCursor = hasMore
    ? encodeCursor(page[page.length - 1].createdAt, page[page.length - 1].id)
    : null;

  res.json({
    workflows: page.map((w) => ({
      id: w.id,
      name: w.name,
      description: w.description,
      isActive: w.isActive,
      tags: w.tags,
      activeVersionId: w.activeVersionId,
      lastExecutionAt: null, // populated in Phase 1.2 (Executions)
      createdAt: w.createdAt,
      updatedAt: w.updatedAt,
    })),
    nextCursor,
    total: parseInt(count, 10),
  });
});

// ─── POST /v1/workflows ───────────────────────────────────────────────────────

router.post("/", async (req, res) => {
  const body = createWorkflowBodySchema.parse(req.body);
  assertValidGraph(body.graph);

  // 1. Insert workflow (activeVersionId is set after version is created)
  const [workflow] = await db
    .insert(workflows)
    .values({
      name: body.name,
      description: body.description,
      tags: body.tags,
      isActive: false,
    })
    .returning();

  // 2. Insert version 1
  const [version] = await db
    .insert(workflowVersions)
    .values({
      workflowId: workflow.id,
      version: 1,
      graphJson: body.graph,
      description: "Initial version",
    })
    .returning();

  // 3. Point workflow at the new version
  const [updated] = await db
    .update(workflows)
    .set({ activeVersionId: version.id, updatedAt: new Date() })
    .where(eq(workflows.id, workflow.id))
    .returning();

  res.status(201).json({ workflow: updated, version });
});

// ─── GET /v1/workflows/:workflowId ───────────────────────────────────────────

router.get("/:workflowId", async (req, res) => {
  const workflow = await getWorkflowOrThrow(req.params.workflowId);

  let activeVersion = null;
  if (workflow.activeVersionId) {
    const [v] = await db
      .select()
      .from(workflowVersions)
      .where(eq(workflowVersions.id, workflow.activeVersionId))
      .limit(1);
    activeVersion = v ?? null;
  }

  res.json({ workflow, activeVersion });
});

// ─── PUT /v1/workflows/:workflowId ───────────────────────────────────────────
// Saves a new version and sets it as active.

router.put("/:workflowId", async (req, res) => {
  const body = putWorkflowBodySchema.parse(req.body);
  assertValidGraph(body.graph);
  const workflow = await getWorkflowOrThrow(req.params.workflowId);

  // Determine the next version number
  const [maxRow] = await db
    .select({ maxVersion: sql<number>`coalesce(max(version), 0)` })
    .from(workflowVersions)
    .where(eq(workflowVersions.workflowId, workflow.id));

  const nextVersion = (maxRow?.maxVersion ?? 0) + 1;

  const [version] = await db
    .insert(workflowVersions)
    .values({
      workflowId: workflow.id,
      version: nextVersion,
      graphJson: body.graph,
      description: body.description,
    })
    .returning();

  const [updated] = await db
    .update(workflows)
    .set({ activeVersionId: version.id, updatedAt: new Date() })
    .where(eq(workflows.id, workflow.id))
    .returning();

  res.json({
    workflow: updated,
    version: {
      id: version.id,
      version: version.version,
      description: version.description,
      createdAt: version.createdAt,
    },
  });
});

// ─── PATCH /v1/workflows/:workflowId ─────────────────────────────────────────
// Updates metadata (name, description, tags, isActive) — no new version.

router.patch("/:workflowId", async (req, res) => {
  const body = patchWorkflowBodySchema.parse(req.body);
  await getWorkflowOrThrow(req.params.workflowId);

  // Build update object from only the supplied fields
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.tags !== undefined) updates.tags = body.tags;
  if (body.isActive !== undefined) updates.isActive = body.isActive;

  const [updated] = await db
    .update(workflows)
    .set(updates)
    .where(and(eq(workflows.id, req.params.workflowId), isNull(workflows.deletedAt)))
    .returning();

  res.json({ workflow: updated });
});

// ─── DELETE /v1/workflows/:workflowId ────────────────────────────────────────
// Soft-delete: sets deleted_at timestamp.

router.delete("/:workflowId", async (req, res) => {
  await getWorkflowOrThrow(req.params.workflowId);

  await db
    .update(workflows)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(workflows.id, req.params.workflowId));

  res.status(204).send();
});

// ─── GET /v1/workflows/:workflowId/versions ───────────────────────────────────

router.get("/:workflowId/versions", async (req, res) => {
  const workflow = await getWorkflowOrThrow(req.params.workflowId);

  const versions = await db
    .select({
      id: workflowVersions.id,
      version: workflowVersions.version,
      description: workflowVersions.description,
      createdAt: workflowVersions.createdAt,
    })
    .from(workflowVersions)
    .where(eq(workflowVersions.workflowId, workflow.id))
    .orderBy(desc(workflowVersions.version));

  res.json({ versions });
});

// ─── POST /v1/workflows/:workflowId/versions/:versionId/restore ───────────────

router.post("/:workflowId/versions/:versionId/restore", async (req, res) => {
  const workflow = await getWorkflowOrThrow(req.params.workflowId);

  // Verify the version belongs to this workflow
  const [version] = await db
    .select()
    .from(workflowVersions)
    .where(
      and(
        eq(workflowVersions.id, req.params.versionId),
        eq(workflowVersions.workflowId, workflow.id),
      ),
    )
    .limit(1);

  if (!version) {
    throw new AppError(
      "NOT_FOUND",
      `Version ${req.params.versionId} not found for workflow ${workflow.id}`,
    );
  }

  const [updated] = await db
    .update(workflows)
    .set({ activeVersionId: version.id, updatedAt: new Date() })
    .where(eq(workflows.id, workflow.id))
    .returning();

  res.json({ workflow: updated });
});

export default router;
