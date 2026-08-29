import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { isAdminOrRnd } from "@/lib/auth-server";

// Mirrors the dropdown options in app/(admin)/rnd/data-management/page.tsx —
// duplicated here so the server enforces the same allowed values rather
// than trusting whatever the client sends.
const RUBBER_CLONE_OPTIONS = ["RRIM 600", "RRIT 251"];
const GROWTH_MODEL_OPTIONS = ["cubic_poly", "chapman_richards", "gompertz", "schumacher", "weibull"];
const ALLOMETRY_OPTIONS = ["hytonen_2018", "chiarawipa_2024"];

const EXPECTED_ROW_COUNT = 36; // age 0-35

type BiomassRowInput = {
  age: number;
  dbhEst: number | null;
  agb: number | null;
  bgb: number | null;
  biomassEst: number | null;
  ci: number | null;
  biomassCiLower: number | null;
  biomassCiUpper: number | null;
};

/**
 * POST /api/rnd/biomass-profile
 * Batch-imports a biomass lookup CSV (already parsed client-side — see
 * extractBiomassRows in the data-management page) into tbl_biomass_profile,
 * keyed by "pCode" + "clone" + "growthModel" + "allometry" + each row's age.
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminOrRnd(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { pCode, version, clone, growthModel, allometry, rows } = body as {
      pCode?: unknown; version?: unknown; clone?: unknown; growthModel?: unknown; allometry?: unknown; rows?: unknown;
    };

    if (typeof pCode !== "string" || !pCode.trim()) {
      return NextResponse.json({ error: "ต้องระบุ p_code" }, { status: 400 });
    }
    if (typeof clone !== "string" || !RUBBER_CLONE_OPTIONS.includes(clone)) {
      return NextResponse.json({ error: "พันธุ์ยาง (clone) ไม่ถูกต้อง" }, { status: 400 });
    }
    if (typeof growthModel !== "string" || !GROWTH_MODEL_OPTIONS.includes(growthModel)) {
      return NextResponse.json({ error: "สมการ Growth Model ไม่ถูกต้อง" }, { status: 400 });
    }
    if (typeof allometry !== "string" || !ALLOMETRY_OPTIONS.includes(allometry)) {
      return NextResponse.json({ error: "สมการ Allometry ไม่ถูกต้อง" }, { status: 400 });
    }
    if (version !== undefined && version !== null && (typeof version !== "string" || version.length > 10)) {
      return NextResponse.json({ error: "version ต้องเป็นข้อความไม่เกิน 10 ตัวอักษร" }, { status: 400 });
    }
    if (!Array.isArray(rows) || rows.length !== EXPECTED_ROW_COUNT) {
      return NextResponse.json({ error: `ต้องมีข้อมูล ${EXPECTED_ROW_COUNT} แถว (age 0-35)` }, { status: 400 });
    }

    const province = await pool.query("SELECT 1 FROM geo_thailand WHERE p_code = $1", [pCode]);
    if (province.rows.length === 0) {
      return NextResponse.json({ error: `ไม่พบ p_code "${pCode}" ใน geo_thailand` }, { status: 400 });
    }

    const age: number[] = [];
    const dbhEst: (number | null)[] = [];
    const agb: (number | null)[] = [];
    const bgb: (number | null)[] = [];
    const biomassEst: (number | null)[] = [];
    const ci: (number | null)[] = [];
    const biomassCiLower: (number | null)[] = [];
    const biomassCiUpper: (number | null)[] = [];

    for (const row of rows as BiomassRowInput[]) {
      if (typeof row?.age !== "number" || !Number.isInteger(row.age)) {
        return NextResponse.json({ error: "พบแถวที่ไม่มีค่า age เป็นจำนวนเต็ม" }, { status: 400 });
      }
      age.push(row.age);
      dbhEst.push(row.dbhEst ?? null);
      agb.push(row.agb ?? null);
      bgb.push(row.bgb ?? null);
      biomassEst.push(row.biomassEst ?? null);
      ci.push(row.ci ?? null);
      biomassCiLower.push(row.biomassCiLower ?? null);
      biomassCiUpper.push(row.biomassCiUpper ?? null);
    }

    const result = await pool.query(
      `INSERT INTO tbl_biomass_profile
         (p_code, clone, growth_model, allometry, age, dbh_est, agb, bgb, biomass_est, ci, biomass_ci_lower, biomass_ci_upper, version)
       SELECT $1, $2, $3, $4, u.age, u.dbh_est, u.agb, u.bgb, u.biomass_est, u.ci, u.biomass_ci_lower, u.biomass_ci_upper, $5
       FROM unnest($6::integer[], $7::float8[], $8::float8[], $9::float8[], $10::float8[], $11::float8[], $12::float8[], $13::float8[])
         AS u(age, dbh_est, agb, bgb, biomass_est, ci, biomass_ci_lower, biomass_ci_upper)
       RETURNING id`,
      [pCode, clone, growthModel, allometry, version ?? null, age, dbhEst, agb, bgb, biomassEst, ci, biomassCiLower, biomassCiUpper]
    );

    return NextResponse.json({ rowCount: result.rowCount, pCode, clone, growthModel, allometry });
  } catch (err) {
    console.error("biomass-profile import error:", err);
    // Postgres unique_violation on (p_code, clone, growth_model, allometry, age)
    const pgCode = (err as { code?: string } | undefined)?.code;
    if (pgCode === "23505") {
      return NextResponse.json(
        { error: "มีข้อมูล biomass profile สำหรับจังหวัด/พันธุ์/สมการนี้อยู่แล้วในระบบ" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
