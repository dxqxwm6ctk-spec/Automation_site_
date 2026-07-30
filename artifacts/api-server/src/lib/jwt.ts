import jwt from "jsonwebtoken";

const secret = process.env["SESSION_SECRET"] ?? "dev-secret-change-in-production";

export interface JwtPayload {
  userId: string;
  email: string;
}

/** Signs an access token valid for 15 minutes. */
export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, secret, { expiresIn: "15m" });
}

/** Signs a refresh-token JWT used only to verify the raw token value. */
export function signRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, secret, { expiresIn: "30d" });
}

/** Verifies and decodes a JWT. Throws if invalid or expired. */
export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, secret) as JwtPayload;
}
