"""
Administrative-area lookup (province / district / subdistrict) via PostGIS.

For each geometry — a lat/long point, a plot's bounding box, or the combined
bounding box of a project's plots — finds the subdistrict containing its
ST_PointOnSurface, then reports the smallest of subdistrict / district /
province that fully covers the geometry (`level`), with each area's Thai
name and bounding box. Levels that don't fully cover the geometry come back
as null, so a project spread over two districts stops at the province.

Uses the same geo_subdistrict data as tbl_plots.district_th/subdistrict_th
(filled by trigger, migration 027).
"""
import json

from fastapi import HTTPException

from app.core.database import get_pool


def _bbox(row, prefix: str):
    if row[f"{prefix}_xmin"] is None:
        return None
    return [row[f"{prefix}_xmin"], row[f"{prefix}_ymin"], row[f"{prefix}_xmax"], row[f"{prefix}_ymax"]]


class LocationService:
    # geo_province holds some provinces as several rows (e.g. สุราษฎร์ธานี),
    # hence the ST_Union. Bangkok subdistricts have no district_th, so `d` can
    # be empty while `s` still matches.
    _QUERY = """
        WITH g AS (
            SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 4326) AS geom
        ),
        s AS (
            SELECT sd.region_th, sd.province_th, sd.district_th, sd.name_th, sd.geom
            FROM geo_subdistrict sd, g
            WHERE ST_Intersects(sd.geom, ST_PointOnSurface(g.geom))
            ORDER BY sd.id
            LIMIT 1
        ),
        d AS (
            SELECT di.geom
            FROM geo_district di, s
            WHERE di.name_th = s.district_th AND di.province_th = s.province_th
            LIMIT 1
        ),
        p AS (
            SELECT ST_Union(pr.geom) AS geom
            FROM geo_province pr, s
            WHERE pr.name_th = s.province_th
        )
        SELECT s.region_th, s.province_th, s.district_th, s.name_th AS subdistrict_th,
               t.p_code,
               EXISTS (SELECT 1 FROM tbl_region_config rc WHERE rc.p_code = t.p_code) AS supported,
               ST_Covers(s.geom, g.geom) AS in_subdistrict,
               ST_Covers(d.geom, g.geom) AS in_district,
               ST_Covers(p.geom, g.geom) AS in_province,
               ST_XMin(s.geom) AS s_xmin, ST_YMin(s.geom) AS s_ymin,
               ST_XMax(s.geom) AS s_xmax, ST_YMax(s.geom) AS s_ymax,
               ST_XMin(d.geom) AS d_xmin, ST_YMin(d.geom) AS d_ymin,
               ST_XMax(d.geom) AS d_xmax, ST_YMax(d.geom) AS d_ymax,
               ST_XMin(p.geom) AS p_xmin, ST_YMin(p.geom) AS p_ymin,
               ST_XMax(p.geom) AS p_xmax, ST_YMax(p.geom) AS p_ymax
        FROM s
        CROSS JOIN g
        LEFT JOIN d ON TRUE
        LEFT JOIN p ON TRUE
        LEFT JOIN geo_thailand t ON t.prov_name_th = s.province_th
    """

    async def locate(self, items: list[dict]) -> list[dict]:
        try:
            pool = get_pool()
            async with pool.acquire() as conn:
                rows = [await conn.fetchrow(self._QUERY, json.dumps(it["geometry"])) for it in items]
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"LOCATION LOOKUP FAILED: {str(e)}")

        return [self._to_result(it["id"], row) for it, row in zip(items, rows)]

    @staticmethod
    def _to_result(item_id: str, row) -> dict:
        result = {
            "id": item_id, "level": "none", "supported": False,
            "region_th": None, "province_code": None, "province_th": None, "province_bbox": None,
            "district_th": None, "district_bbox": None,
            "subdistrict_th": None, "subdistrict_bbox": None,
        }
        if row is None:
            return result

        in_sub, in_dist, in_prov = row["in_subdistrict"], row["in_district"], row["in_province"]
        # Containment is nested: inside the subdistrict implies inside its
        # district and province (checked explicitly too, but Bangkok has no
        # district row, so in_dist is NULL there).
        in_prov = bool(in_prov or in_dist or in_sub)
        in_dist = bool(in_dist or in_sub)
        # geo_subdistrict has rows without names (Bangkok is one unnamed
        # polygon) — don't report a level we can't name.
        in_sub = bool(in_sub and row["subdistrict_th"])
        in_dist = bool(in_dist and row["district_th"])

        if not in_prov:
            result["level"] = "multi_province"
            return result

        result.update({
            "level": "subdistrict" if in_sub else "district" if in_dist else "province",
            "supported": bool(row["supported"]),
            "region_th": row["region_th"],
            "province_code": row["p_code"],
            "province_th": row["province_th"],
            "province_bbox": _bbox(row, "p"),
        })
        if in_dist:
            result["district_th"] = row["district_th"]
            result["district_bbox"] = _bbox(row, "d")
        if in_sub:
            result["subdistrict_th"] = row["subdistrict_th"]
            result["subdistrict_bbox"] = _bbox(row, "s")
        return result
