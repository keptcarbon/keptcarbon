import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { verifyToken, AUTH_COOKIE } from "@/lib/jwt";
import { getUserUuid } from "@/lib/carbon-projects";
import { softDeleteProjectsByOwner } from "@/lib/normalized-plots";

// ---------------------------------------------------------------------------
// POST /api/plots/claim — attach a guest's projects to the logged-in account.
//   Body: { guestKey: string }
//   Clones every active project owned by that guest_uuid (and everything
//   under it -- plots, land-use overlaps, assessment history, yearly carbon
//   rows) into brand-new rows owned by the caller's user_uuid, then
//   soft-deletes the guest project. The guest project's ownership is never
//   reassigned in place — it's cloned then discarded, so a guest-drawn
//   project's identity never mutates into a user-owned one. Requires auth;
//   the unguessable guest_uuid acts as the proof the caller owned that guest
//   session.
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
      `UPDATE tbl_projects g
       SET status = 'deleted', deleted_at = NOW(), updated_at = NOW()
       WHERE g.guest_uuid = $1 AND g.status = 'active'
         AND EXISTS (
           SELECT 1 FROM tbl_projects u
           WHERE u.user_uuid = $2 AND u.status = 'active'
             AND u.project_name = g.project_name
         )`,
      [guestKey, userUuid]
    );

    const guestProjects = await client.query(
      `SELECT id, project_name FROM tbl_projects WHERE guest_uuid = $1 AND status = 'active'`,
      [guestKey]
    );

    const clonedProjects: { id: number; project_name: string }[] = [];

    for (const guestProject of guestProjects.rows) {
      // 1) Clone the project header, owned by the user.
      const newProject = await client.query(
        `INSERT INTO tbl_projects (user_uuid, project_name, status)
         VALUES ($1, $2, 'active')
         RETURNING id, project_name`,
        [userUuid, guestProject.project_name]
      );
      const newProjectId = newProject.rows[0].id;
      clonedProjects.push(newProject.rows[0]);

      // 2) Clone every non-deleted plot, matched back to its clone by
      //    polygon_id (unique within a project).
      await client.query(
        `INSERT INTO tbl_plots (
           project_id, polygon_id, geometry, area_m2, province_code,
           status, status_code, message,
           year_of_planting, rubber_clone, tree_count, spacing_system, project_type,
           selected_lu_classes, owner_name
         )
         SELECT $2, polygon_id, geometry, area_m2, province_code,
                status, status_code, message,
                year_of_planting, rubber_clone, tree_count, spacing_system, project_type,
                selected_lu_classes, owner_name
         FROM tbl_plots
         WHERE project_id = $1 AND deleted_at IS NULL`,
        [guestProject.id, newProjectId]
      );

      // 3) Clone land-use overlaps for those plots, joined old->new plot by
      //    polygon_id (both scoped to their own project, so no collision).
      await client.query(
        `INSERT INTO tbl_plot_landuse_overlaps (plot_id, lu_class, lu_class_desc_th, geometry, area_m2, area_percent)
         SELECT new_pl.id, o.lu_class, o.lu_class_desc_th, o.geometry, o.area_m2, o.area_percent
         FROM tbl_plot_landuse_overlaps o
         JOIN tbl_plots old_pl ON old_pl.id = o.plot_id
         JOIN tbl_plots new_pl ON new_pl.project_id = $2 AND new_pl.polygon_id = old_pl.polygon_id
         WHERE old_pl.project_id = $1`,
        [guestProject.id, newProjectId]
      );

      // 4) Clone the full assessment history (not just is_current) for those
      //    plots, preserving created_at -- it's used both for display and,
      //    below, to correlate old->new assessment rows for step 5.
      await client.query(
        `INSERT INTO tbl_plot_assessments (plot_id, status, status_code, message, message_th, ci, assess_parameters, model_version, is_current, created_at)
         SELECT new_pl.id, a.status, a.status_code, a.message, a.message_th, a.ci, a.assess_parameters, a.model_version, a.is_current, a.created_at
         FROM tbl_plot_assessments a
         JOIN tbl_plots old_pl ON old_pl.id = a.plot_id
         JOIN tbl_plots new_pl ON new_pl.project_id = $2 AND new_pl.polygon_id = old_pl.polygon_id
         WHERE old_pl.project_id = $1`,
        [guestProject.id, newProjectId]
      );

      // 5) Clone yearly carbon rows, correlating old->new assessment by
      //    (new plot id, created_at) since that's the only stable key shared
      //    between an assessment and its clone.
      await client.query(
        `INSERT INTO tbl_plot_carbon_yearly (
           assessment_id, year, year_at, age,
           stock_value, stock_ci, stock_ci_lower, stock_ci_upper,
           gain_value, gain_ci, gain_ci_lower, gain_ci_upper
         )
         SELECT new_a.id, y.year, y.year_at, y.age,
                y.stock_value, y.stock_ci, y.stock_ci_lower, y.stock_ci_upper,
                y.gain_value, y.gain_ci, y.gain_ci_lower, y.gain_ci_upper
         FROM tbl_plot_carbon_yearly y
         JOIN tbl_plot_assessments old_a ON old_a.id = y.assessment_id
         JOIN tbl_plots old_pl ON old_pl.id = old_a.plot_id
         JOIN tbl_plots new_pl ON new_pl.project_id = $2 AND new_pl.polygon_id = old_pl.polygon_id
         JOIN tbl_plot_assessments new_a ON new_a.plot_id = new_pl.id AND new_a.created_at = old_a.created_at
         WHERE old_pl.project_id = $1`,
        [guestProject.id, newProjectId]
      );
    }

    // Soft-delete the guest's projects now that everything under them has
    // been cloned -- cascades don't apply here since nothing FKs guest_uuid.
    await softDeleteProjectsByOwner(client, { userUuid: null, guestUuid: guestKey });

    await client.query("COMMIT");

    return NextResponse.json({
      success: true,
      claimed: clonedProjects.length,
      projects: clonedProjects.map(row => ({ id: row.id, projectName: row.project_name })),
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("POST /api/plots/claim error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  } finally {
    client.release();
  }
}
