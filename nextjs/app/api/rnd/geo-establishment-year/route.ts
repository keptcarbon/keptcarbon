import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { isAdminOrRnd } from "@/lib/auth-server";

// Matches the tiling already used by the table's existing rows (equivalent
// to `raster2pgsql -t 100x100`) — one huge single-row raster is slow to
// query/index compared to many small tiles.
const TILE_SIZE = 100;

/**
 * POST /api/rnd/geo-establishment-year
 * Imports a GeoTIFF (multipart "file") into geo_establishment_year, keyed by
 * "pCode" (province code from geo_thailand) and "year" (integer). The raster
 * is decoded server-side by PostGIS's ST_FromGDALRaster (SRID read straight
 * from the file's own embedded projection), then split into 100×100-pixel
 * tiles via ST_Tile — one row per tile, not one row for the whole raster.
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminOrRnd(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const pCode = formData.get("pCode");
    const yearRaw = formData.get("year");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "ต้องแนบไฟล์ .tif" }, { status: 400 });
    }
    if (typeof pCode !== "string" || !pCode.trim()) {
      return NextResponse.json({ error: "ต้องระบุ p_code" }, { status: 400 });
    }
    if (typeof yearRaw !== "string" || !/^\d+$/.test(yearRaw.trim())) {
      return NextResponse.json({ error: "year ต้องเป็นตัวเลขปี" }, { status: 400 });
    }
    const year = Number(yearRaw);

    const province = await pool.query("SELECT 1 FROM geo_thailand WHERE p_code = $1", [pCode]);
    if (province.rows.length === 0) {
      return NextResponse.json({ error: `ไม่พบ p_code "${pCode}" ใน geo_thailand` }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const result = await pool.query(
      `INSERT INTO geo_establishment_year (p_code, year, rast)
       SELECT $1, $2, tile
       FROM ST_Tile(ST_FromGDALRaster($3), $4, $4) AS tile
       RETURNING rid`,
      [pCode, year, buffer, TILE_SIZE]
    );

    return NextResponse.json({ tileCount: result.rowCount, pCode, year });
  } catch (err) {
    console.error("geo-establishment-year import error:", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    // ST_FromGDALRaster throws a Postgres error (not our own validation) when
    // the bytes aren't a raster GDAL can decode — surface that as a 400.
    const isRasterDecodeError = /raster|gdal/i.test(message);
    return NextResponse.json(
      { error: isRasterDecodeError ? "ไม่สามารถอ่านไฟล์เป็นข้อมูล raster ได้ — ตรวจสอบว่าเป็นไฟล์ GeoTIFF ที่ถูกต้อง" : "Internal Server Error" },
      { status: isRasterDecodeError ? 400 : 500 }
    );
  }
}
