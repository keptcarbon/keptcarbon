import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

/**
 * GET /api/geo-thailand
 * Region + province reference list from geo_thailand, keyed by p_code —
 * used to scope R&D dataset imports (map-draw carbon assessment tables use
 * p_code as the province key).
 */
export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT p_code, prov_code, prov_name_th, prov_name_en, region
       FROM geo_thailand
       ORDER BY region, prov_name_th`
    );

    return NextResponse.json({
      provinces: rows.map((r) => ({
        pCode: r.p_code,
        provCode: r.prov_code,
        nameTh: r.prov_name_th,
        nameEn: r.prov_name_en,
        region: r.region,
      })),
    });
  } catch (err) {
    console.error("geo-thailand API error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
