import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { verifyToken, AUTH_COOKIE } from "@/lib/jwt";

/** DELETE /api/plots/[id] — ลบแปลงตาม id (เจ้าของหรือ admin เท่านั้น) */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = verifyToken(token);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const whereClause =
      payload.role === "admin"
        ? "WHERE id = $1"
        : "WHERE id = $1 AND user_id = $2";
    const resolvedParams = await params;
    const queryParams =
      payload.role === "admin" ? [resolvedParams.id] : [resolvedParams.id, payload.userId];

    const result = await pool.query(
      `DELETE FROM carbon_projects ${whereClause} RETURNING id`,
      queryParams
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/plots/[id] error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/** PATCH /api/plots/[id] — อัปเดต field ที่ส่งมา (เจ้าของเท่านั้น) */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = verifyToken(token);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();

    const setClauses: string[] = [];
    const values: unknown[] = [];

    // snake_case mapping from camelCase keys
    const keyMap: Record<string, string> = {
      name: "name",
      variety: "variety",
      spacing: "spacing",
      trees: "trees",
      plantStatus: "plant_status",
      ownerName: "owner_name",
      province: "province",
      plantYearBE: "plant_year_be",
      backendData: "backend_data",
      // Carbon result fields (reset when carbon-affecting fields change)
      processed: "processed",
      carbonTotal: "carbon_total",
      rubberAge: "rubber_age",
      carbonProfile: "carbon_profile",
      forecast: "forecast",
    };

    // Fields that need JSON serialization
    const jsonFields = new Set(["backendData", "carbonProfile", "forecast"]);
    // Fields that should be set to NULL when value is null/undefined explicitly passed
    const nullableFields = new Set(["carbonProfile", "forecast"]);

    for (const [camel, col] of Object.entries(keyMap)) {
      if (body[camel] !== undefined) {
        const val = body[camel];
        if (nullableFields.has(camel) && (val === null || (Array.isArray(val) && val.length === 0))) {
          values.push(null);
        } else if (jsonFields.has(camel) && val !== null) {
          values.push(JSON.stringify(val));
        } else {
          values.push(val);
        }
        setClauses.push(`${col} = $${values.length}`);
      }
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const resolvedParams = await params;
    values.push(resolvedParams.id, payload.userId);
    const result = await pool.query(
      `UPDATE carbon_projects
       SET ${setClauses.join(", ")}, updated_at = NOW()
       WHERE id = $${values.length - 1} AND user_id = $${values.length}
       RETURNING id`,
      values
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("PATCH /api/plots/[id] error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
