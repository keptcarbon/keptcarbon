import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { isAdminOrRnd } from "@/lib/auth-server";
import { FrozenVersionError, getRequesterId, recordImport, withTransaction } from "@/lib/dataset-version";
import { ALLOMETRY_VALUES } from "@/lib/allometry";
import { GROWTH_MODEL_VALUES } from "@/lib/growth-model";

// Mirrors the dropdown options in app/(admin)/rnd/data-management/page.tsx —
// duplicated here so the server enforces the same allowed values rather
// than trusting whatever the client sends.
const RUBBER_CLONE_OPTIONS = ["RRIM 600", "RRIT 251"];

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
 * keyed by "pCode" + "clone" + "growthModel" + "allometry" + "version" +
 * each row's age. Each file is logged under its (pCode, version) entry in
 * tbl_dataset_version; a new clone/growth model/allometry file can be added
 * while that version is a draft or active (not once it's archived).
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminOrRnd(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { pCode, version, clone, growthModel, allometry, rows, fileName } = body as {
      pCode?: unknown; version?: unknown; clone?: unknown; growthModel?: unknown; allometry?: unknown; rows?: unknown; fileName?: unknown;
    };

    if (typeof pCode !== "string" || !pCode.trim()) {
      return NextResponse.json({ error: "ต้องระบุ p_code" }, { status: 400 });
    }
    if (typeof clone !== "string" || !RUBBER_CLONE_OPTIONS.includes(clone)) {
      return NextResponse.json({ error: "พันธุ์ยาง (clone) ไม่ถูกต้อง" }, { status: 400 });
    }
    if (typeof growthModel !== "string" || !GROWTH_MODEL_VALUES.includes(growthModel)) {
      return NextResponse.json({ error: "สมการ Growth Model ไม่ถูกต้อง" }, { status: 400 });
    }
    if (typeof allometry !== "string" || !ALLOMETRY_VALUES.includes(allometry)) {
      return NextResponse.json({ error: "สมการ Allometry ไม่ถูกต้อง" }, { status: 400 });
    }
    // Required: the version is what tbl_dataset_version tracks and what
    // tbl_region_config.biomass_profile_version points at.
    if (typeof version !== "string" || !version.trim() || version.length > 10) {
      return NextResponse.json({ error: "ต้องระบุ version (ข้อความไม่เกิน 10 ตัวอักษร)" }, { status: 400 });
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

    const userId = getRequesterId(request);

    const { rowCount, status } = await withTransaction(async (client) => {
      // Logged first: rejects an archived version before any
      // profile rows are written.
      const logged = await recordImport(client, {
        category: "biomass_profile", pCode, version,
        fileName: typeof fileName === "string" && fileName ? fileName : `biomass_${pCode}_${version}.csv`,
        rowCount: rows.length, detail: { clone, growthModel, allometry }, userId,
      });
      const result = await client.query(
        `INSERT INTO tbl_biomass_profile
           (p_code, clone, growth_model, allometry, age, dbh_est, agb, bgb, biomass_est, ci, biomass_ci_lower, biomass_ci_upper, version)
         SELECT $1, $2, $3, $4, u.age, u.dbh_est, u.agb, u.bgb, u.biomass_est, u.ci, u.biomass_ci_lower, u.biomass_ci_upper, $5
         FROM unnest($6::integer[], $7::float8[], $8::float8[], $9::float8[], $10::float8[], $11::float8[], $12::float8[], $13::float8[])
           AS u(age, dbh_est, agb, bgb, biomass_est, ci, biomass_ci_lower, biomass_ci_upper)
         RETURNING id`,
        [pCode, clone, growthModel, allometry, version, age, dbhEst, agb, bgb, biomassEst, ci, biomassCiLower, biomassCiUpper]
      );
      return { rowCount: result.rowCount, status: logged.status };
    });

    // status: the version's -- "active" when the file was added to the version in use.
    return NextResponse.json({ rowCount, pCode, clone, growthModel, allometry, version, status });
  } catch (err) {
    console.error("biomass-profile import error:", err);
    if (err instanceof FrozenVersionError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    // Postgres unique_violation on (p_code, clone, growth_model, allometry, age)
    const pgCode = (err as { code?: string } | undefined)?.code;
    if (pgCode === "23505") {
      return NextResponse.json(
        { error: "เวอร์ชันนี้มีข้อมูล biomass profile ของพันธุ์ยาง/Growth Model/Allometry ชุดนี้อยู่แล้ว — เลือกชุดค่าอื่น หรือนำเข้าเป็นเวอร์ชันใหม่" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
