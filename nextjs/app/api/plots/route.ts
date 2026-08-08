import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { pool } from "@/lib/db";
import { verifyToken, AUTH_COOKIE } from "@/lib/jwt";
import { getUserUuid, generateGuestKey, mergeRawField, rowToProject } from "@/lib/carbon-projects";

function generateGuestProjectName(): string {
  return `Guestprojects-${randomUUID()}`;
}



// ---------------------------------------------------------------------------
// GET /api/plots — list projects (soft delete: แสดงเฉพาะ status = 'active')
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
        FROM carbon_projects
        WHERE status = 'active'
        ORDER BY updated_at DESC
      `;
      params = [];
    } else if (payload) {
      // ผู้ใช้ที่ล็อกอิน: ค้นหาด้วย uuid (คงที่ ไม่เปลี่ยนตามชื่อ)
      const userUuid = await getUserUuid(payload);
      query = `
        SELECT *
        FROM carbon_projects
        WHERE user_uuid = $1 AND status = 'active'
        ORDER BY updated_at DESC
      `;
      params = [userUuid];
    } else if (guestUserId) {
      // Guest: ดูเฉพาะ guest_key ที่ส่งมา
      query = `
        SELECT *
        FROM carbon_projects
        WHERE guest_key = $1 AND status = 'active'
        ORDER BY updated_at DESC
      `;
      params = [guestUserId];
    } else {
      return NextResponse.json({ plots: [] });
    }

    const result = await pool.query(query, params);

    // Filter by project name if ?name= is provided
    const projName = searchParams.get("name");
    const filteredRows = projName
      ? result.rows.filter(row => row.project_name === projName)
      : result.rows;

    // Flatten frontend_plots from matching projects into a single array of plots
    const plots = filteredRows.flatMap(row => {
      const p = row.frontend_plots;
      if (Array.isArray(p)) {
        return p.map(plot => ({ ...plot, dbProjectId: row.id }));
      }
      return [];
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
