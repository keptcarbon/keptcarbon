import type { PoolClient } from "pg";

// Thailand spans two UTM zones; imported LU / planting-year files may be in
// either. The zone is read from the file itself — never configured.
export const UTM_SRIDS = [32647, 32648] as const;

// Share of LU features whose interior point must fall inside the selected
// province. Not 100% because the LU source and geo_thailand may draw the
// border slightly differently.
const LULC_MIN_INSIDE_SHARE = 0.95;
// Share of the province's area the raster's extent must cover. A raster
// exported for this province covers ~100%; a wrong zone or wrong province
// covers little or none.
const RASTER_MIN_PROVINCE_COVERAGE = 0.9;

/** Thrown inside withTransaction to roll back and report a 400. */
export class ImportValidationError extends Error {}

export function isUtmSrid(srid: unknown): srid is number {
  return typeof srid === "number" && (UTM_SRIDS as readonly number[]).includes(srid);
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

/** Checks freshly inserted (already EPSG:4326) LU rows against the province boundary. */
export async function assertLanduseInsideProvince(client: PoolClient, pCode: string, year: number) {
  const { rows } = await client.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE ST_Intersects(ST_PointOnSurface(l.geom), p.geom))::int AS inside
     FROM tbl_landuse l, geo_thailand p
     WHERE l.p_code = $1 AND l.lu_year = $2 AND p.p_code = $1`,
    [pCode, year]
  );
  const { total, inside } = rows[0];
  const share = total > 0 ? inside / total : 0;
  if (share < LULC_MIN_INSIDE_SHARE) {
    throw new ImportValidationError(
      `ข้อมูลอยู่ในเขตจังหวัดที่เลือกเพียง ${pct(share)} (${inside}/${total} features) — ` +
      `ตรวจสอบว่าเลือกจังหวัดถูกต้อง และ CRS ของไฟล์ตรงกับโซน UTM ที่ใช้จริง`
    );
  }
}

/** Checks freshly inserted raster tiles: UTM SRID, and extent covers the province. */
export async function assertRasterCoversProvince(client: PoolClient, pCode: string, year: number) {
  const { rows } = await client.query(
    `WITH t AS (
       SELECT min(ST_SRID(rast)) AS srid_min, max(ST_SRID(rast)) AS srid_max,
              ST_SetSRID(ST_Extent(ST_Envelope(rast))::geometry, min(ST_SRID(rast))) AS ext
       FROM tbl_planting_year WHERE p_code = $1 AND year = $2
     )
     SELECT t.srid_min, t.srid_max,
            ST_Area(ST_Intersection(ST_Transform(t.ext, 4326), p.geom)::geography)
              / NULLIF(ST_Area(p.geom::geography), 0) AS coverage
     FROM t, geo_thailand p WHERE p.p_code = $1`,
    [pCode, year]
  );
  const { srid_min, srid_max, coverage } = rows[0] ?? {};
  if (srid_min !== srid_max || !isUtmSrid(srid_min)) {
    throw new ImportValidationError(`CRS ของ raster ต้องเป็น EPSG:${UTM_SRIDS.join(" หรือ EPSG:")} (พบ SRID ${srid_min})`);
  }
  const share = Number(coverage ?? 0);
  if (share < RASTER_MIN_PROVINCE_COVERAGE) {
    throw new ImportValidationError(
      `ขอบเขต raster ครอบคลุมพื้นที่จังหวัดที่เลือกเพียง ${pct(share)} — ` +
      `ตรวจสอบว่าเลือกจังหวัดถูกต้อง และ CRS ของไฟล์ตรงกับโซน UTM ที่ใช้จริง`
    );
  }
}
