/**
 * Error codes and their HTTP status mapping, per the "Error Codes" table in
 * docs/03-api-specification.md. Route handlers and services should throw
 * `AppError` (or let a Zod `.parse()` throw a `ZodError`) instead of
 * hand-shaping error JSON — the global error handler in
 * `middlewares/errorHandler.ts` serialises either into RFC 7807 Problem JSON.
 */
export type ErrorCode =
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "EXECUTION_FAILED"
  | "CREDENTIAL_INVALID"
  | "INTERNAL_ERROR";

interface ErrorCodeMeta {
  statusCode: number;
  title: string;
}

const ERROR_CODES: Record<ErrorCode, ErrorCodeMeta> = {
  NOT_FOUND: { statusCode: 404, title: "Not Found" },
  CONFLICT: { statusCode: 409, title: "Conflict" },
  VALIDATION_ERROR: { statusCode: 422, title: "Validation Error" },
  RATE_LIMITED: { statusCode: 429, title: "Too Many Requests" },
  EXECUTION_FAILED: { statusCode: 422, title: "Execution Failed" },
  CREDENTIAL_INVALID: { statusCode: 422, title: "Credential Invalid" },
  INTERNAL_ERROR: { statusCode: 500, title: "Internal Server Error" },
};

/**
 * Base class for all intentional/expected API errors (see
 * docs/01-architecture.md "Error Handling"). Throw this from route handlers
 * or services — Express 5 forwards thrown errors (sync or from a rejected
 * async handler) to the global error handler automatically, no manual
 * try/catch + next(err) required.
 *
 * Example (future CRUD phase):
 *   throw new AppError("NOT_FOUND", `Workflow ${id} not found`);
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly title: string;
  readonly context?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    detail: string,
    context?: Record<string, unknown>,
  ) {
    super(detail);
    this.name = "AppError";
    this.code = code;
    this.statusCode = ERROR_CODES[code].statusCode;
    this.title = ERROR_CODES[code].title;
    this.context = context;
  }
}
