/**
 * Webhook management CRUD — Phase 1.5
 * Mounted at /api/v1/webhooks
 *
 * Manages webhook registrations. Inbound HTTP delivery is handled by
 * the receiver in routes/webhooks.ts (mounted at /api/webhooks/:token).
 */
import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod/v4";
import { eq } from "drizzle-orm";
import { db, webhooks, workflows, WEBHOOK_RESPONSE_MODES } from "@workspace/db";
import { AppError } from "../../lib/errors";

const router = Router();

// ─── GET /v1/webhooks ─────────────────────────────────────────────────────────

const listQuerySchema = z.object({
  workflowId: z.string().uuid().optional(),
});

router.get("/", async (req, res) => {
  const query = listQuerySchema.parse({ workflowId: req.query.workflowId });
  const rows = await db
    .select()
    .from(webhooks)
    .where(query.workflowId ? eq(webhooks.workflowId, query.workflowId) : undefined)
    .orderBy(webhooks.createdAt);
  res.json({ webhooks: rows });
});

// ─── POST /v1/webhooks ────────────────────────────────────────────────────────

const createWebhookBodySchema = z.object({
  workflowId: z.string().uuid(),
  method: z.string().default("POST"),
  responseMode: z.enum(WEBHOOK_RESPONSE_MODES).default("immediate"),
});

router.post("/", async (req, res) => {
  const body = createWebhookBodySchema.parse(req.body);

  const [workflow] = await db
    .select({ id: workflows.id })
    .from(workflows)
    .where(eq(workflows.id, body.workflowId))
    .limit(1);
  if (!workflow) throw new AppError("NOT_FOUND", `Workflow ${body.workflowId} not found`);

  const token = `wh_${crypto.randomUUID().replace(/-/g, "")}`;
  const [webhook] = await db
    .insert(webhooks)
    .values({
      workflowId: body.workflowId,
      token,
      method: body.method,
      responseMode: body.responseMode,
    })
    .returning();

  res.status(201).json({ webhook });
});

// ─── GET /v1/webhooks/:webhookId ──────────────────────────────────────────────

router.get("/:webhookId", async (req, res) => {
  const [webhook] = await db
    .select()
    .from(webhooks)
    .where(eq(webhooks.id, req.params.webhookId))
    .limit(1);
  if (!webhook) throw new AppError("NOT_FOUND", `Webhook ${req.params.webhookId} not found`);
  res.json({ webhook });
});

// ─── DELETE /v1/webhooks/:webhookId ───────────────────────────────────────────

router.delete("/:webhookId", async (req, res) => {
  const [webhook] = await db
    .select({ id: webhooks.id })
    .from(webhooks)
    .where(eq(webhooks.id, req.params.webhookId))
    .limit(1);
  if (!webhook) throw new AppError("NOT_FOUND", `Webhook ${req.params.webhookId} not found`);

  await db.delete(webhooks).where(eq(webhooks.id, webhook.id));
  res.status(204).send();
});

export default router;
