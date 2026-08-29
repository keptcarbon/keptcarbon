import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { verifyToken, AUTH_COOKIE } from "@/lib/jwt";
import { getUserUuid } from "@/lib/carbon-projects";
import { transferGuestProjectsToUser } from "@/lib/normalized-plots";

// ---------------------------------------------------------------------------
// POST /api/plots/claim — attach a guest's projects to the logged-in account.
//   Body: { guestKey: string }
//   Flips guest_uuid -> user_uuid IN PLACE on every active project owned by
//   that guest_uuid (and everything under it comes along unchanged -- plots,
//   land-use overlaps, assessment history, yearly carbon rows). No clone, no
//   soft-delete: the row id is stable, so a client holding a dbProjectId keeps
//   working. The unguessable guest_uuid is the proof the caller owned that
//   guest session. Requires auth.
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
    const claimed = await transferGuestProjectsToUser(client, { guestKey, userUuid });
    await client.query("COMMIT");

    return NextResponse.json({
      success: true,
      claimed: claimed.length,
      projects: claimed.map((row) => ({ id: row.id, projectName: row.project_name })),
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("POST /api/plots/claim error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  } finally {
    client.release();
  }
}
