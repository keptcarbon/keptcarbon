import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { isAdminOrRnd } from "@/lib/auth-server";
import { activateVersion, archiveActive, getRequesterId, syncPlantingYearDist, withTransaction } from "@/lib/dataset-version";

const MAX_P_NAME_LENGTH = 100;
const MAX_SPACING_LENGTH = 20;
const MAX_CLONE_GROWTH_ALLOMETRY_LENGTH = 50;

type RegionConfigInput = {
  pCode?: unknown;
  pName?: unknown;
  luVersion?: unknown;
  plantingYearVersion?: unknown;
  biomassProfileVersion?: unknown;
  defaultSpacing?: unknown;
  defaultClone?: unknown;
  defaultGrowth?: unknown;
  defaultAllometry?: unknown;
};

/**
 * GET /api/rnd/region-config
 * Every saved tbl_region_config row (all provinces) — the
 * "รายการค่าตั้งต้น" list tab on the R&D configuration page.
 */
export async function GET(request: NextRequest) {
  if (!(await isAdminOrRnd(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { rows } = await pool.query(
      `SELECT rc.p_code, rc.p_name, g.prov_name_th, g.region, rc.lu_version, rc.planting_year_version,
              rc.default_spacing, rc.default_clone, rc.default_growth, rc.default_allometry,
              rc.biomass_profile_version
       FROM tbl_region_config rc
       LEFT JOIN geo_thailand g ON g.p_code = rc.p_code
       ORDER BY g.region, g.prov_name_th`
    );

    return NextResponse.json({
      configs: rows.map((r) => ({
        pCode: r.p_code,
        provinceName: r.prov_name_th ?? r.p_name,
        region: r.region ?? null,
        luVersion: r.lu_version,
        plantingYearVersion: r.planting_year_version,
        defaultSpacing: r.default_spacing,
        defaultClone: r.default_clone,
        defaultGrowth: r.default_growth,
        defaultAllometry: r.default_allometry,
        biomassProfileVersion: r.biomass_profile_version,
      })),
    });
  } catch (err) {
    console.error("region-config list error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * POST /api/rnd/region-config
 * Upserts (insert or update, keyed by p_code) a row in tbl_region_config —
 * the "บันทึกการตั้งค่า" action for the R&D configuration page's region-config
 * panel. Every dropdown value is re-validated against the same live tables
 * that populate its options (GET /api/rnd/region-config-options), so a
 * stale/tampered submission can't write a value that doesn't actually exist
 * in geo_planting_year / geo_landuse / tbl_tree_density /
 * tbl_biomass_profile.
 *
 * Saving is also how a dataset version goes into use: the chosen LU /
 * Planting Year / Biomass Profile versions (any imported version in
 * tbl_dataset_version — draft, active or archived) become 'active' and the
 * previously active ones 'archived', in the same transaction as the upsert.
 * The planting_year_distribution status then follows the chosen map pair.
 *
 * plantingYearVersion may be null: a province with LU data but no
 * planting-year raster yet can still be served -- users must then enter the
 * year of planting themselves (the backend returns E04 without it). Saving
 * null archives the province's active planting-year map, if any.
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminOrRnd(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = (await request.json()) as RegionConfigInput;
    const { pCode, pName, luVersion, plantingYearVersion, biomassProfileVersion, defaultSpacing, defaultClone, defaultGrowth, defaultAllometry } = body;

    if (typeof pCode !== "string" || !pCode.trim()) {
      return NextResponse.json({ error: "ต้องระบุ p_code" }, { status: 400 });
    }
    if (typeof pName !== "string" || !pName.trim() || pName.length > MAX_P_NAME_LENGTH) {
      return NextResponse.json({ error: `ต้องระบุชื่อจังหวัด (ไม่เกิน ${MAX_P_NAME_LENGTH} ตัวอักษร)` }, { status: 400 });
    }
    if (typeof luVersion !== "number" || !Number.isInteger(luVersion)) {
      return NextResponse.json({ error: "LU Map Version ต้องเป็นตัวเลขปี" }, { status: 400 });
    }
    if (plantingYearVersion !== null && (typeof plantingYearVersion !== "number" || !Number.isInteger(plantingYearVersion))) {
      return NextResponse.json({ error: "Planting Year Map Version ต้องเป็นตัวเลขปี หรือไม่ระบุ (ยังไม่มีแผนที่ปีปลูก)" }, { status: 400 });
    }
    if (typeof defaultSpacing !== "string" || !defaultSpacing.trim() || defaultSpacing.length > MAX_SPACING_LENGTH) {
      return NextResponse.json({ error: "ต้องระบุ Default Spacing System" }, { status: 400 });
    }
    for (const [label, val] of [
      ["Default Rubber Clone", defaultClone],
      ["Default Growth Model", defaultGrowth],
      ["Default Biomass Assessment Method", defaultAllometry],
      ["Biomass Profile Version", biomassProfileVersion],
    ] as const) {
      if (typeof val !== "string" || !val.trim() || val.length > MAX_CLONE_GROWTH_ALLOMETRY_LENGTH) {
        return NextResponse.json({ error: `ต้องระบุ ${label}` }, { status: 400 });
      }
    }

    const province = await pool.query("SELECT 1 FROM geo_thailand WHERE p_code = $1", [pCode]);
    if (province.rows.length === 0) {
      return NextResponse.json({ error: `ไม่พบ p_code "${pCode}" ใน geo_thailand` }, { status: 400 });
    }

    // Every chosen version must be a registered import of this province.
    const registered = await pool.query(
      `SELECT category, version FROM tbl_dataset_version
       WHERE p_code = $1 AND category IN ('planting_year_map', 'lulc_map', 'biomass_profile')`,
      [pCode]
    );
    const isRegistered = (category: string, version: string) =>
      registered.rows.some((r) => r.category === category && r.version === version);
    for (const [category, version, label] of [
      ...(plantingYearVersion === null ? [] : [["planting_year_map", String(plantingYearVersion), "Planting Year Map"] as const]),
      ["lulc_map", String(luVersion), "LU Map"] as const,
      ["biomass_profile", biomassProfileVersion as string, "Biomass Profile"] as const,
    ]) {
      if (!isRegistered(category, version)) {
        return NextResponse.json(
          { error: `ไม่พบ ${label} เวอร์ชัน "${version}" ของ ${pCode} ในรายการข้อมูลที่นำเข้า` },
          { status: 400 }
        );
      }
    }

    // Re-validate every value against the same live tables the dropdown
    // options came from — not just the client's word for it.
    //
    // clone/growth/allometry/biomassProfileVersion are checked as ONE
    // combined lookup, not four independent ones -- CarbonService.
    // generate_carbon_profile queries tbl_biomass_profile with clone +
    // growth_model + allometry (+ p_code) together, so a value that merely
    // exists somewhere in the table for each column individually (but never
    // together on the same row) would save here yet return zero rows at
    // calculation time. version isn't part of that runtime query, but is
    // included here anyway since it's sourced from the same table and a
    // combination whose version doesn't actually match the saved
    // clone/growth/allometry rows would be a misleading label to persist.
    const [plantingYearResult, luVersionResult, spacingResult, biomassProfileResult] = await Promise.all([
      plantingYearVersion === null
        ? Promise.resolve({ rows: [{}] })
        : pool.query(`SELECT 1 FROM geo_planting_year WHERE p_code = $1 AND year = $2 LIMIT 1`, [pCode, plantingYearVersion]),
      pool.query(`SELECT 1 FROM geo_landuse WHERE p_code = $1 AND lu_year = $2 LIMIT 1`, [pCode, luVersion]),
      pool.query(`SELECT 1 FROM tbl_tree_density WHERE tree_spacing = $1 LIMIT 1`, [defaultSpacing]),
      pool.query(
        `SELECT 1 FROM tbl_biomass_profile WHERE p_code = $1 AND clone = $2 AND growth_model = $3 AND allometry = $4 AND version = $5 LIMIT 1`,
        [pCode, defaultClone, defaultGrowth, defaultAllometry, biomassProfileVersion]
      ),
    ]);
    if (plantingYearResult.rows.length === 0) {
      return NextResponse.json({ error: `ไม่พบข้อมูล Planting Year ${plantingYearVersion} สำหรับ ${pCode} ใน geo_planting_year` }, { status: 400 });
    }
    if (luVersionResult.rows.length === 0) {
      return NextResponse.json({ error: `ไม่พบข้อมูล LU ${luVersion} สำหรับ ${pCode} ใน geo_landuse` }, { status: 400 });
    }
    if (spacingResult.rows.length === 0) {
      return NextResponse.json({ error: `ไม่พบระบบระยะปลูก "${defaultSpacing}" ใน tbl_tree_density` }, { status: 400 });
    }
    if (biomassProfileResult.rows.length === 0) {
      return NextResponse.json(
        { error: `ไม่พบข้อมูล biomass profile สำหรับชุดค่า พันธุ์ยาง "${defaultClone}" / Growth Model "${defaultGrowth}" / Allometry "${defaultAllometry}" / Version "${biomassProfileVersion}" ที่ ${pCode} ใน tbl_biomass_profile — กรุณาตรวจสอบพารามิเตอร์ก่อนบันทึก` },
        { status: 400 }
      );
    }

    const userId = getRequesterId(request);

    const { row, distributionFound } = await withTransaction(async (client) => {
      const result = await client.query(
        `INSERT INTO tbl_region_config
           (p_code, p_name, lu_version, planting_year_version, default_spacing, default_clone, default_growth, default_allometry, biomass_profile_version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (p_code) DO UPDATE SET
           p_name = EXCLUDED.p_name,
           lu_version = EXCLUDED.lu_version,
           planting_year_version = EXCLUDED.planting_year_version,
           default_spacing = EXCLUDED.default_spacing,
           default_clone = EXCLUDED.default_clone,
           default_growth = EXCLUDED.default_growth,
           default_allometry = EXCLUDED.default_allometry,
           biomass_profile_version = EXCLUDED.biomass_profile_version
         RETURNING p_code, p_name, lu_version, planting_year_version, default_spacing, default_clone, default_growth, default_allometry, biomass_profile_version`,
        [pCode, pName, luVersion, plantingYearVersion, defaultSpacing, defaultClone, defaultGrowth, defaultAllometry, biomassProfileVersion]
      );

      if (plantingYearVersion === null) {
        await archiveActive(client, "planting_year_map", pCode);
      } else {
        await activateVersion(client, "planting_year_map", pCode, String(plantingYearVersion), userId);
      }
      await activateVersion(client, "lulc_map", pCode, String(luVersion), userId);
      await activateVersion(client, "biomass_profile", pCode, biomassProfileVersion as string, userId);
      const distributionFound = await syncPlantingYearDist(client, pCode, userId);

      return { row: result.rows[0], distributionFound };
    });

    return NextResponse.json({
      config: {
        pCode: row.p_code,
        pName: row.p_name,
        luVersion: row.lu_version,
        plantingYearVersion: row.planting_year_version,
        defaultSpacing: row.default_spacing,
        defaultClone: row.default_clone,
        defaultGrowth: row.default_growth,
        defaultAllometry: row.default_allometry,
        biomassProfileVersion: row.biomass_profile_version,
      },
      // false = no Planting Year Distribution imported for the chosen
      // LU + Planting Year pair yet.
      distributionFound,
    });
  } catch (err) {
    console.error("region-config upsert error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
