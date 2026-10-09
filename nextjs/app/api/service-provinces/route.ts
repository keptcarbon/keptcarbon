import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

/**
 * GET /api/service-provinces
 * The provinces users can draw and assess plots in: every province with a
 * tbl_region_config row (the same test the backend applies). Feeds map-draw's
 * "เลือกพื้นที่" ภาค / จังหวัด dropdowns, so a province appears there as soon
 * as R&D saves its config.
 *
 * Names come from geo_subdistrict -- the same Thai region/province strings
 * the location tour (/plots/locate) sets -- so both paths select the same
 * dropdown values.
 */
export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT rc.p_code,
              g.prov_name_th AS province_th,
              (SELECT s.region_th FROM geo_subdistrict s
               WHERE s.province_th = g.prov_name_th AND s.region_th IS NOT NULL
               LIMIT 1) AS region_th
       FROM tbl_region_config rc
       JOIN geo_thailand g ON g.p_code = rc.p_code
       ORDER BY region_th, province_th`
    );

    return NextResponse.json({
      provinces: rows
        .filter((r) => r.region_th && r.province_th)
        .map((r) => ({ pCode: r.p_code, provinceTh: r.province_th, regionTh: r.region_th })),
    });
  } catch (err) {
    console.error("service-provinces API error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
