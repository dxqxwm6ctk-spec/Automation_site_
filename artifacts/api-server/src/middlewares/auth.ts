import type { NextFunction, Request, Response } from "express";
import { verifyToken, type JwtPayload } from "../lib/jwt";

// Extend Express Request so downstream handlers can read req.user
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * Reads a Bearer token from the Authorization header and attaches the decoded
 * payload to `req.user`. Continues without error when no token is present
 * (unauthenticated access is still allowed in MVP mode).
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    try {
      req.user = verifyToken(authHeader.slice(7));
    } catch {
      // expired / invalid — treat as unauthenticated
    }
  }
  next();
}

/**
 * Like optionalAuth but returns 401 if no valid token is present.
 * Use this on routes that require a logged-in user.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ status: 401, title: "Unauthorized", detail: "No token provided." });
    return;
  }
  try {
    req.user = verifyToken(authHeader.slice(7));
    next();
  } catch {
    res.status(401).json({ status: 401, title: "Unauthorized", detail: "Invalid or expired token." });
  }
}
