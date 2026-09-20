import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

/**
 * GET /api/tree-density
 * Planting-spacing lookup list from tbl_tree_density -- feeds the map-draw
 * "ระยะปลูก (ม.)" dropdown (ParcelResultsPanel). Public counterpart of the
 * admin-gated /api/rnd/tree-density used by the R&D configuration page.
 * Ordered by id (table order), not alphabetically.
 */
export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT id, tree_spacing, tree_density_ha, tree_density_rai, "desc" FROM tbl_tree_density ORDER BY id`
    );

    return NextResponse.json({
      rows: rows.map((r) => ({
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
