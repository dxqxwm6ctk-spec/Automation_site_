import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { pool } from "@workspace/db";
import app from "./app";

afterAll(async () => {
  await pool.end();
});

describe("GET /api/healthz", () => {
  it("returns 200 with status ok", async () => {
    const res = await request(app).get("/api/healthz");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

describe("GET /api/ready", () => {
  it("returns 200 with postgres ok, redis not_configured, queue in-process", async () => {
    const res = await request(app).get("/api/ready");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: "ok",
      checks: { postgres: "ok", redis: "not_configured", queue: "in-process" },
    });
  });
});

describe("unmatched routes", () => {
  it("returns RFC 7807 Problem JSON with 404", async () => {
    const res = await request(app).get("/api/does-not-exist");

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      status: 404,
      code: "NOT_FOUND",
      instance: "/api/does-not-exist",
    });
  });
});
