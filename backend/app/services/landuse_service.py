"""
Land-use classification / clipping via PostGIS (tbl_landuse table).

Replaces the old in-memory geopandas + LU_RYG_2567.gpkg sindex lookup. The
drawn polygon is intersected against tbl_landuse (GiST-indexed, filtered by
p_code + the latest lu_year ingested for that province), clipped to the
polygon, grouped by a derived class key, and dissolved -- all server-side.

group_key mirrors the original _determine_group(): LUL1_CODE for U/F/M/W,
the finer LU_CODE for agriculture ("A"), else "OTHER".

Used only while the user draws a plot (/plots/info): the overlaps help them
pick which parts of the drawn area are their rubber plot. /carbon/assess does
NOT consult tbl_landuse -- it measures the merged area the user selected (see
CarbonService.measure_assessment_area), so a saved plot's result never
depends on which LU version is active later.

find_lu_class_area's geometries are reprojected to the caller's output_crs
(default WGS84) for display; area is geodesic (geography type).
"""
import json
import re

from fastapi import HTTPException

from app.core.database import get_pool


def _parse_srid(crs: str | None, default: int = 4326) -> int:
    if not crs:
        return default
    m = re.search(r"(\d+)", str(crs))
    return int(m.group(1)) if m else default


class LanduseService:
    _GROUP_KEY_SQL = """
        CASE
            WHEN upper(g.lul1_code) IN ('U','F','M','W') THEN upper(g.lul1_code)
            WHEN upper(g.lul1_code) = 'A' THEN g.lu_code
            ELSE 'OTHER'
        END
    """

    _LU_CLASS_QUERY = f"""
        WITH target AS (
            SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 4326) AS geom
        ),
        clipped AS (
            SELECT
                {_GROUP_KEY_SQL} AS group_key,
                g.lu_des_th,
                g.lu_des_en,
                ST_Intersection(g.geom, target.geom) AS clipped_geom
            FROM tbl_landuse g, target
            WHERE g.p_code = $2
              AND g.lu_year = $3::integer
              AND ST_Intersects(g.geom, target.geom)
        ),
        nonempty AS (
            SELECT * FROM clipped WHERE NOT ST_IsEmpty(clipped_geom)
        ),
        dissolved AS (
            SELECT
                group_key,
                MIN(lu_des_th) AS lu_des_th,
                MIN(lu_des_en) AS lu_des_en,
                ST_Union(clipped_geom) AS geom
            FROM nonempty
            GROUP BY group_key
        )
        SELECT
            group_key,
            lu_des_th,
            lu_des_en,
            ST_AsGeoJSON(ST_Transform(geom, $4::integer)) AS geometry_json,
            ST_Area(geom::geography) AS area_m2
        FROM dissolved
    """

    @staticmethod
    async def _latest_lu_year(p_code: str) -> int | None:
        try:
            pool = get_pool()
            async with pool.acquire() as conn:
                version = await conn.fetchval(
                    "SELECT lu_version FROM tbl_region_config WHERE p_code = $1", p_code
                )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to load region config: {str(e)}")
        return int(version) if version is not None else None

    # ── New endpoint (/api/v1/plots/info) ────────────────────────────────

    async def find_lu_class_area(self, poly_data: dict) -> dict:
        """Classify all land use types within the drawn polygon using spatial indexing."""
        p_code = poly_data.get("province_code")
        lu_year = await self._latest_lu_year(p_code)

        if lu_year is None:
            poly_data["lu_polygon"] = []
            poly_data["status"] = {
                "status": "error", "status_code": "E02",
                "message": f"LAND USE DATA NOT AVAILABLE FOR PROVINCE. (P_CODE: {p_code})"
            }
            return poly_data

        try:
            pool = get_pool()
            async with pool.acquire() as conn:
                geometry_json = json.dumps(poly_data["geometry"])
                total_area_m2 = await conn.fetchval(
                    "SELECT ST_Area(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)::geography)",
                    geometry_json,
                )

                srid = _parse_srid(poly_data.get("output_crs"))
                rows = await conn.fetch(self._LU_CLASS_QUERY, geometry_json, p_code, lu_year, srid)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"LAND USE CLASS ANALYSIS FAILED: {str(e)}")

        if not rows:
            poly_data["lu_polygon"] = []
            poly_data["total_area_m2"] = round(total_area_m2, 4)
            return poly_data

        lu_classes_result = []
        for row in rows:
            group_key = row["group_key"]
            if group_key == "U":
                desc_th, desc_en = "สิ่งปลูกสร้าง", "Urban/Built-up Area"
            elif group_key == "F":
                desc_th, desc_en = "ป่าไม้", "Forest"
            elif group_key == "W":
                desc_th, desc_en = "แหล่งน้ำผิวดิน", "Water Body"
            elif group_key == "M":
                desc_th, desc_en = "พื้นที่อื่น ๆ", "Miscellaneous Area"
            else:
                desc_th = row["lu_des_th"] or "N/A"
                desc_en = row["lu_des_en"] or "N/A"

            area_m2 = row["area_m2"]
            percent = (area_m2 / total_area_m2 * 100) if total_area_m2 > 0 else 0
            lu_classes_result.append({
                "lu_class": group_key,
                "lu_class_desc_th": desc_th,
                "lu_class_desc_en": desc_en,
                "geometry": json.loads(row["geometry_json"]),
                "area_m2": round(area_m2, 4),
                "area_percent": round(percent, 2),
            })

        poly_data["lu_polygon"] = lu_classes_result
        poly_data["total_area_m2"] = round(total_area_m2, 4)
        poly_data["status"] = {
            "status": "success", "status_code": "S02",
            "message": "LAND USE CLASSIFICATION AND AREA CALCULATION COMPLETED."
        }
        return poly_data