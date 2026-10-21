import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { verifyToken, AUTH_COOKIE } from "@/lib/jwt";
import { getUserUuid } from "@/lib/carbon-projects";
import { transferGuestProjectsToUser } from "@/lib/normalized-plots";
import {
  assertProjectSlots,
  countActiveProjects,
  quotaErrorResponse,
  requireCallerQuota,
  QuotaError,
} from "@/lib/quota";

// ---------------------------------------------------------------------------
// POST /api/plots/claim — attach a guest's projects to the logged-in account.
//   Body: { guestKey: string }
//   Flips guest_uuid -> user_uuid IN PLACE on every active project owned by
//   that guest_uuid (and everything under it comes along unchanged -- plots,
//   land-use overlaps, assessment history, yearly carbon rows). No clone, no
//   soft-delete: the row id is stable, so a client holding a dbProjectId keeps
//   working. The unguessable guest_uuid is the proof the caller owned that
//   guest session. Requires auth.
//   Quota: all-or-nothing -- if the account lacks a free project slot for
//   every guest project being claimed, nothing is claimed and it returns
//   403 { error: "project_limit", limit, current }. The guest rows stay as
//   they are, so the client can have the user delete a project and retry.
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
    const quota = await requireCallerQuota(client, payload);
    const pending = await countActiveProjects(client, { guestUuid: guestKey });
    await assertProjectSlots(client, quota, { userUuid }, { adding: pending });
    const claimed = await transferGuestProjectsToUser(client, { guestKey, userUuid });
    await client.query("COMMIT");

    return NextResponse.json({
      success: true,
      claimed: claimed.length,
      projects: claimed.map((row) => ({ id: row.id, projectName: row.project_name })),
    });
  } catch (err) {
    await client.query("ROLLBACK");
    if (err instanceof QuotaError) return quotaErrorResponse(err);
    console.error("POST /api/plots/claim error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  } finally {
    client.release();
  }
}
