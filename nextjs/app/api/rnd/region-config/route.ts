import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { isAdminOrRnd } from "@/lib/auth-server";

const MAX_P_NAME_LENGTH = 100;
const MAX_SPACING_LENGTH = 20;
const MAX_CLONE_GROWTH_ALLOMETRY_LENGTH = 50;

type RegionConfigInput = {
  pCode?: unknown;
  pName?: unknown;
  luVersion?: unknown;
  plantingYearVersion?: unknown;
  defaultSpacing?: unknown;
  defaultClone?: unknown;
  defaultGrowth?: unknown;
  defaultAllometry?: unknown;
};

/**
 * POST /api/rnd/region-config
 * Upserts (insert or update, keyed by p_code) a row in tbl_region_config —
 * the "บันทึกการตั้งค่า" action for the R&D configuration page's region-config
 * panel. Every dropdown value is re-validated against the same live tables
 * that populate its options (GET /api/rnd/region-config-options), so a
 * stale/tampered submission can't write a value that doesn't actually exist
 * in geo_planting_year / geo_landuse / tbl_tree_density /
 * tbl_biomass_profile.
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminOrRnd(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = (await request.json()) as RegionConfigInput;
    const { pCode, pName, luVersion, plantingYearVersion, defaultSpacing, defaultClone, defaultGrowth, defaultAllometry } = body;

    if (typeof pCode !== "string" || !pCode.trim()) {
      return NextResponse.json({ error: "ต้องระบุ p_code" }, { status: 400 });
    }
    if (typeof pName !== "string" || !pName.trim() || pName.length > MAX_P_NAME_LENGTH) {
      return NextResponse.json({ error: `ต้องระบุชื่อจังหวัด (ไม่เกิน ${MAX_P_NAME_LENGTH} ตัวอักษร)` }, { status: 400 });
    }
    if (typeof luVersion !== "number" || !Number.isInteger(luVersion)) {
      return NextResponse.json({ error: "LU Map Version ต้องเป็นตัวเลขปี" }, { status: 400 });
    }
    if (typeof plantingYearVersion !== "number" || !Number.isInteger(plantingYearVersion)) {
      return NextResponse.json({ error: "Planting Year Map Version ต้องเป็นตัวเลขปี" }, { status: 400 });
    }
    if (typeof defaultSpacing !== "string" || !defaultSpacing.trim() || defaultSpacing.length > MAX_SPACING_LENGTH) {
      return NextResponse.json({ error: "ต้องระบุ Default Spacing System" }, { status: 400 });
    }
    for (const [label, val] of [
      ["Default Rubber Clone", defaultClone],
      ["Default Growth Model", defaultGrowth],
      ["Default Biomass Assessment Method", defaultAllometry],
    ] as const) {
      if (typeof val !== "string" || !val.trim() || val.length > MAX_CLONE_GROWTH_ALLOMETRY_LENGTH) {
        return NextResponse.json({ error: `ต้องระบุ ${label}` }, { status: 400 });
      }
    }

    const province = await pool.query("SELECT 1 FROM geo_thailand WHERE p_code = $1", [pCode]);
    if (province.rows.length === 0) {
      return NextResponse.json({ error: `ไม่พบ p_code "${pCode}" ใน geo_thailand` }, { status: 400 });
    }

    // Re-validate every value against the same live tables the dropdown
    // options came from — not just the client's word for it.
    const [plantingYearResult, luVersionResult, spacingResult, cloneResult, growthResult, allometryResult] = await Promise.all([
      pool.query(`SELECT 1 FROM geo_planting_year WHERE p_code = $1 AND year = $2 LIMIT 1`, [pCode, plantingYearVersion]),
      pool.query(`SELECT 1 FROM geo_landuse WHERE p_code = $1 AND lu_year = $2 LIMIT 1`, [pCode, luVersion]),
      pool.query(`SELECT 1 FROM tbl_tree_density WHERE tree_spacing = $1 LIMIT 1`, [defaultSpacing]),
      pool.query(`SELECT 1 FROM tbl_biomass_profile WHERE p_code = $1 AND clone = $2 LIMIT 1`, [pCode, defaultClone]),
      pool.query(`SELECT 1 FROM tbl_biomass_profile WHERE p_code = $1 AND growth_model = $2 LIMIT 1`, [pCode, defaultGrowth]),
      pool.query(`SELECT 1 FROM tbl_biomass_profile WHERE p_code = $1 AND allometry = $2 LIMIT 1`, [pCode, defaultAllometry]),
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
    if (cloneResult.rows.length === 0) {
      return NextResponse.json({ error: `ไม่พบพันธุ์ยาง "${defaultClone}" สำหรับ ${pCode} ใน tbl_biomass_profile` }, { status: 400 });
    }
    if (growthResult.rows.length === 0) {
      return NextResponse.json({ error: `ไม่พบ Growth Model "${defaultGrowth}" สำหรับ ${pCode} ใน tbl_biomass_profile` }, { status: 400 });
    }
    if (allometryResult.rows.length === 0) {
      return NextResponse.json({ error: `ไม่พบ Allometry "${defaultAllometry}" สำหรับ ${pCode} ใน tbl_biomass_profile` }, { status: 400 });
    }

    const result = await pool.query(
      `INSERT INTO tbl_region_config
         (p_code, p_name, lu_version, planting_year_version, default_spacing, default_clone, default_growth, default_allometry)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (p_code) DO UPDATE SET
         p_name = EXCLUDED.p_name,
         lu_version = EXCLUDED.lu_version,
         planting_year_version = EXCLUDED.planting_year_version,
         default_spacing = EXCLUDED.default_spacing,
         default_clone = EXCLUDED.default_clone,
         default_growth = EXCLUDED.default_growth,
         default_allometry = EXCLUDED.default_allometry
       RETURNING p_code, p_name, lu_version, planting_year_version, default_spacing, default_clone, default_growth, default_allometry`,
      [pCode, pName, luVersion, plantingYearVersion, defaultSpacing, defaultClone, defaultGrowth, defaultAllometry]
    );

    const row = result.rows[0];
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
      },
    });
  } catch (err) {
    console.error("region-config upsert error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
