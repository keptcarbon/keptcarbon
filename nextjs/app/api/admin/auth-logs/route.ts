import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { isAdmin } from "@/lib/auth-server";

/**
 * GET /api/admin/auth-logs
 * Returns the most recent login/logout events, newest first, for the admin
 * auth-log viewer. Capped at 1000 rows — filtering/paging happens client-side,
 * matching the existing admin/users list pattern.
 */
export async function GET(request: NextRequest) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await pool.query(
      `SELECT l.id, l.uuid AS "userUuid", l.email, l.event_type AS "eventType", l.provider,
              l.ip_address AS "ipAddress", l.user_agent AS "userAgent", l.created_at AS "createdAt",
              u.display_name AS "displayName", u.username
       FROM tbl_auth_logs l
       LEFT JOIN tbl_users u ON u.uuid = l.uuid
       ORDER BY l.created_at DESC
       LIMIT 1000`
    );
    return NextResponse.json({ logs: result.rows });
  } catch (err) {
    console.error("Admin list auth logs error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}