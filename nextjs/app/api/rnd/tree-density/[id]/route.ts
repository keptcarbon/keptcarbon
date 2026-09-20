import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { isAdminOrRnd } from "@/lib/auth-server";

const MAX_SPACING_LENGTH = 20;

type TreeDensityInput = {
  treeSpacing?: unknown;
  treeDensityHa?: unknown;
  desc?: unknown;
};

function validate(body: TreeDensityInput) {
  const { treeSpacing, treeDensityHa, desc } = body;

  if (typeof treeSpacing !== "string" || !treeSpacing.trim() || treeSpacing.length > MAX_SPACING_LENGTH) {
    return { error: `ต้องระบุระบบระยะปลูก (ไม่เกิน ${MAX_SPACING_LENGTH} ตัวอักษร)` };
  }
  if (typeof treeDensityHa !== "number" || !Number.isInteger(treeDensityHa) || treeDensityHa <= 0) {
    return { error: "ความหนาแน่น (ต้น/เฮกตาร์) ต้องเป็นจำนวนเต็มมากกว่า 0" };
  }
  if (desc !== undefined && desc !== null && typeof desc !== "string") {
    return { error: "คำอธิบายต้องเป็นข้อความ" };
  }
  return { treeSpacing: treeSpacing.trim(), treeDensityHa, desc: (desc as string | null | undefined) ?? null };
}

/**
 * PUT /api/rnd/tree-density/[id]
 * Edits an existing spacing/density row.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdminOrRnd(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { id: idParam } = await params;
    const id = parseInt(idParam, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const body = (await request.json()) as TreeDensityInput;
    const parsed = validate(body);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const result = await pool.query(
      `UPDATE tbl_tree_density
       SET tree_spacing = $1, tree_density_ha = $2, "desc" = $3
       WHERE id = $4
       RETURNING id, tree_spacing, tree_density_ha, tree_density_rai, "desc"`,
      [parsed.treeSpacing, parsed.treeDensityHa, parsed.desc, id]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const row = result.rows[0];
    return NextResponse.json({
      row: {
        id: row.id,
        treeSpacing: row.tree_spacing,
        treeDensityHa: row.tree_density_ha,
        treeDensityRai: row.tree_density_rai,
        desc: row.desc,
      },
    });
  } catch (err) {
    console.error("tree-density update error:", err);
    const pgCode = (err as { code?: string } | undefined)?.code;
    if (pgCode === "23505") {
      return NextResponse.json({ error: "มีระบบระยะปลูกนี้อยู่แล้วในระบบ" }, { status: 409 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * DELETE /api/rnd/tree-density/[id]
 * Removes a spacing/density row. Blocked (409) if tbl_region_config still
 * references this spacing as a province's default_spacing, so deleting a
 * row can't silently orphan a saved region config.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdminOrRnd(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { id: idParam } = await params;
    const id = parseInt(idParam, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const existing = await pool.query(`SELECT tree_spacing FROM tbl_tree_density WHERE id = $1`, [id]);
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const spacing = existing.rows[0].tree_spacing;

    const inUse = await pool.query(`SELECT 1 FROM tbl_region_config WHERE default_spacing = $1 LIMIT 1`, [spacing]);
    if (inUse.rows.length > 0) {
      return NextResponse.json(
        { error: `ไม่สามารถลบได้ เนื่องจากระบบระยะปลูก "${spacing}" ถูกใช้เป็นค่าตั้งต้นใน Region Config อยู่` },
        { status: 409 }
      );
    }

    await pool.query(`DELETE FROM tbl_tree_density WHERE id = $1`, [id]);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("tree-density delete error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
