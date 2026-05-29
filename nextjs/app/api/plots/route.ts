import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { verifyToken, AUTH_COOKIE, JwtPayload } from "@/lib/jwt";

// ---------------------------------------------------------------------------
// Helper: สร้าง Guest ID รูปแบบ Guest-XXXXXXXX (8 ตัวอักขระ ไม่ซ้ำ)
// ---------------------------------------------------------------------------
const GUEST_ID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // ตัดตัวที่อ่านสับสน (0/O, 1/I)

async function generateGuestUserId(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = Array.from({ length: 8 }, () =>
      GUEST_ID_CHARS[Math.floor(Math.random() * GUEST_ID_CHARS.length)]
    ).join("");
    const candidate = `Guest-${code}`;
    const check = await pool.query(
      `SELECT 1 FROM carbon_projects WHERE user_id = $1 LIMIT 1`,
      [candidate]
    );
    if ((check.rowCount ?? 0) === 0) return candidate;
  }
  // fallback (แทบไม่เกิด)
  return `Guest-${Date.now().toString(36).toUpperCase().padStart(8, "0").slice(-8)}`;
}

function generateGuestProjectId(): string {
  const ts = Math.floor(Date.now() / 1000);
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `Guestprojects-${ts}-${rand}`;
}

// ---------------------------------------------------------------------------
// Helper: ดึง username จาก users table ด้วย userId (number)
// ---------------------------------------------------------------------------
async function getUserIdentifier(payload: JwtPayload): Promise<string> {
  const result = await pool.query(
    `SELECT fullname, username, email FROM users WHERE id = $1`,
    [payload.userId]
  );
  if (result.rows.length > 0) {
    return result.rows[0].fullname || result.rows[0].username || result.rows[0].email || String(payload.userId);
  }
  return String(payload.userId);
}

// ---------------------------------------------------------------------------
// Helper: แปลง DB row → API response object
// ---------------------------------------------------------------------------
function rowToProject(row: any) {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    plantationInfo: row.plantation_info ?? {},
    polygonsPayload: row.polygons_payload ?? [],
    backendResponses: row.backend_responses ?? [],
    status: row.status,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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
      // ผู้ใช้ที่ล็อกอิน: ดึง username จาก DB แล้วค้นหา
      const userIdentifier = await getUserIdentifier(payload);
      query = `
        SELECT *
        FROM carbon_projects
        WHERE user_id = $1 AND status = 'active'
        ORDER BY updated_at DESC
      `;
      params = [userIdentifier];
    } else if (guestUserId) {
      // Guest: ดูเฉพาะ guest_user_id ที่ส่งมา
      query = `
        SELECT *
        FROM carbon_projects
        WHERE user_id = $1 AND status = 'active'
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
      ? result.rows.filter(row => row.project_id === projName)
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
// Helper: merge raw JSON arrays — new items replace by index, extra old items preserved
// (copy จาก [id]/route.ts — ป้องกัน raw data หายเมื่อบันทึกแค่บางแปลง)
// ---------------------------------------------------------------------------
function mergeRawArray(oldArr: any[], newArr: any[]): any[] {
  if (!Array.isArray(oldArr) || oldArr.length === 0) return newArr;
  if (!Array.isArray(newArr) || newArr.length === 0) return oldArr;
  
  // Create a map of new items by ID
  const newItemsMap = new Map();
  let hasIds = false;
  
  newArr.forEach(item => {
    if (item && typeof item === 'object') {
      const key = item.id || item.polygon_id;
      if (key) {
        newItemsMap.set(key, item);
        hasIds = true;
      }
    }
  });

  // If no items have IDs, fallback to original index-based logic
  if (!hasIds) {
    if (newArr.length >= oldArr.length) return newArr;
    return [...newArr, ...oldArr.slice(newArr.length)];
  }

  // If we have stable IDs, merge properly:
  // Start with all new items
  const result = [...newArr];
  
  // Append old items that are NOT in the new payload
  oldArr.forEach(oldItem => {
    if (oldItem && typeof oldItem === 'object') {
      const key = oldItem.id || oldItem.polygon_id;
      if (key && !newItemsMap.has(key)) {
        result.push(oldItem);
      }
    } else {
      result.push(oldItem);
    }
  });
  
  return result;
}

function mergeRawField(oldValue: any, newValue: any): any {
  if (Array.isArray(newValue) && Array.isArray(oldValue)) {
    return mergeRawArray(oldValue, newValue);
  }
  if (
    newValue !== null && typeof newValue === "object" &&
    oldValue !== null && typeof oldValue === "object" &&
    !Array.isArray(newValue) && !Array.isArray(oldValue)
  ) {
    return { ...oldValue, ...newValue };
  }
  return newValue;
}

// ---------------------------------------------------------------------------
// POST /api/plots — สร้าง project ใหม่ + บันทึก history (CREATE)
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const payload = token ? verifyToken(token) : null;

  try {
    const body = await request.json();

    // กำหนด user_id
    let userId: string;
    if (payload) {
      userId = await getUserIdentifier(payload);
    } else if (body.userId) {
      userId = body.userId;
    } else {
      userId = await generateGuestUserId();
    }

    // กำหนด project_id
    let projectId: string;
    if (payload && body.projectId) {
      projectId = body.projectId;
    } else if (body.projectId) {
      projectId = body.projectId;
    } else {
      projectId = generateGuestProjectId();
    }

    const plantationInfo = body.plantationInfo ?? {};
    const polygonsPayload = body.polygonsPayload ?? [];
    const backendResponses = body.backendResponses ?? [];
    const frontendPlots = body.frontendPlots ?? [];

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Check if project already exists
      const existing = await client.query(
        `SELECT id FROM carbon_projects WHERE user_id = $1 AND project_id = $2 AND status = 'active'`,
        [userId, projectId]
      );

      let savedRow;

      if ((existing.rowCount ?? 0) > 0) {
        // ดึงข้อมูลเดิมก่อน update เพื่อ merge raw fields
        const oldResult = await client.query(
          `SELECT plantation_info, polygons_payload, backend_responses FROM carbon_projects WHERE id = $1`,
          [existing.rows[0].id]
        );
        const oldRow = oldResult.rows[0] ?? {};

        // Update existing record
        let mergedPlantationInfo = mergeRawField(oldRow.plantation_info, plantationInfo);
        let mergedPolygonsPayload = mergeRawField(oldRow.polygons_payload, polygonsPayload);
        let mergedBackendResponses = mergeRawField(oldRow.backend_responses, backendResponses);

        const updateResult = await client.query(
          `UPDATE carbon_projects
           SET plantation_info = $1, polygons_payload = $2, backend_responses = $3, frontend_plots = $4, updated_at = NOW()
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
             (user_id, project_id, plantation_info, polygons_payload, backend_responses, frontend_plots)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [
            userId,
            projectId,
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

  // Guest ต้องส่ง user_id มาทาง query string
  const { searchParams } = new URL(request.url);
  const guestUserId = searchParams.get("guest_user_id");

  const userId = payload
    ? await getUserIdentifier(payload)
    : guestUserId;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ดึงข้อมูลเดิมก่อน soft delete
    const existing = await client.query(
      `SELECT * FROM carbon_projects WHERE user_id = $1 AND status = 'active'`,
      [userId]
    );

    // Soft Delete
    await client.query(
      `UPDATE carbon_projects
       SET status = 'deleted', deleted_at = NOW(), updated_at = NOW()
       WHERE user_id = $1 AND status = 'active'`,
      [userId]
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
