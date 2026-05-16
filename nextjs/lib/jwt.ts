import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET || "keptcarbon-dev-fallback-secret";
const EXPIRES_IN = "7d";

export interface JwtPayload {
  userId: number;
  email: string;
  role: string;
  provider: string;
}

/**
 * Sign a JWT token with the user payload.
 */
export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES_IN });
}

/**
 * Verify and decode a JWT token.
 * Returns null if invalid/expired.
 */
export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

/**
 * Cookie name for the JWT auth token.
 */
export const AUTH_COOKIE = "kc_token";
