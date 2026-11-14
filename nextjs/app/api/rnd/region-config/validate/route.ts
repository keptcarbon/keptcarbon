import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { isAdminOrRnd } from "@/lib/auth-server";

type ValidateInput = {
  pCode?: unknown;
  defaultClone?: unknown;
  defaultGrowth?: unknown;
  defaultAllometry?: unknown;
  biomassProfileVersion?: unknown;
};

/**
 * POST /api/rnd/region-config/validate
 * Lets the R&D configuration page's region-config panel check, before
 * saving, whether a candidate (p_code, clone, growth_model, allometry,
 * version) combination actually has rows in tbl_biomass_profile. clone/
 * growth_model/allometry/p_code mirror the exact lookup CarbonService.
 * generate_carbon_profile runs at calculation time (backend/app/services/
 * carbon_service.py) -- that lookup doesn't filter on version, but this
 * check does, since version is sourced from the same table and a
 * combination whose version doesn't actually match would be a misleading
 * label to save. Each dropdown option individually exists somewhere in
 * tbl_biomass_profile (that's how the option lists are populated), but a
 * combination of them never sharing a row would otherwise only surface as
 * a silent empty result during a real carbon calculation.
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminOrRnd(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = (await request.json()) as ValidateInput;
    const { pCode, defaultClone, defaultGrowth, defaultAllometry, biomassProfileVersion } = body;

    for (const [label, val] of [
      ["p_code", pCode],
      ["Default Rubber Clone", defaultClone],
      ["Default Growth Model", defaultGrowth],
      ["Default Biomass Assessment Method", defaultAllometry],
      ["Biomass Profile Version", biomassProfileVersion],
    ] as const) {
      if (typeof val !== "string" || !val.trim()) {
        return NextResponse.json({ error: `ต้องระบุ ${label}` }, { status: 400 });
      }
    }

    const result = await pool.query(
      `SELECT COUNT(*) AS row_count, MIN(age) AS age_min, MAX(age) AS age_max
       FROM tbl_biomass_profile
       WHERE p_code = $1 AND clone = $2 AND growth_model = $3 AND allometry = $4 AND version = $5`,
      [pCode, defaultClone, defaultGrowth, defaultAllometry, biomassProfileVersion]
    );

    const row = result.rows[0];
    const rowCount = Number(row.row_count);

    return NextResponse.json({
      valid: rowCount > 0,
      rowCount,
      ageMin: row.age_min === null ? null : Number(row.age_min),
      ageMax: row.age_max === null ? null : Number(row.age_max),
    });
  } catch (err) {
    console.error("region-config validate error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
