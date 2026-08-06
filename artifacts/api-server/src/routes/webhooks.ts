/**
 * Inbound webhook receiver — Phase 1.5
 * Mounted at /api/webhooks (NOT under /v1 — this path is public-facing and
 * must stay stable for external callers).
 *
 * External systems POST (or GET) to /api/webhooks/:token to trigger a workflow.
 * The token is generated during webhook creation (POST /api/v1/webhooks).
 *
 * Response modes:
 *   - immediate (default): returns 202 immediately after the execution is
 *     created; callers should poll GET /api/v1/executions/:id for the result.
 *   - wait_for_completion: awaits the full engine run before responding; the
 *     final execution row (with status/output/error) is returned once done.
 */
import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, webhooks, workflows, workflowVersions, executions } from "@workspace/db";
import { AppError } from "../lib/errors";
import { graphSchema } from "../lib/graph";
import { buildExecutionPlan, GraphStructureError } from "../engine/graphBuilder";
import { runExecution } from "../engine/executionEngine";
import { isQueueReady, enqueueExecution } from "../queue";

const router = Router();

async function handleInboundWebhook(
  req: import("express").Request,
  res: import("express").Response,
  token: string,
): Promise<void> {
  // 1. Look up the webhook by token.
  const [webhook] = await db
    .select()
    .from(webhooks)
    .where(eq(webhooks.token, token))
    .limit(1);
  if (!webhook) throw new AppError("NOT_FOUND", "Webhook not found");
  if (!webhook.isActive) throw new AppError("CONFLICT", "Webhook is inactive");

  // 2. Load the associated workflow and its active version.
  const [workflow] = await db
    .select()
    .from(workflows)
    .where(eq(workflows.id, webhook.workflowId))
    .limit(1);
  if (!workflow) throw new AppError("NOT_FOUND", "Workflow not found");
  if (!workflow.activeVersionId) {
    throw new AppError("EXECUTION_FAILED", "Workflow has no active version to execute");
  }

  const [version] = await db
    .select()
    .from(workflowVersions)
    .where(eq(workflowVersions.id, workflow.activeVersionId))
    .limit(1);
  if (!version) {
    throw new AppError("EXECUTION_FAILED", "Active workflow version could not be found");
  }

  // 3. Parse and plan the graph.
  const graph = graphSchema.parse(version.graphJson);
  let plan;
  try {
    plan = buildExecutionPlan(graph);
  } catch (err) {
    if (!(err instanceof GraphStructureError)) throw err;
    throw new AppError("EXECUTION_FAILED", err.message);
  }

  // 4. The trigger payload is the full request body (or query params for GET).
  const triggerPayload =
    req.method === "GET"
      ? (Object.keys(req.query).length > 0 ? req.query : null)
      : ((req.body as object | null | undefined) ?? null);

  // 5. Create the execution row.
  const [execution] = await db
    .insert(executions)
    .values({
      workflowId: workflow.id,
      versionId: version.id,
      status: "pending",
      triggerType: "webhook",
      triggerPayload: triggerPayload as object | null,
    })
    .returning();

  // 6. Update lastTriggeredAt on the webhook.
  void db
    .update(webhooks)
    .set({ lastTriggeredAt: new Date() })
    .where(eq(webhooks.id, webhook.id));

  if (webhook.responseMode === "wait_for_completion") {
    // wait_for_completion always runs in-process (we need the result now).
    await runExecution(execution.id, graph, plan, triggerPayload, workflow.userId);
    const [finished] = await db
      .select()
      .from(executions)
      .where(eq(executions.id, execution.id))
      .limit(1);
    res.status(webhook.responseStatus).json({ execution: finished ?? execution });
  } else {
    // Immediate mode: use BullMQ queue when available, otherwise in-process.
    if (isQueueReady()) {
      await enqueueExecution({
        executionId: execution.id,
        graphJson: version.graphJson,
        triggerPayload,
        userId: workflow.userId,
      });
    } else {
      void runExecution(execution.id, graph, plan, triggerPayload, workflow.userId).catch(
        (err: unknown) => {
          req.log.error({ err, executionId: execution.id }, "Unhandled webhook execution error");
        },
      );
    }
    res.status(202).json({ execution });
  }
}

// Accept both POST and GET so the URL can be tested from a browser.
router.post("/:token", (req, res) => handleInboundWebhook(req, res, req.params.token));
router.get("/:token", (req, res) => handleInboundWebhook(req, res, req.params.token));

export default router;
