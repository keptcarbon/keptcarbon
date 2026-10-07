import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

/**
 * GET /api/carbon-sim/province
 * Feeds the province-level carbon simulation page (/dashboard/simulation).
 *
 *   - no pCode   -> { provinces }: every tbl_region_config province that has
 *                   tbl_planting_year_dist rows for its configured map versions.
 *   - ?pCode=RAY -> that province's simulation defaults (tbl_region_config),
 *                   its districts, and rubber area summed by planting year —
 *                   the cohorts the page sends to /carbon/sim.
 *   - &district= -> narrows the cohorts to one district (district_idn).
 *
 * Distribution rows are matched to the config's lu_version /
 * planting_year_version so a stale import can't leak into the totals.
 * year = 0 (no planting year classified) is reported separately as
 * unclassifiedAreaM2 and left out of the cohorts.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const pCode = searchParams.get("pCode");
  const district = searchParams.get("district") || null;

  try {
    if (!pCode) {
      const result = await pool.query(`
        SELECT rc.p_code, rc.p_name, MIN(d.prov_name_th) AS prov_name_th
        FROM tbl_region_config rc
        JOIN tbl_planting_year_dist d
          ON d.p_code = rc.p_code
         AND d.lu_year = rc.lu_version
         AND d.plaining_year = rc.planting_year_version
        GROUP BY rc.p_code, rc.p_name
        ORDER BY rc.p_code
      `);
      return NextResponse.json({
        provinces: result.rows.map((r) => ({ pCode: r.p_code, nameEn: r.p_name, nameTh: r.prov_name_th })),
      });
    }

    const configResult = await pool.query(
      `SELECT p_code, p_name, lu_version, planting_year_version, default_spacing, default_clone,
              default_growth, default_allometry, biomass_profile_version
       FROM tbl_region_config WHERE p_code = $1`,
      [pCode]
    );
    const config = configResult.rows[0];
    if (!config) {
      return NextResponse.json({ error: `ไม่พบการตั้งค่าจังหวัด "${pCode}"` }, { status: 404 });
    }
    const versionParams = [pCode, config.lu_version, config.planting_year_version];

    const [districtsResult, cohortsResult] = await Promise.all([
      pool.query(
        `SELECT district_idn, MIN(district_name_th) AS district_name_th, MIN(prov_name_th) AS prov_name_th,
                SUM(sqr_m_adj) FILTER (WHERE year > 0) AS area_m2
         FROM tbl_planting_year_dist
         WHERE p_code = $1 AND lu_year = $2 AND plaining_year = $3
         GROUP BY district_idn
         ORDER BY district_idn`,
        versionParams
      ),
      pool.query(
        `SELECT year, SUM(sqr_m_adj) AS area_m2
         FROM tbl_planting_year_dist
         WHERE p_code = $1 AND lu_year = $2 AND plaining_year = $3
           AND ($4::text IS NULL OR district_idn = $4)
         GROUP BY year
         ORDER BY year`,
        [...versionParams, district]
      ),
    ]);

    if (district && !districtsResult.rows.some((r) => r.district_idn === district)) {
      return NextResponse.json({ error: `ไม่พบอำเภอ "${district}" ในจังหวัด ${pCode}` }, { status: 404 });
    }

    const cohorts = cohortsResult.rows
      .filter((r) => r.year > 0 && Number(r.area_m2) > 0)
      .map((r) => ({ year: r.year as number, areaM2: Number(r.area_m2) }));
    const unclassified = cohortsResult.rows.find((r) => r.year === 0);

    return NextResponse.json({
      province: {
        pCode: config.p_code,
        nameEn: config.p_name,
        nameTh: districtsResult.rows[0]?.prov_name_th ?? config.p_name,
      },
      config: {
        luVersion: config.lu_version,
        plantingYearVersion: config.planting_year_version,
        spacing: config.default_spacing,
        clone: config.default_clone,
        growthModel: config.default_growth,
        allometry: config.default_allometry,
        biomassProfileVersion: config.biomass_profile_version,
      },
      districts: districtsResult.rows.map((r) => ({
        id: r.district_idn,
        nameTh: r.district_name_th,
        areaM2: Number(r.area_m2 ?? 0),
      })),
      cohorts,
      unclassifiedAreaM2: unclassified ? Number(unclassified.area_m2) : 0,
    });
  } catch (err) {
    console.error("carbon-sim province error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
