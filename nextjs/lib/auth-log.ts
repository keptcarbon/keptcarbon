import { NextRequest } from "next/server";
import { pool } from "@/lib/db";

function getClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip");
}

/**
 * Records an auth event (login/logout) in tbl_auth_logs. Never throws —
 * a logging failure must not block the user from actually logging in.
 */
export async function logAuthEvent(
  request: NextRequest,
  params: { userUuid: string; email: string; eventType: "login" | "logout"; provider: string }
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO tbl_auth_logs (uuid, email, event_type, provider, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        params.userUuid,
        params.email,
        params.eventType,
        params.provider,
        getClientIp(request),
        request.headers.get("user-agent"),
      ]
    );
  } catch (err) {
    console.error("Failed to record auth log:", err);
  }
}