import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { verifyToken, AUTH_COOKIE } from "@/lib/jwt";
import { getUserUuid, mergeRawField, rowToProject } from "@/lib/carbon-projects";
import { shadowUpsertProject, shadowSoftDeleteProjectById } from "@/lib/normalized-plots";


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
      const userUuid = payload ? await getUserUuid(payload) : null;
      const isOwner = row.user_uuid
        ? userUuid === row.user_uuid
        : (() => {
            // Guest project → ต้องส่ง guest_key ที่ตรงกันมา
            const { searchParams } = new URL(request.url);
            return searchParams.get("guest_user_id") === row.guest_key;
          })();
      if (!isOwner) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

      // ตรวจสอบสิทธิ์: เจ้าของ (uuid ตรงกัน) หรือ guest ที่ถือ guest_key ตรงกัน
      if (payload?.role !== "admin") {
        const userUuid = payload ? await getUserUuid(payload) : null;
        const isOwner = oldRow.user_uuid
          ? userUuid === oldRow.user_uuid
          : body.userId === oldRow.guest_key;
        if (!isOwner) {
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
        projectId: { col: "project_name", json: false },
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
         SET ${setClauses.join(", ")}
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

      try {
        await shadowUpsertProject(
          {
            id: newRow.id,
            userUuid: newRow.user_uuid,
            guestUuid: newRow.guest_key,
            projectName: newRow.project_name,
            status: newRow.status,
            deletedAt: newRow.deleted_at,
            createdAt: newRow.created_at,
            updatedAt: newRow.updated_at,
          },
          {
            plantationInfo: body.plantationInfo,
            polygonsPayload: body.polygonsPayload,
            backendResponses: body.backendResponses,
            frontendPlots: body.frontendPlots,
          }
        );
      } catch (shadowErr) {
        console.error("[normalized-plots] shadow write failed for project", newRow.id, shadowErr);
      }

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

      // ตรวจสอบสิทธิ์: เจ้าของ (uuid ตรงกัน) หรือ guest ที่ถือ guest_key ตรงกัน
      if (payload?.role !== "admin") {
        const userUuid = payload ? await getUserUuid(payload) : null;
        const isOwner = oldRow.user_uuid
          ? userUuid === oldRow.user_uuid
          : guestUserId === oldRow.guest_key;
        if (!isOwner) {
          await client.query("ROLLBACK");
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
      }

      // Soft Delete: เปลี่ยน status เป็น 'deleted' (updated_at handled by trigger)
      await client.query(
        `UPDATE carbon_projects
         SET status = 'deleted', deleted_at = NOW()
         WHERE id = $1`,
        [projectId]
      );

      await client.query("COMMIT");

      try {
        await shadowSoftDeleteProjectById(projectId);
      } catch (shadowErr) {
        console.error("[normalized-plots] shadow soft-delete (single) failed for project", projectId, shadowErr);
      }

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
