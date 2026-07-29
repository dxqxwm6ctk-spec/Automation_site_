import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { z } from "zod/v4";
import { errorHandler, notFoundHandler } from "./errorHandler";
import { AppError } from "../lib/errors";

function mockRes(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    method: "GET",
    originalUrl: "/api/widgets/123",
    log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
    ...overrides,
  } as unknown as Request;
}

describe("notFoundHandler", () => {
  it("responds with 404 Problem JSON for unmatched routes", () => {
    const req = mockReq();
    const res = mockRes();

    notFoundHandler(req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 404,
        code: "NOT_FOUND",
        instance: "/api/widgets/123",
      }),
    );
  });
});

describe("errorHandler", () => {
  it("serialises AppError using its own status and code", () => {
    const req = mockReq();
    const res = mockRes();

    errorHandler(
      new AppError("CONFLICT", "Workflow name already exists"),
      req,
      res,
      vi.fn(),
    );

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 409,
        code: "CONFLICT",
        detail: "Workflow name already exists",
      }),
    );
  });

  it("maps a ZodError to 422 VALIDATION_ERROR", () => {
    const req = mockReq();
    const res = mockRes();
    const result = z.object({ name: z.string() }).safeParse({});

    errorHandler(result.error, req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 422, code: "VALIDATION_ERROR" }),
    );
  });

  it("falls back to 500 INTERNAL_ERROR and hides the message in production", () => {
    const req = mockReq();
    const res = mockRes();
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    try {
      errorHandler(new Error("db exploded"), req, res, vi.fn());
    } finally {
      process.env.NODE_ENV = originalEnv;
    }

    expect(res.status).toHaveBeenCalledWith(500);
    const [body] = (res.json as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(body.code).toBe("INTERNAL_ERROR");
    expect(body.detail).not.toContain("db exploded");
  });

  it("includes the real error message outside production", () => {
    const req = mockReq();
    const res = mockRes();
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";

    try {
      errorHandler(new Error("db exploded"), req, res, vi.fn());
    } finally {
      process.env.NODE_ENV = originalEnv;
    }

    const [body] = (res.json as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(body.detail).toContain("db exploded");
  });
});
