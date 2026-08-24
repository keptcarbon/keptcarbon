"""
Land-use classification / clipping via PostGIS (geo_landuse table).

Replaces the old in-memory geopandas + LU_RYG_2567.gpkg sindex lookup. The
drawn polygon is intersected against geo_landuse (GiST-indexed, filtered by
p_code + the latest lu_year ingested for that province), clipped to the
polygon, grouped by a derived class key, and dissolved -- all server-side.

group_key mirrors the original _determine_group(): LUL1_CODE for U/F/M/W,
the finer LU_CODE for agriculture ("A"), else "OTHER".

CRS is NOT uniform across the two methods -- this matches the original
service exactly, not an arbitrary choice:
  - find_lu_class_area's returned geometries are reprojected to the
    caller's output_crs (default WGS84) for API/display consumption; area
    is computed on the geography type (CRS-independent).
  - find_rubber_cultivation_area's A302_geometry MUST stay in EPSG:32647:
    SpatialUtils.calculate_area() and AgeMapService's rasterio.mask() both
    consume it directly assuming UTM-metre coordinates (the age/tree
    rasters are themselves stored in EPSG:32647), with no reprojection of
    their own. Its area is likewise the planar UTM area of the *unioned*
    per-group geometries, summed per group (not the area of the final
    cross-group union) -- reproducing the original's dissolve-by-group-then-
    sum-of-group-areas behaviour, including its quirk of double-counting an
    area if two different classes' clipped slivers happen to overlap.
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
            FROM geo_landuse g, target
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

    # $4 = selected_lu_classes (text[]). geom kept in EPSG:32647 -- see module
    # docstring; area is the planar UTM sum of per-group unions (not the
    # union of the final cross-group geometry), matching the original.
    _RUBBER_AREA_QUERY = f"""
        WITH target AS (
            SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 4326) AS geom
        ),
        clipped AS (
            SELECT
                {_GROUP_KEY_SQL} AS group_key,
                ST_Intersection(g.geom, target.geom) AS clipped_geom
            FROM geo_landuse g, target
            WHERE g.p_code = $2
              AND g.lu_year = $3::integer
              AND ST_Intersects(g.geom, target.geom)
        ),
        nonempty AS (
            SELECT * FROM clipped WHERE NOT ST_IsEmpty(clipped_geom)
        ),
        selected AS (
            SELECT * FROM nonempty WHERE group_key = ANY($4::text[])
        ),
        per_group AS (
            SELECT group_key, ST_Transform(ST_Union(clipped_geom), 32647) AS geom
            FROM selected
            GROUP BY group_key
        )
        SELECT
            ST_AsGeoJSON(ST_Union(geom)) AS geometry_json,
            SUM(ST_Area(geom)) AS area_m2
        FROM per_group
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

    # ── Existing endpoint (/api/carbon/assess) ─────────────────────────────────────

    async def find_rubber_cultivation_area(self, poly_data: dict) -> dict:
        """Filter A302 rubber parcels intersecting the drawn polygon."""
        p_code = poly_data.get("province_code")
        lu_year = await self._latest_lu_year(p_code)

        if lu_year is None:
            poly_data["A302_geometry"] = None
            poly_data["status"] = {
                "status": "error", "status_code": "E02",
                "message": (
                    "LAND USE DATA NOT AVAILABLE FOR THE SPECIFIED "
                    f"PROVINCE. (P_CODE: {p_code})"
                )
            }
            return poly_data

        try:
            pool = get_pool()
            async with pool.acquire() as conn:
                row = await conn.fetchrow(
                    self._RUBBER_AREA_QUERY,
                    json.dumps(poly_data["geometry"]),
                    p_code,
                    lu_year,
                    poly_data["selected_lu_classes"],
                )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Landuse filtering failed: {str(e)}")

        # No intersecting parcel, or none matched selected_lu_classes -- an
        # empty GeometryCollection (not None) so downstream raster code, which
        # already handles the "nothing selected" case, sees the same shape.
        if row["geometry_json"] is None:
            poly_data["A302_geometry"] = {"type": "GeometryCollection", "geometries": []}
            poly_data["A302_area_m2"] = 0.0
            return poly_data

        poly_data["A302_geometry"] = json.loads(row["geometry_json"])
        poly_data["A302_area_m2"] = round(row["area_m2"], 4)
        return poly_data

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