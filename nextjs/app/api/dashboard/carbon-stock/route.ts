import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

/**
 * GET /api/dashboard/carbon-stock?pCode=RAY
 * Feeds the carbon-stock dashboard (/dashboard/carbon-stock).
 *
 * Returns, for the province's configured Planting Year Distribution
 * (tbl_region_config.planting_year_dist_version = '<lu_year>/<plaining_year>',
 * chosen in the R&D region config; its pair is returned as luVersion /
 * plantingYearVersion):
 *   - config    the simulation defaults the page sends to /carbon/sim
 *   - districts every district with rubber area by planting year
 *               (tbl_planting_year_dist; year = 0 / unclassified excluded) and
 *               its centre from geo_district (cen_lon/cen_lat, matched by name), and
 *               unclassifiedAreaM2 = rubber area with no planting year (year = 0)
 *
 * Carbon is not computed here: the page gets carbon per area by age from
 * /carbon/sim (browser -> backend) and multiplies it by these areas.
 */
export async function GET(request: NextRequest) {
  const pCode = new URL(request.url).searchParams.get("pCode");
  if (!pCode) return NextResponse.json({ error: "pCode is required" }, { status: 400 });

  try {
    const configResult = await pool.query(
      `SELECT p_code, p_name, planting_year_dist_version, default_spacing, default_clone,
              default_growth, default_allometry, biomass_profile_version
       FROM tbl_region_config WHERE p_code = $1`,
      [pCode]
    );
    const config = configResult.rows[0];
    if (!config) {
      return NextResponse.json({ error: `ไม่พบการตั้งค่าจังหวัด "${pCode}"` }, { status: 404 });
    }
    if (!config.planting_year_dist_version) {
      return NextResponse.json({ error: `จังหวัด "${pCode}" ยังไม่มีข้อมูล Planting Year Distribution` }, { status: 404 });
    }
    const [distLuYear, distPlantingYear] = String(config.planting_year_dist_version).split("/").map(Number);

    const { rows } = await pool.query(
      `WITH dist AS (
         SELECT district_idn, MIN(district_name_th) AS district_name_th, MIN(prov_name_th) AS prov_name_th,
                COALESCE(json_agg(json_build_object('year', year, 'areaM2', area_m2) ORDER BY year)
                         FILTER (WHERE year > 0), '[]') AS cohorts,
                COALESCE(SUM(area_m2) FILTER (WHERE year = 0), 0) AS unclassified_m2
         FROM (
           SELECT district_idn, district_name_th, prov_name_th, year, SUM(sqr_m_adj) AS area_m2
           FROM tbl_planting_year_dist
           WHERE p_code = $1 AND lu_year = $2 AND plaining_year = $3
           GROUP BY district_idn, district_name_th, prov_name_th, year
         ) y
         GROUP BY district_idn
       )
       SELECT d.*, g.cen_lon, g.cen_lat
       FROM dist d
       LEFT JOIN geo_district g ON g.name_th = d.district_name_th AND g.province_th = d.prov_name_th
       ORDER BY d.district_idn`,
      [pCode, distLuYear, distPlantingYear]
    );

    return NextResponse.json({
      province: { pCode: config.p_code, nameEn: config.p_name, nameTh: rows[0]?.prov_name_th ?? config.p_name },
      config: {
        luVersion: distLuYear,
        plantingYearVersion: distPlantingYear,
        spacing: config.default_spacing,
        clone: config.default_clone,
        growthModel: config.default_growth,
        allometry: config.default_allometry,
        biomassProfileVersion: config.biomass_profile_version,
      },
      districts: rows.map((r) => ({
        id: r.district_idn,
        nameTh: r.district_name_th,
        lng: r.cen_lon != null ? Number(r.cen_lon) : null,
        lat: r.cen_lat != null ? Number(r.cen_lat) : null,
        cohorts: (r.cohorts as { year: number; areaM2: number }[])
          .map((c) => ({ year: c.year, areaM2: Number(c.areaM2) }))
          .filter((c) => c.areaM2 > 0),
        unclassifiedAreaM2: Number(r.unclassified_m2),
      })),
    });
  } catch (err) {
    console.error("dashboard carbon-stock error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
