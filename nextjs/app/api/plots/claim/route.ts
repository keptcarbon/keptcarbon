import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { verifyToken, AUTH_COOKIE } from "@/lib/jwt";
import { getUserUuid, rowToProject } from "@/lib/carbon-projects";
import { shadowUpsertProject, shadowSoftDeleteProjectById } from "@/lib/normalized-plots";

// ---------------------------------------------------------------------------
// POST /api/plots/claim — attach a guest's projects to the logged-in account.
//   Body: { guestKey: string }
//   Clones every active project owned by that guest_key into a brand-new row
//   owned by the caller's user_uuid, then soft-deletes the guest row. The
//   guest row's ownership is never reassigned in place — it's cloned then
//   discarded, so a guest-drawn project's identity never mutates into a
//   user-owned one. Requires auth; the unguessable guest_key acts as the
//   proof the caller owned that guest session.
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
    // soft-delete the guest copy instead of cloning it.
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

    // Clone every remaining active guest project into a new row owned by the
    // user. The source guest row is left untouched here and soft-deleted
    // below, so its guest_key/ownership are never mutated in place.
    const cloned = await client.query(
      `INSERT INTO carbon_projects
         (user_uuid, project_name, plantation_info, polygons_payload, backend_responses, frontend_plots, status)
       SELECT $2, project_name, plantation_info, polygons_payload, backend_responses, frontend_plots, 'active'
       FROM carbon_projects
       WHERE guest_key = $1 AND status = 'active'
       RETURNING *`,
      [guestKey, userUuid]
    );

    const deletedGuestProjects = await client.query(
      `UPDATE carbon_projects
       SET status = 'deleted', deleted_at = NOW()
       WHERE guest_key = $1 AND status = 'active'
       RETURNING id`,
      [guestKey]
    );

    await client.query("COMMIT");

    try {
      for (const row of cloned.rows) {
        await shadowUpsertProject(
          {
            id: row.id,
            userUuid: row.user_uuid,
            guestUuid: row.guest_key,
            projectName: row.project_name,
            status: row.status,
            deletedAt: row.deleted_at,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          },
          {
            plantationInfo: row.plantation_info,
            polygonsPayload: row.polygons_payload,
            backendResponses: row.backend_responses,
            frontendPlots: row.frontend_plots,
          }
        );
      }
      for (const row of deletedGuestProjects.rows) {
        await shadowSoftDeleteProjectById(row.id);
      }
    } catch (shadowErr) {
      console.error("[normalized-plots] shadow claim failed", { guestKey, userUuid }, shadowErr);
    }

    return NextResponse.json({
      success: true,
      claimed: cloned.rowCount ?? 0,
      projects: cloned.rows.map(rowToProject),
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("POST /api/plots/claim error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  } finally {
    client.release();
  }
}
