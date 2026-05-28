import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { verifyToken, AUTH_COOKIE, JwtPayload } from "@/lib/jwt";

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
// Helper: merge raw JSON arrays — new items replace by index, extra old items preserved
// ป้องกันข้อมูลแปลงที่ถูกลบออกจาก frontend_plots หายไปจาก polygons_payload / backend_responses
// เมื่อมีการประมวลผลแปลงที่เหลืออยู่แค่บางส่วน array ใหม่จะสั้นกว่าเก่า
// → ต่อข้อมูลดิบเก่าที่เกิน index ของ array ใหม่ไว้ท้าย
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

  // If no items have IDs, fallback to original index-based logic (for backward compatibility if needed)
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
  // กรณีเป็น object ให้ merge key (new ทับ old)
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
// GET /api/plots/[id] — ดึง project เดียวตาม id
// ---------------------------------------------------------------------------
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const payload = token ? verifyToken(token) : null;

  try {
    const resolvedParams = await params;
    const projectId = parseInt(resolvedParams.id, 10);

    if (isNaN(projectId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const result = await pool.query(
      `SELECT * FROM carbon_projects WHERE id = $1 AND status = 'active'`,
      [projectId]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const row = result.rows[0];

    // ตรวจสอบสิทธิ์: admin ดูได้ทุกอัน / เจ้าของเท่านั้น
    if (payload?.role !== "admin") {
      const userId = payload
        ? await getUserIdentifier(payload)
        : null;
      if (userId !== row.user_id) {
        // Guest ต้องส่ง guest_user_id มา
        const { searchParams } = new URL(request.url);
        const guestUserId = searchParams.get("guest_user_id");
        if (guestUserId !== row.user_id) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
      }
    }

    return NextResponse.json({ project: rowToProject(row) });
  } catch (err) {
    console.error("GET /api/plots/[id] error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/plots/[id] — อัปเดต project + บันทึก history (UPDATE)
// ---------------------------------------------------------------------------
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const payload = token ? verifyToken(token) : null;

  try {
    const resolvedParams = await params;
    const projectId = parseInt(resolvedParams.id, 10);

    if (isNaN(projectId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const body = await request.json();

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // ดึงข้อมูลเดิมก่อนอัปเดต
      const existing = await client.query(
        `SELECT * FROM carbon_projects WHERE id = $1 AND status = 'active'`,
        [projectId]
      );

      if (existing.rowCount === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      const oldRow = existing.rows[0];

      // ตรวจสอบสิทธิ์
      if (payload?.role !== "admin") {
        const userId = payload
          ? await getUserIdentifier(payload)
          : body.userId;

        // ถ้าโปรเจกต์นี้เป็นของ guest (user_id ขึ้นต้นด้วย guest_) อนุญาตให้อัปเดตได้สำหรับ session ปัจจุบัน
        const isGuestProject = oldRow.user_id?.startsWith("guest_");

        if (!isGuestProject && userId !== oldRow.user_id) {
          await client.query("ROLLBACK");
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
      }

      // สร้าง SET clauses จาก body ที่ส่งมา
      const finalValues: Record<string, any> = {};

      // raw fields ที่ต้อง merge กับข้อมูลเดิม
      const rawMergeMap: Record<string, string> = {
        plantationInfo: "plantation_info",
        polygonsPayload: "polygons_payload",
        backendResponses: "backend_responses",
      };

      const fieldMap: Record<string, { col: string; json: boolean }> = {
        projectId: { col: "project_id", json: false },
        plantationInfo: { col: "plantation_info", json: true },
        polygonsPayload: { col: "polygons_payload", json: true },
        backendResponses: { col: "backend_responses", json: true },
        frontendPlots: { col: "frontend_plots", json: true },
      };

      for (const [camel, { col }] of Object.entries(fieldMap)) {
        if (body[camel] !== undefined) {
          let valueToSave = body[camel];

          // raw fields: merge กับข้อมูลเดิม
          if (camel in rawMergeMap) {
            const oldDbCol = rawMergeMap[camel];
            const oldValue = oldRow[oldDbCol];
            valueToSave = mergeRawField(oldValue, body[camel]);
          }

          finalValues[col] = valueToSave;
        }
      }

      // แปลงเป็น SET clauses สำหรับ SQL
      const setClauses: string[] = [];
      const values: unknown[] = [];
      
      for (const [, { col, json }] of Object.entries(fieldMap)) {
         if (finalValues[col] !== undefined) {
             values.push(json ? JSON.stringify(finalValues[col]) : finalValues[col]);
             setClauses.push(`${col} = $${values.length}`);
         }
      }

      if (setClauses.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "No valid fields to update" },
          { status: 400 }
        );
      }

      // อัปเดต record
      values.push(projectId);
      const updateResult = await client.query(
        `UPDATE carbon_projects
         SET ${setClauses.join(", ")}, updated_at = NOW()
         WHERE id = $${values.length} AND status = 'active'
         RETURNING *`,
        values
      );

      if (updateResult.rowCount === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      const newRow = updateResult.rows[0];

      await client.query("COMMIT");

      return NextResponse.json({
        success: true,
        project: rowToProject(newRow),
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("PATCH /api/plots/[id] error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/plots/[id] — Soft Delete project เดียว
// ---------------------------------------------------------------------------
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const payload = token ? verifyToken(token) : null;

  try {
    const resolvedParams = await params;
    const projectId = parseInt(resolvedParams.id, 10);

    if (isNaN(projectId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const guestUserId = searchParams.get("guest_user_id");

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // ดึงข้อมูลเดิมก่อน soft delete
      const existing = await client.query(
        `SELECT * FROM carbon_projects WHERE id = $1 AND status = 'active'`,
        [projectId]
      );

      if (existing.rowCount === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      const oldRow = existing.rows[0];

      // ตรวจสอบสิทธิ์
      if (payload?.role !== "admin") {
        const userId = payload
          ? await getUserIdentifier(payload)
          : guestUserId;
        if (userId !== oldRow.user_id) {
          await client.query("ROLLBACK");
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
      }

      // Soft Delete: เปลี่ยน status เป็น 'deleted'
      await client.query(
        `UPDATE carbon_projects
         SET status = 'deleted', deleted_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [projectId]
      );

      await client.query("COMMIT");
      return NextResponse.json({ success: true });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("DELETE /api/plots/[id] error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
