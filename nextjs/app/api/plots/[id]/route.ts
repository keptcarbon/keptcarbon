import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { verifyToken, AUTH_COOKIE } from "@/lib/jwt";
import { getUserUuid, rowToProjectFromNormalized } from "@/lib/carbon-projects";
import { upsertProjectAndPlots, softDeleteProjectById } from "@/lib/normalized-plots";


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
      `SELECT * FROM tbl_projects WHERE id = $1 AND status = 'active'`,
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
            // Guest project → ต้องส่ง guest_uuid ที่ตรงกันมา
            const { searchParams } = new URL(request.url);
            return searchParams.get("guest_user_id") === row.guest_uuid;
          })();
      if (!isOwner) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    return NextResponse.json({ project: rowToProjectFromNormalized(row) });
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
        `SELECT * FROM tbl_projects WHERE id = $1 AND status = 'active'`,
        [projectId]
      );

      if (existing.rowCount === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      const oldRow = existing.rows[0];

      // ตรวจสอบสิทธิ์: เจ้าของ (uuid ตรงกัน) หรือ guest ที่ถือ guest_uuid ตรงกัน
      if (payload?.role !== "admin") {
        const userUuid = payload ? await getUserUuid(payload) : null;
        const isOwner = oldRow.user_uuid
          ? userUuid === oldRow.user_uuid
          : body.userId === oldRow.guest_uuid;
        if (!isOwner) {
          await client.query("ROLLBACK");
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
      }

      // project_name is the only header field PATCH can change directly;
      // plot-level data (frontendPlots/plantationInfo/polygonsPayload/
      // backendResponses) is written by upsertProjectAndPlots below, which
      // already merges per-plot/per-column instead of clobbering whole blobs.
      const updateResult = await client.query(
        `UPDATE tbl_projects
         SET project_name = COALESCE($1, project_name), updated_at = NOW()
         WHERE id = $2 AND status = 'active'
         RETURNING *`,
        [body.projectId ?? null, projectId]
      );

      if (updateResult.rowCount === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      const newRow = updateResult.rows[0];

      await upsertProjectAndPlots(
        client,
        {
          id: newRow.id,
          userUuid: newRow.user_uuid,
          guestUuid: newRow.guest_uuid,
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

      await client.query("COMMIT");

      return NextResponse.json({
        success: true,
        project: rowToProjectFromNormalized(newRow),
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
        `SELECT * FROM tbl_projects WHERE id = $1 AND status = 'active'`,
        [projectId]
      );

      if (existing.rowCount === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      const oldRow = existing.rows[0];

      // ตรวจสอบสิทธิ์: เจ้าของ (uuid ตรงกัน) หรือ guest ที่ถือ guest_uuid ตรงกัน
      if (payload?.role !== "admin") {
        const userUuid = payload ? await getUserUuid(payload) : null;
        const isOwner = oldRow.user_uuid
          ? userUuid === oldRow.user_uuid
          : guestUserId === oldRow.guest_uuid;
        if (!isOwner) {
          await client.query("ROLLBACK");
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
      }

      // Soft Delete: เปลี่ยน status เป็น 'deleted'
      await softDeleteProjectById(client, projectId);

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
