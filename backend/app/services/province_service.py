"""
Province / service-area detection via PostGIS (geo_thailand table).

Replaces the old in-memory geopandas + TH_PROVINCE.gpkg sindex lookup: the
polygon (or point, for /plots/nav) is matched against geo_thailand with a
single ST_Intersects/ST_Intersection query, ranked by overlap area computed
on the geography type (spheroidal area in m², independent of UTM zone).
"""
import json

from fastapi import HTTPException

from app.core.database import get_pool


class ProvinceService:
    # `best` only has a row when something actually intersects; the LEFT JOIN
    # keeps the outer row (and therefore target_area_m2) even when it's empty.
    _QUERY = """
        WITH target AS (
            SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 4326) AS geom
        ),
        best AS (
            SELECT gt.p_code,
                   ST_Area(ST_Intersection(gt.geom, target.geom)::geography) AS intersect_area_m2
            FROM geo_thailand gt, target
            WHERE ST_Intersects(gt.geom, target.geom)
            ORDER BY intersect_area_m2 DESC
            LIMIT 1
        )
        SELECT ST_Area(target.geom::geography) AS target_area_m2, best.p_code AS p_code
        FROM target
        LEFT JOIN best ON TRUE
    """

    async def get_province(self, poly_data: dict) -> dict:
        try:
            pool = get_pool()
            async with pool.acquire() as conn:
                row = await conn.fetchrow(self._QUERY, json.dumps(poly_data["geometry"]))
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"PROVINCE IDENTIFICATION FAILED: {str(e)}"
            )

        poly_data["total_area_m2"] = round(row["target_area_m2"], 4)

        if row["p_code"] is None:
            poly_data["province_code"] = None
            poly_data["status"] = {
                "status": "error", "status_code": "E01",
                "message": "DRAWN POLYGON DOES NOT INTERSECT WITH ANY SUPPORTED THAI PROVINCES."
            }
            return poly_data

        poly_data["province_code"] = row["p_code"]
        poly_data["status"] = {
            "status": "success", "status_code": "S01",
            "message": f"EXTRACT P_CODE: {poly_data['province_code']} SUCCESSFULLY."
        }
        return poly_data
