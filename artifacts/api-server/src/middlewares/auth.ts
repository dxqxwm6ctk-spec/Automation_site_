import type { NextFunction, Request, Response } from "express";
import { verifyToken } from "../lib/jwt";

/**
 * Legacy JWT-based optional auth middleware.
 * @deprecated Replaced by the OIDC-based authMiddleware from authMiddleware.ts.
 * Kept to avoid breaking any callers that have not been migrated yet.
 * `req.user` is now typed via the global declaration in authMiddleware.ts.
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const payload = verifyToken(authHeader.slice(7));
      // @ts-expect-error — JwtPayload shape differs from AuthUser; legacy path only
      req.user = payload;
    } catch {
      // expired / invalid — treat as unauthenticated
    }
  }
  next();
}

/**
 * Legacy JWT-based require-auth middleware.
 * @deprecated Replaced by the OIDC-based authMiddleware from authMiddleware.ts.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ status: 401, title: "Unauthorized", detail: "No token provided." });
    return;
  }
  try {
    const payload = verifyToken(authHeader.slice(7));
    // @ts-expect-error — JwtPayload shape differs from AuthUser; legacy path only
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ status: 401, title: "Unauthorized", detail: "Invalid or expired token." });
  }
}
