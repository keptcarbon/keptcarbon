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
 * GET /api/rnd/tree-density
 * Lists every tbl_tree_density row -- feeds the R&D configuration page's
 * "ความหนาแน่นต้นไม้ตามระยะปลูก" tab (spacing -> trees/ha lookup used by
 * TreeService as the DB-backed replacement for the old TREE_DENSITIES dict).
 */
export async function GET(request: NextRequest) {
  if (!(await isAdminOrRnd(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await pool.query(
      `SELECT id, tree_spacing, tree_density_ha, tree_density_rai, "desc" FROM tbl_tree_density ORDER BY tree_spacing`
    );
    return NextResponse.json({
      rows: result.rows.map((r) => ({
        id: r.id,
        treeSpacing: r.tree_spacing,
        treeDensityHa: r.tree_density_ha,
        treeDensityRai: r.tree_density_rai,
        desc: r.desc,
      })),
    });
  } catch (err) {
    console.error("tree-density list error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * POST /api/rnd/tree-density
 * Adds a new spacing/density row -- the "+" (add) action in the tree-density
 * tab.
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminOrRnd(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = (await request.json()) as TreeDensityInput;
    const parsed = validate(body);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const result = await pool.query(
      `INSERT INTO tbl_tree_density (tree_spacing, tree_density_ha, "desc")
       VALUES ($1, $2, $3)
       RETURNING id, tree_spacing, tree_density_ha, tree_density_rai, "desc"`,
      [parsed.treeSpacing, parsed.treeDensityHa, parsed.desc]
    );

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
    console.error("tree-density create error:", err);
    const pgCode = (err as { code?: string } | undefined)?.code;
    if (pgCode === "23505") {
      return NextResponse.json({ error: "มีระบบระยะปลูกนี้อยู่แล้วในระบบ" }, { status: 409 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
