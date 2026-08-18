import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { pool } from "@/lib/db";
import { verifyToken, AUTH_COOKIE } from "@/lib/jwt";
import { getUserUuid, generateGuestKey, rowToProjectFromNormalized } from "@/lib/carbon-projects";
import { upsertProjectAndPlots, softDeleteProjectsByOwner } from "@/lib/normalized-plots";

function generateGuestProjectName(): string {
  // Just a display label (not a credential like generateGuestKey), so a
  // short hex suffix is fine — e.g. "Guest-77a345c76d1d".
  return `Guest-${randomUUID().replace(/-/g, "").slice(0, 8)}`;
}

const CURRENT_YEAR_BE = new Date().getFullYear() + 543;

/** selected_lu_classes only records the checked (true) classes -- reconstructs
 *  the luChecked map from that. An explicit uncheck of a class that defaults
 *  to true (A/A302) isn't distinguishable from "never considered" this way;
 *  downstream consumers already fall back to {A:true, A302:true} when the
 *  map is empty, same as an unsaved plot, so this only affects the initial
 *  checkbox state on next edit, never the stored assessment itself. */
function luCheckedFromSelected(selectedLuClasses: string[] | null): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  (selectedLuClasses ?? []).forEach((cls) => { out[cls] = true; });
  return out;
}

/** Mirrors profileToBarPoints() in ParcelResultsPanel/CarbonBarChart.tsx --
 *  reimplemented here rather than importing that component file into an API
 *  route. */
function yearlyRowsToBarPoints(rows: any[], baseAge: number) {
  return rows.map((row) => {
    const yearAt = row.year_at ?? 0;
    const hasAge = row.age !== null && row.age !== undefined;
    const age = hasAge ? Number(row.age) : baseAge + yearAt;
    return {
      age,
      yearBE: row.year + 543,
      year_at: yearAt,
      co2: row.stock_value,
      ci: row.stock_ci,
      gainValue: row.gain_value,
      gainCi: row.gain_ci,
      cycle: Math.floor(yearAt / 7),
      cycleAge: age,
      errorMargin: row.stock_ci,
      isAgeValid: hasAge,
    };
  });
}

