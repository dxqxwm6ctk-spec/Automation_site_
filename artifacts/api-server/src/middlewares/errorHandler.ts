import type { ErrorRequestHandler, RequestHandler, Response } from "express";
import { ZodError } from "zod/v4";
import { AppError } from "../lib/errors";

interface ProblemJsonBody {
  status: number;
  title: string;
  detail: string;
  instance: string;
  code: string;
  context?: Record<string, unknown>;
}

function sendProblem(res: Response, body: ProblemJsonBody): void {
  res.status(body.status).json({ type: "about:blank", ...body });
}

/**
 * Catch-all for requests that matched no route. Mount after every router,
 * before `errorHandler`.
 */
export const notFoundHandler: RequestHandler = (req, res) => {
  sendProblem(res, {
    title: "Not Found",
    status: 404,
    detail: `No route matches ${req.method} ${req.originalUrl}`,
    instance: req.originalUrl,
    code: "NOT_FOUND",
  });
};

/**
 * Global error handler — serialises errors to RFC 7807 Problem JSON per
 * docs/01-architecture.md "Error Handling" and docs/03-api-specification.md.
 *
 * Must be the last `app.use(...)` call, and must keep all 4 parameters
 * (even though `_next` is unused) — Express identifies error-handling
 * middleware by function arity at runtime, so dropping to 3 params would
 * silently turn this into a regular (broken) middleware.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const isProduction = process.env.NODE_ENV === "production";

  if (err instanceof AppError) {
    req.log.warn({ err, code: err.code }, err.message);
    sendProblem(res, {
      title: err.title,
      status: err.statusCode,
      detail: err.message,
      instance: req.originalUrl,
      code: err.code,
      ...(isProduction || !err.context ? {} : { context: err.context }),
    });
    return;
  }

  if (err instanceof ZodError) {
    const detail = err.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    req.log.warn({ issues: err.issues }, "Request validation failed");
    sendProblem(res, {
      title: "Validation Error",
      status: 422,
      detail,
      instance: req.originalUrl,
      code: "VALIDATION_ERROR",
    });
    return;
  }

  req.log.error({ err }, "Unhandled error");
  const message =
    err instanceof Error ? err.message : "An unexpected error occurred.";
  sendProblem(res, {
    title: "Internal Server Error",
    status: 500,
    detail: isProduction ? "An unexpected error occurred." : message,
    instance: req.originalUrl,
    code: "INTERNAL_ERROR",
    ...(!isProduction && err instanceof Error && err.stack
      ? { context: { stack: err.stack } }
      : {}),
  });
};
