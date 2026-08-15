import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { pool } from "@/lib/db";
import { verifyToken, AUTH_COOKIE } from "@/lib/jwt";
import { getUserUuid, generateGuestKey, mergeRawField, rowToProject } from "@/lib/carbon-projects";
import { shadowUpsertProject, shadowSoftDeleteProjectsByOwner } from "@/lib/normalized-plots";

function generateGuestProjectName(): string {
  return `Guestprojects-${randomUUID()}`;
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
// GET /api/plots — list projects (soft delete: แสดงเฉพาะ status = 'active')
// Reads the normalized schema (tbl_projects/tbl_plots/tbl_plot_landuse_
// overlaps/tbl_plot_assessments/tbl_plot_carbon_yearly) and reconstructs the
// same `plots[]` shape ParcelResultsPanel used to persist verbatim into
// carbon_projects.frontend_plots. Writes still target carbon_projects (see
// POST/PATCH/DELETE below) -- only reads have moved.
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  // ตรวจสอบว่ามี token หรือไม่ (ถ้าไม่มี = guest)
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const payload = token ? verifyToken(token) : null;

  const { searchParams } = new URL(request.url);

  // Admin สามารถดูทั้งหมดได้
  const showAll =
    payload?.role === "admin" && searchParams.get("all") === "true";

  // Guest ต้องส่ง user_id มาเพื่อดึงข้อมูล
  const guestUserId = searchParams.get("guest_user_id");

  try {
    let query: string;
    let params: unknown[];

    if (showAll) {
      // Admin: ดูทั้งหมด (เฉพาะ active)
      query = `
        SELECT *
        FROM tbl_projects
        WHERE status = 'active'
        ORDER BY updated_at DESC
      `;
      params = [];
    } else if (payload) {
      // ผู้ใช้ที่ล็อกอิน: ค้นหาด้วย uuid (คงที่ ไม่เปลี่ยนตามชื่อ)
      const userUuid = await getUserUuid(payload);
      query = `
        SELECT *
        FROM tbl_projects
        WHERE user_uuid = $1 AND status = 'active'
        ORDER BY updated_at DESC
      `;
      params = [userUuid];
    } else if (guestUserId) {
      // Guest: ดูเฉพาะ guest_key ที่ส่งมา
      query = `
        SELECT *
        FROM tbl_projects
        WHERE guest_uuid = $1 AND status = 'active'
        ORDER BY updated_at DESC
      `;
      params = [guestUserId];
    } else {
      return NextResponse.json({ plots: [] });
    }

    const projectResult = await pool.query(query, params);

    // Filter by project name if ?name= is provided
    const projName = searchParams.get("name");
    const projectRows = projName
      ? projectResult.rows.filter(row => row.project_name === projName)
      : projectResult.rows;

    if (projectRows.length === 0) {
      return NextResponse.json({ plots: [] });
    }

    const projectById = new Map(projectRows.map(row => [row.id, row]));
    const projectIds = projectRows.map(row => row.id);

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
// POST /api/plots — สร้าง project ใหม่ + บันทึก history (CREATE)
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const payload = token ? verifyToken(token) : null;

  try {
    const body = await request.json();

    // กำหนดเจ้าของ: ล็อกอิน → user_uuid, guest → guest_key (อย่างใดอย่างหนึ่ง)
    let userUuid: string | null = null;
    let guestKey: string | null = null;
    if (payload && !body.forceGuest) {
      // บันทึกจริง (กด "บันทึกข้อมูล" / แก้ไข) → เป็นเจ้าของด้วย user_uuid
      userUuid = await getUserUuid(payload);
      if (!userUuid) {
        return NextResponse.json({ error: "User not found" }, { status: 401 });
      }
    } else if (body.userId) {
      // Guest re-save หรือ draft ของ user ที่ล็อกอิน (forceGuest) → reuse guest_key เดิม
      guestKey = body.userId;
    } else {
      // ประมวลผลครั้งแรก (guest หรือ forceGuest) → สร้าง guest_key ใหม่
      guestKey = generateGuestKey();
    }

    // กำหนดชื่อโครงการ
    const projectName: string = body.projectId || generateGuestProjectName();

    const plantationInfo = body.plantationInfo ?? {};
    const polygonsPayload = body.polygonsPayload ?? [];
    const backendResponses = body.backendResponses ?? [];
    const frontendPlots = body.frontendPlots ?? [];

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Check if project already exists (match on the owner that applies)
      const ownerClause = userUuid
        ? "user_uuid = $1"
        : "guest_key = $1";
      const ownerValue = userUuid ?? guestKey;

      const existing = await client.query(
        `SELECT id FROM carbon_projects
         WHERE ${ownerClause} AND project_name = $2 AND status = 'active'`,
        [ownerValue, projectName]
      );

      let savedRow;

      if ((existing.rowCount ?? 0) > 0) {
        // ดึงข้อมูลเดิมก่อน update เพื่อ merge raw fields
        const oldResult = await client.query(
          `SELECT plantation_info, polygons_payload, backend_responses FROM carbon_projects WHERE id = $1`,
          [existing.rows[0].id]
        );
        const oldRow = oldResult.rows[0] ?? {};

        // Update existing record (updated_at handled by trigger)
        const mergedPlantationInfo = mergeRawField(oldRow.plantation_info, plantationInfo);
        const mergedPolygonsPayload = mergeRawField(oldRow.polygons_payload, polygonsPayload);
        const mergedBackendResponses = mergeRawField(oldRow.backend_responses, backendResponses);

        const updateResult = await client.query(
          `UPDATE carbon_projects
           SET plantation_info = $1, polygons_payload = $2, backend_responses = $3, frontend_plots = $4
           WHERE id = $5
           RETURNING *`,
          [
            JSON.stringify(mergedPlantationInfo),
            JSON.stringify(mergedPolygonsPayload),
            JSON.stringify(mergedBackendResponses),
            JSON.stringify(frontendPlots),
            existing.rows[0].id
          ]
        );
        savedRow = updateResult.rows[0];
      } else {
        // Insert new record
        const insertResult = await client.query(
          `INSERT INTO carbon_projects
             (user_uuid, guest_key, project_name, plantation_info, polygons_payload, backend_responses, frontend_plots)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [
            userUuid,
            guestKey,
            projectName,
            JSON.stringify(plantationInfo),
            JSON.stringify(polygonsPayload),
            JSON.stringify(backendResponses),
            JSON.stringify(frontendPlots),
          ]
        );
        savedRow = insertResult.rows[0];
      }

      await client.query("COMMIT");

      try {
        await shadowUpsertProject(
          {
            id: savedRow.id,
            userUuid: savedRow.user_uuid,
            guestUuid: savedRow.guest_key,
            projectName: savedRow.project_name,
            status: savedRow.status,
            deletedAt: savedRow.deleted_at,
            createdAt: savedRow.created_at,
            updatedAt: savedRow.updated_at,
          },
          {
            // Raw body fields, NOT the `?? {}`/`?? []`-defaulted consts above --
            // shadowUpsertProject needs to tell "not sent" from "sent empty".
            plantationInfo: body.plantationInfo,
            polygonsPayload: body.polygonsPayload,
            backendResponses: body.backendResponses,
            frontendPlots: body.frontendPlots,
          }
        );
      } catch (shadowErr) {
        console.error("[normalized-plots] shadow write failed for project", savedRow.id, shadowErr);
      }

      return NextResponse.json({
        success: true,
        project: rowToProject(savedRow),
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
// DELETE /api/plots — Soft Delete ทุก project ของ user ปัจจุบัน
//   ไม่ลบจริง → เปลี่ยน status = 'deleted' + ตั้ง deleted_at
// ---------------------------------------------------------------------------
export async function DELETE(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const payload = token ? verifyToken(token) : null;

  // Guest ต้องส่ง guest_key มาทาง query string
  const { searchParams } = new URL(request.url);
  const guestUserId = searchParams.get("guest_user_id");

  // ล็อกอิน → ลบด้วย user_uuid, guest → ลบด้วย guest_key
  const userUuid = payload ? await getUserUuid(payload) : null;
  const ownerClause = payload ? "user_uuid = $1" : "guest_key = $1";
  const ownerValue = payload ? userUuid : guestUserId;

  if (!ownerValue) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ดึงข้อมูลเดิมก่อน soft delete
    const existing = await client.query(
      `SELECT id FROM carbon_projects WHERE ${ownerClause} AND status = 'active'`,
      [ownerValue]
    );

    // Soft Delete (updated_at handled by trigger)
    await client.query(
      `UPDATE carbon_projects
       SET status = 'deleted', deleted_at = NOW()
       WHERE ${ownerClause} AND status = 'active'`,
      [ownerValue]
    );



    await client.query("COMMIT");

    try {
      await shadowSoftDeleteProjectsByOwner(
        payload ? { userUuid, guestUuid: null } : { userUuid: null, guestUuid: guestUserId }
      );
    } catch (shadowErr) {
      console.error("[normalized-plots] shadow soft-delete (bulk) failed", shadowErr);
    }

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
