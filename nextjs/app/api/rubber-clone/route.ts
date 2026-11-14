import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

/**
 * GET /api/rubber-clone
 * Rubber clone lookup list from tbl_rubber_clone -- feeds the map-draw
 * "พันธุ์ยาง" dropdown (ParcelResultsPanel). Ordered by id (table order),
 * not alphabetically.
 */
export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT id, clone, clone_origin, clone_use, clone_site_trait, clone_desc
       FROM tbl_rubber_clone
       ORDER BY id`
    );

    return NextResponse.json({
      rows: rows.map((r) => ({
        id: r.id,
        clone: r.clone,
        cloneOrigin: r.clone_origin,
        cloneUse: r.clone_use,
        cloneSiteTrait: r.clone_site_trait,
        cloneDesc: r.clone_desc,
      })),
    });
  } catch (err) {
    console.error("rubber-clone list error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
