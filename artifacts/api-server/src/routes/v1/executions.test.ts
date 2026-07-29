/**
 * Execution API tests — Phase 1.4
 *
 * Tests run against the live dev database.  Every workflow/execution created
 * here is hard-deleted in afterAll so the database stays clean between runs.
 *
 * Execution engine runs fire-and-forget in-process.  For tests that need the
 * engine to reach a terminal status (success / error) we poll
 * waitForTerminal() rather than adding an arbitrary sleep — it retries up to
 * 50 × 20 ms = 1 s, which is plenty for the tiny graphs used here.
 */
import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import { db, executions, pool, workflows } from "@workspace/db";
import app from "../../app";

// ─── Cleanup registry ────────────────────────────────────────────────────────

const createdWorkflowIds: string[] = [];

afterAll(async () => {
  if (createdWorkflowIds.length > 0) {
    // execution_logs cascade-delete when their execution is deleted (onDelete: "cascade").
    // executions.workflow_id has NO cascade, so delete executions first, then workflows.
    await db.delete(executions).where(inArray(executions.workflowId, createdWorkflowIds));
    for (const id of createdWorkflowIds) {
      await db.delete(workflows).where(eq(workflows.id, id));
    }
  }
  await pool.end();
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** A minimal two-node graph that executes instantly: start → end. */
const INSTANT_GRAPH = {
  nodes: [
    { key: "s", type: "start" },
    { key: "e", type: "end" },
  ],
  connections: [{ sourceKey: "s", targetKey: "e" }],
};

/** A graph whose "if" node always routes true: start → if → end. */
const IF_TRUE_GRAPH = {
  nodes: [
    { key: "s", type: "start" },
    { key: "cond", type: "if", config: { condition: "true" } },
    { key: "e", type: "end" },
  ],
  connections: [
    { sourceKey: "s", targetKey: "cond" },
    { sourceKey: "cond", sourceHandle: "true", targetKey: "e" },
  ],
};

async function createTestWorkflow(graph: object = INSTANT_GRAPH): Promise<string> {
  const res = await request(app)
    .post("/api/v1/workflows")
    .send({ name: `Exec Test ${Date.now()}`, graph });
  expect(res.status).toBe(201);
  const id = res.body.workflow.id as string;
  createdWorkflowIds.push(id);
  return id;
}

async function execute(
  workflowId: string,
  body: object = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await request(app)
    .post(`/api/v1/workflows/${workflowId}/execute`)
    .send(body);
  return { status: res.status, body: res.body as Record<string, unknown> };
}

/** Polls until the execution row reaches a terminal status or the timeout elapses. */
async function waitForTerminal(executionId: string, maxMs = 1000): Promise<string> {
  const terminalStatuses = new Set(["success", "error", "cancelled", "timeout"]);
  const intervalMs = 20;
  const maxAttempts = Math.ceil(maxMs / intervalMs);

  for (let i = 0; i < maxAttempts; i++) {
    const [row] = await db
      .select({ status: executions.status })
      .from(executions)
      .where(eq(executions.id, executionId))
      .limit(1);
    if (row && terminalStatuses.has(row.status)) return row.status;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Execution ${executionId} did not reach a terminal status within ${maxMs}ms`);
}

// ─── POST /api/v1/workflows/:workflowId/execute ───────────────────────────────

describe("POST /api/v1/workflows/:workflowId/execute", () => {
  it("returns 202 and creates a pending execution", async () => {
    const wfId = await createTestWorkflow();
    const { status, body } = await execute(wfId);

    expect(status).toBe(202);
    expect(body.execution).toMatchObject({
      workflowId: wfId,
      status: "pending",
      triggerType: "manual",
    });
    expect(body.execution).toHaveProperty("id");
    expect(body.execution).toHaveProperty("versionId");
    expect(body.execution).toHaveProperty("createdAt");
  });

  it("accepts an optional triggerPayload and passes it to the execution", async () => {
    const wfId = await createTestWorkflow();
    const payload = { hello: "world" };
    const { status, body } = await execute(wfId, { triggerPayload: payload });

    expect(status).toBe(202);
    expect((body.execution as Record<string, unknown>).triggerPayload).toEqual(payload);
  });

  it("runs the engine to success for an instant graph", async () => {
    const wfId = await createTestWorkflow(INSTANT_GRAPH);
    const { body } = await execute(wfId);
    const execId = (body.execution as Record<string, unknown>).id as string;

    const finalStatus = await waitForTerminal(execId);
    expect(finalStatus).toBe("success");
  });

  it("runs an if-node graph and routes the true branch", async () => {
    const wfId = await createTestWorkflow(IF_TRUE_GRAPH);
    const { body } = await execute(wfId);
    const execId = (body.execution as Record<string, unknown>).id as string;

    await waitForTerminal(execId);

    // Verify all three nodes have execution logs
    const getRes = await request(app).get(`/api/v1/executions/${execId}`);
    expect(getRes.status).toBe(200);
    const logs = getRes.body.logs as Array<Record<string, unknown>>;
    const byKey = Object.fromEntries(logs.map((l) => [l.nodeKey, l]));
    expect(byKey["s"]?.status).toBe("success");
    expect(byKey["cond"]?.status).toBe("success");
    expect(byKey["e"]?.status).toBe("success");
  });

  it("returns 404 for a non-existent workflow", async () => {
    const { status } = await execute("00000000-0000-0000-0000-000000000000");
    expect(status).toBe(404);
  });

  it("returns 4xx when the workflow has no active version", async () => {
    // Create a workflow by direct DB insert — no version, so activeVersionId stays null
    const [wf] = await db
      .insert(workflows)
      .values({ name: "No version", tags: [], isActive: false })
      .returning();
    createdWorkflowIds.push(wf.id);

    const { status } = await execute(wf.id);
    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);
  });

  it("returns 4xx when the graph cannot be executed (multiple entry nodes)", async () => {
    // Two disconnected nodes → both have zero incoming connections → two entry nodes.
    // assertAcyclic passes (no cycle), so this saves successfully.
    // buildExecutionPlan rejects it at execute time with GraphStructureError.
    const saveRes = await request(app)
      .post("/api/v1/workflows")
      .send({
        name: `Two Entry ${Date.now()}`,
        graph: {
          nodes: [
            { key: "a", type: "start" },
            { key: "b", type: "end" },
          ],
          connections: [], // no edges → both nodes have indegree 0 → two entries
        },
      });
    expect(saveRes.status).toBe(201);
    createdWorkflowIds.push(saveRes.body.workflow.id as string);

    const { status } = await execute(saveRes.body.workflow.id as string);
    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);
  });
});

// ─── GET /api/v1/executions ───────────────────────────────────────────────────

describe("GET /api/v1/executions", () => {
  it("returns a list of executions", async () => {
    const wfId = await createTestWorkflow();
    await execute(wfId);

    const res = await request(app).get("/api/v1/executions");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.executions)).toBe(true);
    expect(typeof res.body.total).toBe("number");
    expect(res.body.total).toBeGreaterThanOrEqual(1);
  });

  it("filters by workflowId", async () => {
    const wfA = await createTestWorkflow();
    const wfB = await createTestWorkflow();
    await execute(wfA);
    await execute(wfB);

    const res = await request(app).get(`/api/v1/executions?workflowId=${wfA}`);
    expect(res.status).toBe(200);
    const ids: string[] = (res.body.executions as Array<Record<string, unknown>>).map(
      (e) => e.workflowId as string,
    );
    expect(ids.every((id) => id === wfA)).toBe(true);
  });

  it("filters by status", async () => {
    const wfId = await createTestWorkflow();
    const { body } = await execute(wfId);
    const execId = (body.execution as Record<string, unknown>).id as string;
    await waitForTerminal(execId);

    const res = await request(app).get("/api/v1/executions?status=success");
    expect(res.status).toBe(200);
    const statuses = (res.body.executions as Array<Record<string, unknown>>).map((e) => e.status);
    expect(statuses.every((s) => s === "success")).toBe(true);
  });

  it("supports cursor pagination", async () => {
    const wfId = await createTestWorkflow();
    // Create 3 executions
    await execute(wfId);
    await execute(wfId);
    await execute(wfId);

    const firstPage = await request(app).get(
      `/api/v1/executions?workflowId=${wfId}&limit=2`,
    );
    expect(firstPage.status).toBe(200);
    expect(firstPage.body.executions).toHaveLength(2);
    expect(firstPage.body.nextCursor).toBeTruthy();

    const secondPage = await request(app).get(
      `/api/v1/executions?workflowId=${wfId}&limit=2&after=${firstPage.body.nextCursor}`,
    );
    expect(secondPage.status).toBe(200);
    expect(secondPage.body.executions).toHaveLength(1);
    expect(secondPage.body.nextCursor).toBeNull();
  });
});

// ─── GET /api/v1/executions/:executionId ─────────────────────────────────────

describe("GET /api/v1/executions/:executionId", () => {
  it("returns the execution with its node logs", async () => {
    const wfId = await createTestWorkflow(INSTANT_GRAPH);
    const { body } = await execute(wfId);
    const execId = (body.execution as Record<string, unknown>).id as string;
    await waitForTerminal(execId);

    const res = await request(app).get(`/api/v1/executions/${execId}`);
    expect(res.status).toBe(200);
    expect(res.body.execution).toMatchObject({ id: execId, status: "success" });
    expect(Array.isArray(res.body.logs)).toBe(true);
    // start and end nodes each produce a log entry
    expect(res.body.logs.length).toBeGreaterThanOrEqual(2);
  });

  it("returns logs ordered by startedAt ascending", async () => {
    const wfId = await createTestWorkflow(INSTANT_GRAPH);
    const { body } = await execute(wfId);
    const execId = (body.execution as Record<string, unknown>).id as string;
    await waitForTerminal(execId);

    const res = await request(app).get(`/api/v1/executions/${execId}`);
    const logs = res.body.logs as Array<{ startedAt: string; nodeKey: string }>;
    for (let i = 1; i < logs.length; i++) {
      expect(new Date(logs[i].startedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(logs[i - 1].startedAt).getTime(),
      );
    }
  });

  it("returns 404 for a non-existent execution", async () => {
    const res = await request(app).get(
      "/api/v1/executions/00000000-0000-0000-0000-000000000000",
    );
    expect(res.status).toBe(404);
  });
});

// ─── POST /api/v1/executions/:executionId/cancel ─────────────────────────────

describe("POST /api/v1/executions/:executionId/cancel", () => {
  it("cancels a pending execution before it starts running", async () => {
    // Use a long delay so the execution is still pending/running when we cancel
    const delayGraph = {
      nodes: [
        { key: "s", type: "start" },
        { key: "d", type: "delay", config: { durationMs: 60_000 } },
      ],
      connections: [{ sourceKey: "s", targetKey: "d" }],
    };
    const wfId = await createTestWorkflow(delayGraph);
    const { body } = await execute(wfId);
    const execId = (body.execution as Record<string, unknown>).id as string;

    const cancelRes = await request(app).post(`/api/v1/executions/${execId}/cancel`);
    expect(cancelRes.status).toBe(200);
    expect((cancelRes.body.execution as Record<string, unknown>).id).toBe(execId);

    const finalStatus = await waitForTerminal(execId, 2000);
    expect(finalStatus).toBe("cancelled");
  });

  it("returns 409 when the execution already finished", async () => {
    const wfId = await createTestWorkflow(INSTANT_GRAPH);
    const { body } = await execute(wfId);
    const execId = (body.execution as Record<string, unknown>).id as string;
    await waitForTerminal(execId);

    const res = await request(app).post(`/api/v1/executions/${execId}/cancel`);
    expect(res.status).toBe(409);
  });

  it("returns 404 for a non-existent execution", async () => {
    const res = await request(app).post(
      "/api/v1/executions/00000000-0000-0000-0000-000000000000/cancel",
    );
    expect(res.status).toBe(404);
  });
});