// ---------------------------------------------------------------------------
// GET /api/plots — list projects (soft delete: only shows status = 'active')
// Reads the normalized schema (tbl_projects/tbl_plots/tbl_plot_landuse_
// overlaps/tbl_plot_assessments/tbl_plot_carbon_yearly) and reconstructs the
// same `plots[]` shape ParcelResultsPanel used to persist verbatim into the
// old carbon_projects.frontend_plots (now retired, see
// postgis/migrations/012_retire_carbon_projects.sql). POST/PATCH/DELETE below
// write the same normalized schema.
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  // Check whether there's a token (if not = guest)
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const payload = token ? verifyToken(token) : null;

  const { searchParams } = new URL(request.url);

  // Admin can view everything
  const showAll =
    payload?.role === "admin" && searchParams.get("all") === "true";

  // Guest must send user_id to fetch data
  const guestUserId = searchParams.get("guest_user_id");

  try {
    let query: string;
    let params: unknown[];

    if (showAll) {
      // Admin: view everything (active only)
      query = `
        SELECT *
        FROM tbl_projects
        WHERE status = 'active'
        ORDER BY updated_at DESC
      `;
      params = [];
    } else if (payload) {
      // Logged-in user: look up by uuid (stable, doesn't change with name)
      const userUuid = await getUserUuid(payload);
      query = `
        SELECT *
        FROM tbl_projects
        WHERE user_uuid = $1 AND status = 'active'
        ORDER BY updated_at DESC
      `;
      params = [userUuid];
    } else if (guestUserId) {
      // Guest: only view the guest_uuid that was sent
      query = `
        SELECT *
        FROM tbl_projects
        WHERE guest_uuid = $1 AND status = 'active'
        ORDER BY updated_at DESC
      `;
      params = [guestUserId];
    } else {
      return NextResponse.json({ plots: [], projects: [] });
    }

    const projectResult = await pool.query(query, params);

    // Filter by project name if ?name= is provided
    const projName = searchParams.get("name");
    const projectRows = projName
      ? projectResult.rows.filter(row => row.project_name === projName)
      : projectResult.rows;

    if (projectRows.length === 0) {
      return NextResponse.json({ plots: [], projects: [] });
    }

    const projectById = new Map(projectRows.map(row => [row.id, row]));
    const projectIds = projectRows.map(row => row.id);

    // ?summary=true — lightweight listing for the my-plots table view (project
    // name, plot count, total area only). Skips the geometry/assessment/yearly
    // joins below so opening the list doesn't pull every plot's full payload.
    if (searchParams.get("summary") === "true") {
      const summaryResult = await pool.query(
        `SELECT project_id, COUNT(*) AS plot_count, SUM(area_m2) AS total_area_m2,
                MAX(owner_name) AS owner_name, MAX(province_code) AS province_code
         FROM tbl_plots
         WHERE project_id = ANY($1) AND deleted_at IS NULL
         GROUP BY project_id`,
        [projectIds]
      );
      const summaryByProjectId = new Map(summaryResult.rows.map(row => [row.project_id, row]));

      const projects = projectRows
        .map(row => {
          const s = summaryByProjectId.get(row.id);
          if (!s) return null; // no active plots left -> hide, matches prior grouping behavior
          return {
            dbProjectId: row.id,
            projectName: row.project_name,
            plotCount: Number(s.plot_count),
            totalArea: s.total_area_m2 != null ? Number(s.total_area_m2) / 1600 : 0,
            updatedAt: row.updated_at,
            ownerName: s.owner_name ?? "",
            province: s.province_code ?? "",
          };
        })
        .filter((p): p is NonNullable<typeof p> => p !== null);

      return NextResponse.json({ projects });
    }

    const plotsResult = await pool.query(
      `SELECT id, project_id, polygon_id, ST_AsGeoJSON(geometry)::json AS geometry,
              area_m2, province_code, year_of_planting, rubber_clone, tree_count,
              spacing_system, project_type, selected_lu_classes, owner_name, updated_at
       FROM tbl_plots
       WHERE project_id = ANY($1) AND deleted_at IS NULL`,
      [projectIds]
    );
    const plotRows = plotsResult.rows;
    if (plotRows.length === 0) {
      return NextResponse.json({ plots: [] });
    }
    const plotIds = plotRows.map(row => row.id);

    const assessmentsResult = await pool.query(
      `SELECT id, plot_id, assess_parameters, created_at
       FROM tbl_plot_assessments
       WHERE plot_id = ANY($1) AND is_current = TRUE`,
      [plotIds]
    );
    const assessmentByPlotId = new Map(assessmentsResult.rows.map(row => [row.plot_id, row]));
    const assessmentIds = assessmentsResult.rows.map(row => row.id);

    const yearlyResult = assessmentIds.length
      ? await pool.query(
          `SELECT assessment_id, year, year_at, age, stock_value, stock_ci, gain_value, gain_ci
           FROM tbl_plot_carbon_yearly
           WHERE assessment_id = ANY($1)
           ORDER BY assessment_id, year_at ASC`,
          [assessmentIds]
        )
      : { rows: [] as any[] };
    const yearlyByAssessmentId = new Map<number, any[]>();
    yearlyResult.rows.forEach((row) => {
      const list = yearlyByAssessmentId.get(row.assessment_id) ?? [];
      list.push(row);
      yearlyByAssessmentId.set(row.assessment_id, list);
    });

    const overlapsResult = await pool.query(
      `SELECT plot_id, lu_class, lu_class_desc_th, ST_AsGeoJSON(geometry)::json AS geometry,
              area_m2, area_percent
       FROM tbl_plot_landuse_overlaps
       WHERE plot_id = ANY($1)`,
      [plotIds]
    );
    const overlapsByPlotId = new Map<number, any[]>();
    overlapsResult.rows.forEach((row) => {
      const list = overlapsByPlotId.get(row.plot_id) ?? [];
      list.push(row);
      overlapsByPlotId.set(row.plot_id, list);
    });

    const plots = plotRows.map((pl) => {
      const project = projectById.get(pl.project_id);
      const assessment = assessmentByPlotId.get(pl.id);
      const yearly = assessment ? (yearlyByAssessmentId.get(assessment.id) ?? []) : [];

      const plantYearBE = pl.year_of_planting ? pl.year_of_planting + 543 : 0;
      const rubberAge = plantYearBE > 0 ? CURRENT_YEAR_BE - plantYearBE : 0;
      const currentYearly = yearly.find(y => (y.year_at ?? 0) === 0) ?? yearly[0];
      const luChecked = luCheckedFromSelected(pl.selected_lu_classes);

      const luPolygon = (overlapsByPlotId.get(pl.id) ?? []).map((lu) => ({
        type: "Feature",
        properties: {
          lu_class: lu.lu_class,
          lu_class_desc_th: lu.lu_class_desc_th,
          area_m2: lu.area_m2,
          area_percent: lu.area_percent,
        },
        geometry: lu.geometry,
      }));

      return {
        id: pl.polygon_id,
        dbProjectId: pl.project_id,
        name: project?.project_name ?? "",
        areaRai: pl.area_m2 != null ? pl.area_m2 / 1600 : 0,
        carbonTotal: currentYearly?.stock_value ?? 0,
        rubberAge,
        plantYearBE,
        trees: pl.tree_count ?? 0,
        variety: pl.rubber_clone ?? "",
        spacing: pl.spacing_system ?? "",
        luChecked,
        plantStatus: pl.project_type ?? "",
        ownerName: pl.owner_name ?? "",
        province: pl.province_code ?? "",
        date: (assessment?.created_at ?? pl.updated_at) as unknown as string,
        geojson: pl.geometry,
        boundaryGeojson: null,
        carbonProfile: yearlyRowsToBarPoints(yearly, rubberAge),
        processed: !!assessment,
        backendData: {
          lu_polygon: luPolygon,
          plantYearBE,
          age: rubberAge,
          variety: pl.rubber_clone ?? "",
          spacing: pl.spacing_system ?? "",
          trees: pl.tree_count ?? 0,
          ep: assessment?.assess_parameters ?? null,
          form: {
            plantStatus: pl.project_type ?? "",
            plantYear: plantYearBE ? String(plantYearBE) : "",
            treeCount: pl.tree_count != null ? String(pl.tree_count) : "",
            variety: pl.rubber_clone ?? "",
            spacing: pl.spacing_system ?? "",
            luChecked,
          },
        },
      };
    });

    return NextResponse.json({ plots });
  } catch (err) {
    console.error("GET /api/plots error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/plots — create a new project + save history (CREATE)
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const payload = token ? verifyToken(token) : null;

  try {
    const body = await request.json();

    // Determine the owner: logged in → user_uuid, guest → guest_key (exactly one)
    let userUuid: string | null = null;
    let guestKey: string | null = null;
    if (payload && !body.forceGuest) {
      // Real save (clicked "บันทึกข้อมูล" (Save) / Edit) → owned via user_uuid
      userUuid = await getUserUuid(payload);
      if (!userUuid) {
        return NextResponse.json({ error: "User not found" }, { status: 401 });
      }
    } else if (body.userId) {
      // Guest re-save, or a draft from a logged-in user (forceGuest) → reuse the existing guest_key
      guestKey = body.userId;
    } else {
      // First-time processing (guest or forceGuest) → create a new guest_key
      guestKey = generateGuestKey();
    }

    // Determine the project name
    const projectName: string = body.projectId || generateGuestProjectName();

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Check if project already exists (match on the owner that applies)
      const ownerClause = userUuid
        ? "user_uuid = $1"
        : "guest_uuid = $1";
      const ownerValue = userUuid ?? guestKey;

      const existing = await client.query(
        `SELECT id FROM tbl_projects
         WHERE ${ownerClause} AND project_name = $2 AND status = 'active'`,
        [ownerValue, projectName]
      );

      let savedRow;

      if ((existing.rowCount ?? 0) > 0) {
        // Update existing record (updated_at handled by trigger)
        const updateResult = await client.query(
          `UPDATE tbl_projects SET updated_at = NOW() WHERE id = $1 RETURNING *`,
          [existing.rows[0].id]
        );
        savedRow = updateResult.rows[0];
      } else {
        // Insert new record
        const insertResult = await client.query(
          `INSERT INTO tbl_projects (user_uuid, guest_uuid, project_name, status)
           VALUES ($1, $2, $3, 'active')
           RETURNING *`,
          [userUuid, guestKey, projectName]
        );
        savedRow = insertResult.rows[0];
      }

      await upsertProjectAndPlots(
        client,
        {
          id: savedRow.id,
          userUuid: savedRow.user_uuid,
          guestUuid: savedRow.guest_uuid,
          projectName: savedRow.project_name,
          status: savedRow.status,
          deletedAt: savedRow.deleted_at,
          createdAt: savedRow.created_at,
          updatedAt: savedRow.updated_at,
        },
        {
          plantationInfo: body.plantationInfo,
          polygonsPayload: body.polygonsPayload,
          backendResponses: body.backendResponses,
          frontendPlots: body.frontendPlots,
        }
      );

      await client.query("COMMIT");

      return NextResponse.json({
        success: true,
        project: rowToProjectFromNormalized(savedRow),
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("POST /api/plots error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/plots — Soft delete every project owned by the current user
//   Not a real delete → changes status to 'deleted' and sets deleted_at
// ---------------------------------------------------------------------------
export async function DELETE(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const payload = token ? verifyToken(token) : null;

  // Guest must send guest_key via the query string
  const { searchParams } = new URL(request.url);
  const guestUserId = searchParams.get("guest_user_id");

  // Logged in → delete by user_uuid, guest → delete by guest_uuid
  const userUuid = payload ? await getUserUuid(payload) : null;
  const ownerClause = payload ? "user_uuid = $1" : "guest_uuid = $1";
  const ownerValue = payload ? userUuid : guestUserId;

  if (!ownerValue) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Fetch the existing data before soft deleting
    const existing = await client.query(
      `SELECT id FROM tbl_projects WHERE ${ownerClause} AND status = 'active'`,
      [ownerValue]
    );

    // Soft Delete
    await softDeleteProjectsByOwner(
      client,
      payload ? { userUuid, guestUuid: null } : { userUuid: null, guestUuid: guestUserId }
    );

    await client.query("COMMIT");

    return NextResponse.json({
      success: true,
      deletedCount: existing.rowCount,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("DELETE /api/plots error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
