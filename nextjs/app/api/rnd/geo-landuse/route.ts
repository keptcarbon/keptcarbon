import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { isAdminOrRnd } from "@/lib/auth-server";

// The .gpkg is required (client-side, before upload) to be surveyed in
// EPSG:32647 (UTM 47N) — matches gen_geo_landuse_sql.py's source projection.
// geo_landuse.geom is stored in EPSG:4326, so every geometry is transformed
// on the way in.
const SOURCE_SRID = 32647;
const TARGET_SRID = 4326;

type LulcRowInput = {
  luCode: string | null;
  luDesTh: string | null;
  luDesEn: string | null;
  lul1Code: string | null;
  lul2Code: string | null;
  luDes: string | null;
  geomWkbHex: string;
};

/**
 * GET /api/rnd/geo-landuse?pCode=...&year=...
 * Existence check used to block re-importing a province+year combination
 * that's already in the table.
 */
export async function GET(request: NextRequest) {
  if (!(await isAdminOrRnd(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const pCode = searchParams.get("pCode");
  const yearRaw = searchParams.get("year");

  if (!pCode || !yearRaw || !/^\d+$/.test(yearRaw)) {
    return NextResponse.json({ error: "ต้องระบุ pCode และ year" }, { status: 400 });
  }

  const result = await pool.query(
    "SELECT 1 FROM geo_landuse WHERE p_code = $1 AND lu_year = $2 LIMIT 1",
    [pCode, Number(yearRaw)]
  );

  return NextResponse.json({ exists: result.rows.length > 0 });
}

/**
 * POST /api/rnd/geo-landuse
 * Batch-imports LULC features (already extracted client-side from a .gpkg —
 * see gpkgBlobToWkbHex in the data-management page) into geo_landuse, keyed
 * by "pCode" (province) and "year" (lu_year). Each row supplies the 6
 * lu_* text fields plus a hex-encoded WKB geometry; the geometry is
 * reprojected 32647 -> 4326 in a single batched INSERT via unnest().
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminOrRnd(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { pCode, year, rows } = body as { pCode?: unknown; year?: unknown; rows?: unknown };

    if (typeof pCode !== "string" || !pCode.trim()) {
      return NextResponse.json({ error: "ต้องระบุ p_code" }, { status: 400 });
    }
    if (typeof year !== "number" || !Number.isInteger(year)) {
      return NextResponse.json({ error: "year ต้องเป็นตัวเลขปี" }, { status: 400 });
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "ไม่มีข้อมูล feature ให้นำเข้า" }, { status: 400 });
    }

    const province = await pool.query("SELECT 1 FROM geo_thailand WHERE p_code = $1", [pCode]);
    if (province.rows.length === 0) {
      return NextResponse.json({ error: `ไม่พบ p_code "${pCode}" ใน geo_thailand` }, { status: 400 });
    }

    const existing = await pool.query(
      "SELECT 1 FROM geo_landuse WHERE p_code = $1 AND lu_year = $2 LIMIT 1",
      [pCode, year]
    );
    if (existing.rows.length > 0) {
      return NextResponse.json({ error: `มีข้อมูลของจังหวัด "${pCode}" ปี ${year} อยู่แล้วในระบบ` }, { status: 409 });
    }

    const luCode: (string | null)[] = [];
    const luDesTh: (string | null)[] = [];
    const luDesEn: (string | null)[] = [];
    const lul1Code: (string | null)[] = [];
    const lul2Code: (string | null)[] = [];
    const luDes: (string | null)[] = [];
    const geomHex: string[] = [];

    for (const row of rows as LulcRowInput[]) {
      if (typeof row?.geomWkbHex !== "string" || !row.geomWkbHex) {
        return NextResponse.json({ error: "พบแถวที่ไม่มีข้อมูล geometry" }, { status: 400 });
      }
      luCode.push(row.luCode ?? null);
      luDesTh.push(row.luDesTh ?? null);
      luDesEn.push(row.luDesEn ?? null);
      lul1Code.push(row.lul1Code ?? null);
      lul2Code.push(row.lul2Code ?? null);
      luDes.push(row.luDes ?? null);
      geomHex.push(row.geomWkbHex);
    }

    const result = await pool.query(
      `INSERT INTO geo_landuse (p_code, lu_year, lu_code, lu_des_th, lu_des_en, lul1_code, lul2_code, lu_des, geom)
       SELECT $1, $2, u.lu_code, u.lu_des_th, u.lu_des_en, u.lul1_code, u.lul2_code, u.lu_des,
              ST_Multi(ST_Transform(ST_SetSRID(ST_GeomFromWKB(decode(u.geom_hex, 'hex')), $3::integer), $4::integer))
       FROM unnest($5::text[], $6::text[], $7::text[], $8::text[], $9::text[], $10::text[], $11::text[])
         AS u(lu_code, lu_des_th, lu_des_en, lul1_code, lul2_code, lu_des, geom_hex)
       RETURNING id`,
      [pCode, year, SOURCE_SRID, TARGET_SRID, luCode, luDesTh, luDesEn, lul1Code, lul2Code, luDes, geomHex]
    );

    return NextResponse.json({ featureCount: result.rowCount, pCode, year });
  } catch (err) {
    console.error("geo-landuse import error:", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    // ST_GeomFromWKB/ST_Transform throw a Postgres error (not our own
    // validation) when a geometry is malformed — surface that as a 400.
    const isGeomError = /geom|wkb|transform|srid/i.test(message);
    return NextResponse.json(
      { error: isGeomError ? `ไม่สามารถนำเข้าข้อมูล geometry ได้: ${message}` : "Internal Server Error" },
      { status: isGeomError ? 400 : 500 }
    );
  }
}
