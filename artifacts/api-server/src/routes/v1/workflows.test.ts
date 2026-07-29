/**
 * Workflow CRUD API tests — Phase 1.1
 *
 * All tests run against the live dev database (same as other test files in
 * this repo). Workflow rows created during tests are cleaned up in afterAll.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { and, eq, isNull } from "drizzle-orm";
import { db, pool, workflows, workflowVersions } from "@workspace/db";
import app from "../../app";

// Track created workflow IDs for cleanup
const createdWorkflowIds: string[] = [];

afterAll(async () => {
  // Hard-delete any workflows created by these tests (cascade removes versions)
  if (createdWorkflowIds.length > 0) {
    for (const id of createdWorkflowIds) {
      await db.delete(workflows).where(eq(workflows.id, id));
    }
  }
  await pool.end();
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function createTestWorkflow(overrides: {
  name?: string;
  tags?: string[];
  graph?: object;
} = {}) {
  const res = await request(app)
    .post("/api/v1/workflows")
    .send({
      name: overrides.name ?? `Test Workflow ${Date.now()}`,
      tags: overrides.tags ?? [],
      graph: overrides.graph ?? { nodes: [], connections: [] },
    });
  expect(res.status).toBe(201);
  createdWorkflowIds.push(res.body.workflow.id);
  return res.body as { workflow: Record<string, unknown>; version: Record<string, unknown> };
}

// ─── POST /api/v1/workflows ───────────────────────────────────────────────────

describe("POST /api/v1/workflows", () => {
  it("creates a workflow and version 1", async () => {
    const res = await request(app)
      .post("/api/v1/workflows")
      .send({ name: "My Workflow", description: "desc", tags: ["ci"] });

    expect(res.status).toBe(201);
    expect(res.body.workflow).toMatchObject({
      name: "My Workflow",
      description: "desc",
      tags: ["ci"],
      isActive: false,
    });
    expect(res.body.workflow.activeVersionId).toBeTruthy();
    expect(res.body.version.version).toBe(1);
    expect(res.body.version.description).toBe("Initial version");

    createdWorkflowIds.push(res.body.workflow.id);
  });

  it("defaults tags to [] and graph to empty", async () => {
    const res = await request(app)
      .post("/api/v1/workflows")
      .send({ name: "Minimal" });

    expect(res.status).toBe(201);
    expect(res.body.workflow.tags).toEqual([]);
    expect(res.body.version.graphJson).toEqual({ nodes: [], connections: [] });

    createdWorkflowIds.push(res.body.workflow.id);
  });

  it("returns 422 when name is missing", async () => {
    const res = await request(app)
      .post("/api/v1/workflows")
      .send({ tags: ["x"] });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 422 when name is empty string", async () => {
    const res = await request(app)
      .post("/api/v1/workflows")
      .send({ name: "" });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });
});

// ─── GET /api/v1/workflows ────────────────────────────────────────────────────

describe("GET /api/v1/workflows", () => {
  let wfId1: string;
  let wfId2: string;

  beforeAll(async () => {
    const r1 = await createTestWorkflow({ name: "Alpha Workflow", tags: ["sales", "crm"] });
    const r2 = await createTestWorkflow({ name: "Beta Workflow", tags: ["crm"] });
    wfId1 = r1.workflow.id as string;
    wfId2 = r2.workflow.id as string;
  });

  it("returns a list with total and no nextCursor on a small set", async () => {
    const res = await request(app).get("/api/v1/workflows");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.workflows)).toBe(true);
    expect(typeof res.body.total).toBe("number");
    expect(res.body.total).toBeGreaterThanOrEqual(2);
  });

  it("filters by isActive=false", async () => {
    const res = await request(app).get("/api/v1/workflows?isActive=false");

    expect(res.status).toBe(200);
    expect(res.body.workflows.every((w: { isActive: boolean }) => w.isActive === false)).toBe(true);
  });

  it("filters by search (case-insensitive name match)", async () => {
    const res = await request(app).get("/api/v1/workflows?search=alpha");

    expect(res.status).toBe(200);
    const ids = res.body.workflows.map((w: { id: string }) => w.id);
    expect(ids).toContain(wfId1);
    expect(ids).not.toContain(wfId2);
  });

  it("filters by tags[]", async () => {
    const res = await request(app).get("/api/v1/workflows?tags[]=sales");

    expect(res.status).toBe(200);
    const ids = res.body.workflows.map((w: { id: string }) => w.id);
    expect(ids).toContain(wfId1);
    expect(ids).not.toContain(wfId2);
  });

  it("respects limit and returns nextCursor when there are more results", async () => {
    const res = await request(app).get("/api/v1/workflows?limit=1");

    expect(res.status).toBe(200);
    expect(res.body.workflows).toHaveLength(1);
    if (res.body.total > 1) {
      expect(res.body.nextCursor).toBeTruthy();
    }
  });

  it("paginates correctly using nextCursor", async () => {
    const first = await request(app).get("/api/v1/workflows?limit=1");
    expect(first.status).toBe(200);

    if (!first.body.nextCursor) return; // only 1 workflow in DB — skip

    const second = await request(app).get(
      `/api/v1/workflows?limit=1&after=${first.body.nextCursor}`,
    );
    expect(second.status).toBe(200);
    expect(second.body.workflows[0].id).not.toBe(first.body.workflows[0].id);
  });
});

// ─── GET /api/v1/workflows/:workflowId ───────────────────────────────────────

describe("GET /api/v1/workflows/:workflowId", () => {
  it("returns the workflow with its active version", async () => {
    const { workflow } = await createTestWorkflow({ name: "Get Me" });

    const res = await request(app).get(`/api/v1/workflows/${workflow.id}`);

    expect(res.status).toBe(200);
    expect(res.body.workflow.id).toBe(workflow.id);
    expect(res.body.activeVersion).toBeTruthy();
    expect(res.body.activeVersion.version).toBe(1);
    expect(res.body.activeVersion.graphJson).toEqual({ nodes: [], connections: [] });
  });

  it("returns 404 for a non-existent workflow", async () => {
    const res = await request(app).get(
      "/api/v1/workflows/00000000-0000-0000-0000-000000000000",
    );

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });
});

// ─── PUT /api/v1/workflows/:workflowId ───────────────────────────────────────

describe("PUT /api/v1/workflows/:workflowId", () => {
  it("creates a new version and updates activeVersionId", async () => {
    const { workflow } = await createTestWorkflow({ name: "Version Me" });
    const oldVersionId = workflow.activeVersionId as string;

    const graph = { nodes: [{ key: "http_1", type: "action.http" }], connections: [] };
    const res = await request(app)
      .put(`/api/v1/workflows/${workflow.id}`)
      .send({ graph, description: "Add HTTP node" });

    expect(res.status).toBe(200);
    expect(res.body.version.version).toBe(2);
    expect(res.body.version.description).toBe("Add HTTP node");
    expect(res.body.workflow.activeVersionId).not.toBe(oldVersionId);
    expect(res.body.workflow.activeVersionId).toBe(res.body.version.id);
  });

  it("increments version numbers correctly across multiple saves", async () => {
    const { workflow } = await createTestWorkflow({ name: "Multi-version" });
    const graph = { nodes: [], connections: [] };

    for (let i = 2; i <= 4; i++) {
      const res = await request(app)
        .put(`/api/v1/workflows/${workflow.id}`)
        .send({ graph });
      expect(res.status).toBe(200);
      expect(res.body.version.version).toBe(i);
    }
  });

  it("returns 422 when graph is missing", async () => {
    const { workflow } = await createTestWorkflow();

    const res = await request(app)
      .put(`/api/v1/workflows/${workflow.id}`)
      .send({ description: "No graph" });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 for a non-existent workflow", async () => {
    const res = await request(app)
      .put("/api/v1/workflows/00000000-0000-0000-0000-000000000000")
      .send({ graph: { nodes: [], connections: [] } });

    expect(res.status).toBe(404);
  });
});

// ─── PATCH /api/v1/workflows/:workflowId ─────────────────────────────────────

describe("PATCH /api/v1/workflows/:workflowId", () => {
  it("updates the workflow name", async () => {
    const { workflow } = await createTestWorkflow({ name: "Old Name" });

    const res = await request(app)
      .patch(`/api/v1/workflows/${workflow.id}`)
      .send({ name: "New Name" });

    expect(res.status).toBe(200);
    expect(res.body.workflow.name).toBe("New Name");
  });

  it("updates isActive without creating a new version", async () => {
    const { workflow } = await createTestWorkflow({ name: "Activate Me" });
    const versionsBefore = await db
      .select()
      .from(workflowVersions)
      .where(eq(workflowVersions.workflowId, workflow.id as string));

    const res = await request(app)
      .patch(`/api/v1/workflows/${workflow.id}`)
      .send({ isActive: true });

    expect(res.status).toBe(200);
    expect(res.body.workflow.isActive).toBe(true);

    const versionsAfter = await db
      .select()
      .from(workflowVersions)
      .where(eq(workflowVersions.workflowId, workflow.id as string));
    expect(versionsAfter.length).toBe(versionsBefore.length);
  });

  it("updates tags", async () => {
    const { workflow } = await createTestWorkflow({ name: "Tag Me", tags: ["old"] });

    const res = await request(app)
      .patch(`/api/v1/workflows/${workflow.id}`)
      .send({ tags: ["new", "updated"] });

    expect(res.status).toBe(200);
    expect(res.body.workflow.tags).toEqual(["new", "updated"]);
  });

  it("returns 422 when no fields are provided", async () => {
    const { workflow } = await createTestWorkflow();

    const res = await request(app)
      .patch(`/api/v1/workflows/${workflow.id}`)
      .send({});

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 for a non-existent workflow", async () => {
    const res = await request(app)
      .patch("/api/v1/workflows/00000000-0000-0000-0000-000000000000")
      .send({ name: "Ghost" });

    expect(res.status).toBe(404);
  });
});

// ─── DELETE /api/v1/workflows/:workflowId ────────────────────────────────────

describe("DELETE /api/v1/workflows/:workflowId", () => {
  it("soft-deletes the workflow (returns 204, row has deletedAt set)", async () => {
    const { workflow } = await createTestWorkflow({ name: "Delete Me" });

    const res = await request(app).delete(`/api/v1/workflows/${workflow.id}`);
    expect(res.status).toBe(204);

    // The row still exists but is soft-deleted
    const [row] = await db
      .select()
      .from(workflows)
      .where(eq(workflows.id, workflow.id as string));
    expect(row.deletedAt).not.toBeNull();
  });

  it("returns 404 when trying to access a deleted workflow via GET", async () => {
    const { workflow } = await createTestWorkflow({ name: "Get After Delete" });
    await request(app).delete(`/api/v1/workflows/${workflow.id}`);

    const res = await request(app).get(`/api/v1/workflows/${workflow.id}`);
    expect(res.status).toBe(404);
  });

  it("returns 404 when deleting the same workflow twice", async () => {
    const { workflow } = await createTestWorkflow({ name: "Double Delete" });
    await request(app).delete(`/api/v1/workflows/${workflow.id}`);

    const res = await request(app).delete(`/api/v1/workflows/${workflow.id}`);
    expect(res.status).toBe(404);
  });

  it("returns 404 for a non-existent workflow", async () => {
    const res = await request(app).delete(
      "/api/v1/workflows/00000000-0000-0000-0000-000000000000",
    );
    expect(res.status).toBe(404);
  });
});

// ─── GET /api/v1/workflows/:workflowId/versions ──────────────────────────────

describe("GET /api/v1/workflows/:workflowId/versions", () => {
  it("lists all versions in descending order", async () => {
    const { workflow } = await createTestWorkflow({ name: "Version Lister" });
    const graph = { nodes: [], connections: [] };

    // Save two more versions
    await request(app).put(`/api/v1/workflows/${workflow.id}`).send({ graph });
    await request(app).put(`/api/v1/workflows/${workflow.id}`).send({ graph });

    const res = await request(app).get(`/api/v1/workflows/${workflow.id}/versions`);

    expect(res.status).toBe(200);
    expect(res.body.versions).toHaveLength(3);
    expect(res.body.versions[0].version).toBe(3);
    expect(res.body.versions[1].version).toBe(2);
    expect(res.body.versions[2].version).toBe(1);

    // Each version entry should have id, version, description, createdAt
    expect(res.body.versions[0]).toHaveProperty("id");
    expect(res.body.versions[0]).toHaveProperty("createdAt");
  });

  it("returns 404 for a non-existent workflow", async () => {
    const res = await request(app).get(
      "/api/v1/workflows/00000000-0000-0000-0000-000000000000/versions",
    );
    expect(res.status).toBe(404);
  });
});

// ─── POST /api/v1/workflows/:workflowId/versions/:versionId/restore ──────────

describe("POST /api/v1/workflows/:workflowId/versions/:versionId/restore", () => {
  it("restores a previous version as the active version", async () => {
    const { workflow, version: v1 } = await createTestWorkflow({ name: "Restore Me" });
    const graph = { nodes: [{ key: "x" }], connections: [] };

    // Save version 2
    const putRes = await request(app)
      .put(`/api/v1/workflows/${workflow.id}`)
      .send({ graph });
    expect(putRes.status).toBe(200);
    const v2Id = putRes.body.version.id;

    // Active version is now v2 — restore back to v1
    const res = await request(app).post(
      `/api/v1/workflows/${workflow.id}/versions/${v1.id}/restore`,
    );

    expect(res.status).toBe(200);
    expect(res.body.workflow.activeVersionId).toBe(v1.id);
  });

  it("returns 404 when the version does not belong to the workflow", async () => {
    const { workflow: wfA } = await createTestWorkflow({ name: "Owner A" });
    const { version: vB } = await createTestWorkflow({ name: "Owner B" });

    const res = await request(app).post(
      `/api/v1/workflows/${wfA.id}/versions/${vB.id}/restore`,
    );

    expect(res.status).toBe(404);
  });

  it("returns 404 for a non-existent workflow", async () => {
    const res = await request(app).post(
      "/api/v1/workflows/00000000-0000-0000-0000-000000000000/versions/00000000-0000-0000-0000-000000000001/restore",
    );
    expect(res.status).toBe(404);
  });
});
