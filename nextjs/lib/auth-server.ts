import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { verifyToken, AUTH_COOKIE } from "@/lib/jwt";

/**
 * Checks whether the requester's JWT cookie belongs to a user with role = 'admin'.
 */
export async function isAdmin(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  if (!token) return false;

  const payload = verifyToken(token);
  if (!payload) return false;

  const result = await pool.query("SELECT role FROM users WHERE id = $1", [payload.userId]);
  return result.rows[0]?.role === "admin";
}