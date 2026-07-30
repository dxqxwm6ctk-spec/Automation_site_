import { type NextFunction, type Request, type Response } from "express";
import { AppError } from "../lib/errors";

/**
 * Express middleware that rejects unauthenticated requests with 401.
 * Mount on any router or individual route that requires a logged-in user.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.isAuthenticated()) {
    throw new AppError("UNAUTHORIZED", "Authentication required");
  }
  next();
}
