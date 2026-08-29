import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { isAdminOrRnd } from "@/lib/auth-server";

type PlantingYearDistRowInput = {
  provCode: string;
  provNameTh: string;
  districtIdn: string;
  districtNameTh: string;
  subdistrictIdn: string;
  subdistrictNameTh: string;
  year: number;
  pixelCount: number;
  sqrM: number;
  percent: number;
  adjSqrM: number;
  sqrMAdj: number;
};

/**
 * POST /api/rnd/planting-year-dist
 * Batch-imports an " Year Distribution" CSV (already parsed
 * client-side — see extractPlantingYearDistRows in the data-management
 * page) into tbl_planting_year_dist. p_code/lu_year/plaining_year aren't in
 * the CSV — they're supplied once here (from the province selector and the
 * two version inputs in step 2) and apply to every row in the batch.
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminOrRnd(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { pCode, luYear, plainingYear, rows } = body as {
      pCode?: unknown; luYear?: unknown; plainingYear?: unknown; rows?: unknown;
    };

    if (typeof pCode !== "string" || !pCode.trim()) {
      return NextResponse.json({ error: "ต้องระบุ p_code" }, { status: 400 });
    }
    if (typeof luYear !== "number" || !Number.isInteger(luYear)) {
      return NextResponse.json({ error: "lu_year ต้องเป็นตัวเลขปี" }, { status: 400 });
    }
    if (typeof plainingYear !== "number" || !Number.isInteger(plainingYear)) {
      return NextResponse.json({ error: "plaining_year ต้องเป็นตัวเลขปี" }, { status: 400 });
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "ไม่มีข้อมูลแถวให้นำเข้า" }, { status: 400 });
    }

    const province = await pool.query("SELECT 1 FROM geo_thailand WHERE p_code = $1", [pCode]);
    if (province.rows.length === 0) {
      return NextResponse.json({ error: `ไม่พบ p_code "${pCode}" ใน geo_thailand` }, { status: 400 });
    }

    const provCode: string[] = [];
    const provNameTh: string[] = [];
    const districtIdn: string[] = [];
    const districtNameTh: string[] = [];
    const subdistrictIdn: string[] = [];
    const subdistrictNameTh: string[] = [];
    const year: number[] = [];
    const pixelCount: number[] = [];
    const sqrM: number[] = [];
    const percent: number[] = [];
    const adjSqrM: number[] = [];
    const sqrMAdj: number[] = [];

    for (const row of rows as PlantingYearDistRowInput[]) {
      if (!Number.isInteger(row?.year) || !Number.isInteger(row?.pixelCount)) {
        return NextResponse.json({ error: "พบแถวที่ year/pixel_count ไม่ใช่จำนวนเต็ม" }, { status: 400 });
      }
      if ([row.sqrM, row.percent, row.adjSqrM, row.sqrMAdj].some((v) => typeof v !== "number" || Number.isNaN(v))) {
        return NextResponse.json(
          { error: "พบแถวที่ sqr_m/percent/adj_sqr_m/sqr_m_adj ไม่ใช่ตัวเลข" },
          { status: 400 }
        );
      }
      if (
        !row.provCode || !row.provNameTh || !row.districtIdn || !row.districtNameTh ||
        !row.subdistrictIdn || !row.subdistrictNameTh
      ) {
        return NextResponse.json({ error: "พบแถวที่ขาดข้อมูลจังหวัด/อำเภอ/ตำบล" }, { status: 400 });
      }

      provCode.push(row.provCode);
      provNameTh.push(row.provNameTh);
      districtIdn.push(row.districtIdn);
      districtNameTh.push(row.districtNameTh);
      subdistrictIdn.push(row.subdistrictIdn);
      subdistrictNameTh.push(row.subdistrictNameTh);
      year.push(row.year);
      pixelCount.push(row.pixelCount);
      sqrM.push(row.sqrM);
      percent.push(row.percent);
      adjSqrM.push(row.adjSqrM);
      sqrMAdj.push(row.sqrMAdj);
    }

    const result = await pool.query(
      `INSERT INTO tbl_planting_year_dist
         (p_code, prov_code, prov_name_th, district_idn, district_name_th, subdistrict_idn, subdistrict_name_th,
          lu_year, plaining_year, year, pixel_count, sqr_m, percent, adj_sqr_m, sqr_m_adj)
       SELECT $1, u.prov_code, u.prov_name_th, u.district_idn, u.district_name_th, u.subdistrict_idn, u.subdistrict_name_th,
              $2, $3, u.year, u.pixel_count, u.sqr_m, u.percent, u.adj_sqr_m, u.sqr_m_adj
       FROM unnest(
              $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[],
              $10::integer[], $11::integer[],
              $12::float8[], $13::float8[], $14::float8[], $15::float8[]
            ) AS u(prov_code, prov_name_th, district_idn, district_name_th, subdistrict_idn, subdistrict_name_th,
                    year, pixel_count, sqr_m, percent, adj_sqr_m, sqr_m_adj)
       RETURNING id`,
      [
        pCode, luYear, plainingYear,
        provCode, provNameTh, districtIdn, districtNameTh, subdistrictIdn, subdistrictNameTh,
        year, pixelCount, sqrM, percent, adjSqrM, sqrMAdj,
      ]
    );

    return NextResponse.json({ rowCount: result.rowCount, pCode, luYear, plainingYear });
  } catch (err) {
    console.error("planting-year-dist import error:", err);
    // Postgres unique_violation on (p_code, subdistrict_idn, lu_year, plaining_year, year)
    const pgCode = (err as { code?: string } | undefined)?.code;
    if (pgCode === "23505") {
      return NextResponse.json(
        { error: "มีข้อมูล Planting Year Distribution บางแถวอยู่แล้วในระบบ (จังหวัด/ตำบล/ปีนี้ซ้ำ)" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
