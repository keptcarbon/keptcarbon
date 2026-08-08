import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { verifyToken, AUTH_COOKIE } from "@/lib/jwt";
import { getUserUuid } from "@/lib/carbon-projects";

// ---------------------------------------------------------------------------
// POST /api/plots/claim — attach a guest's projects to the logged-in account.
//   Body: { guestKey: string }
//   Moves every active project owned by that guest_key to the caller's
//   user_uuid. Requires auth; the unguessable guest_key acts as the proof the
//   caller owned that guest session.
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userUuid = await getUserUuid(payload);
  if (!userUuid) {
    return NextResponse.json({ error: "User not found" }, { status: 401 });
  }

  const { guestKey } = await request.json().catch(() => ({ guestKey: null }));
  if (!guestKey || typeof guestKey !== "string") {
    return NextResponse.json({ error: "guestKey is required" }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Avoid violating the (user_uuid, project_name) unique index: if the user
    // already has an active project with the same name, keep theirs and
    // soft-delete the guest copy instead of moving it.
    await client.query(
      `UPDATE carbon_projects g
       SET status = 'deleted', deleted_at = NOW()
       WHERE g.guest_key = $1 AND g.status = 'active'
         AND EXISTS (
           SELECT 1 FROM carbon_projects u
           WHERE u.user_uuid = $2 AND u.status = 'active'
             AND u.project_name = g.project_name
         )`,
      [guestKey, userUuid]
    );

    const moved = await client.query(
      `UPDATE carbon_projects
       SET user_uuid = $2, guest_key = NULL
       WHERE guest_key = $1 AND status = 'active'`,
      [guestKey, userUuid]
    );

    await client.query("COMMIT");
    return NextResponse.json({ success: true, claimed: moved.rowCount ?? 0 });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("POST /api/plots/claim error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  } finally {
    client.release();
  }
}
