import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { isAdminOrRnd } from "@/lib/auth-server";

/**
 * GET /api/rnd/region-config-options?pCode=...
 * Feeds the R&D configuration page's region-config panel: the saved
 * tbl_region_config row for a province (if any), plus the real option lists
 * for each of its dropdowns — sourced from whichever table actually owns
 * that data, not hardcoded:
 *   - Planting Year / LU Map / Biomass Profile Version
 *                                    -> imported versions in tbl_dataset_version,
 *                                       each with its status (draft/active/archived);
 *                                       saving the config activates the chosen ones
 *   - Default Spacing System         -> tbl_tree_density.tree_spacing (global, no p_code)
 *   - Default Rubber Clone           -> distinct tbl_biomass_profile.clone
 *   - Default Growth Model           -> distinct tbl_biomass_profile.growth_model
 *   - Default Biomass Assessment Method -> distinct tbl_biomass_profile.allometry
 */
export async function GET(request: NextRequest) {
  if (!(await isAdminOrRnd(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const pCode = searchParams.get("pCode");
  if (!pCode) {
    return NextResponse.json({ error: "ต้องระบุ pCode" }, { status: 400 });
  }

  try {
    const [configResult, versionResult, spacingResult, cloneResult, growthResult, allometryResult] =
      await Promise.all([
        pool.query(
          `SELECT p_code, p_name, lu_version, planting_year_version, default_spacing, default_clone, default_growth, default_allometry, biomass_profile_version
           FROM tbl_region_config WHERE p_code = $1`,
          [pCode]
        ),
        pool.query(
          `SELECT category, version, status FROM tbl_dataset_version
           WHERE p_code = $1 AND category IN ('planting_year_map', 'lulc_map', 'biomass_profile')
           ORDER BY created_at DESC`,
          [pCode]
        ),
        pool.query(`SELECT tree_spacing FROM tbl_tree_density ORDER BY tree_spacing`),
        pool.query(`SELECT DISTINCT clone FROM tbl_biomass_profile WHERE p_code = $1 ORDER BY clone`, [pCode]),
        pool.query(`SELECT DISTINCT growth_model FROM tbl_biomass_profile WHERE p_code = $1 ORDER BY growth_model`, [pCode]),
        pool.query(`SELECT DISTINCT allometry FROM tbl_biomass_profile WHERE p_code = $1 ORDER BY allometry`, [pCode]),
      ]);

    const versionsOf = (category: string) =>
      versionResult.rows
        .filter((r) => r.category === category)
        .map((r) => ({ value: String(r.version), status: r.status as string }));

    const row = configResult.rows[0];

    return NextResponse.json({
      config: row
        ? {
            pCode: row.p_code,
            pName: row.p_name,
            luVersion: row.lu_version,
            plantingYearVersion: row.planting_year_version,
            defaultSpacing: row.default_spacing,
            defaultClone: row.default_clone,
            defaultGrowth: row.default_growth,
            defaultAllometry: row.default_allometry,
            biomassProfileVersion: row.biomass_profile_version,
          }
        : null,
      plantingYearVersionOptions: versionsOf("planting_year_map"),
      luVersionOptions: versionsOf("lulc_map"),
      spacingOptions: spacingResult.rows.map((r) => String(r.tree_spacing)),
      cloneOptions: cloneResult.rows.map((r) => String(r.clone)),
      growthOptions: growthResult.rows.map((r) => String(r.growth_model)),
      allometryOptions: allometryResult.rows.map((r) => String(r.allometry)),
      biomassProfileVersionOptions: versionsOf("biomass_profile"),
    });
  } catch (err) {
    console.error("region-config-options error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
