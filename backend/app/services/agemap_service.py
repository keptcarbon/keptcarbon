import json
from datetime import datetime

from fastapi import HTTPException
from shapely.geometry import shape

from app.core.database import get_pool
from app.services.tree_service import TreeService


class AgeMapService:
    def __init__(self):
        self.tree_svc = TreeService()

    # $1 = plantation geometry (GeoJSON, EPSG:32647 -- matches geo_establishment_year's
    # SRID, no reprojection needed, see landuse_service module docstring for why
    # A302_geometry/merged_geometry stay in UTM). $2 = p_code, $3 = year.
    _VALUE_COUNT_QUERY = """
        WITH target AS (
            SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 32647) AS geom
        ),
        clipped AS (
            SELECT ST_Clip(ST_Union(g.rast, 1), (SELECT geom FROM target), true) AS band
            FROM geo_establishment_year g
            WHERE g.p_code = $2
              AND g.year = $3::integer
              AND ST_Intersects(g.rast, (SELECT geom FROM target))
        )
        SELECT vc.value::integer AS value, vc.count AS count
        FROM clipped, LATERAL ST_ValueCount(clipped.band, 1, true) AS vc(value, count)
        WHERE clipped.band IS NOT NULL
        ORDER BY count DESC
    """

    @staticmethod
    async def _latest_year(conn, p_code: str) -> int | None:
        return await conn.fetchval(
            "SELECT MAX(year) FROM geo_establishment_year WHERE p_code = $1", p_code
        )

    async def get_plantation_year_count(self, poly_data: dict) -> dict:
        p_code = poly_data.get("province_code")

        try:
            pool = get_pool()
            async with pool.acquire() as conn:
                year = await self._latest_year(conn, p_code)

                if year is None:
                    raise HTTPException(
                        status_code=400,
                        detail=f"AGE RASTER NOT AVAILABLE FOR PROVINCE: {p_code}"
                    )

                key = "A302_geometry" if poly_data.get("merged_geometry") is None else "merged_geometry"
                plantation_geom = shape(poly_data[key])

                # Skip microscopic geometries to avoid degenerate clips
                if plantation_geom.area == 0:
                    poly_data["_cached_year_counts"] = []
                    return poly_data

                rows = await conn.fetch(
                    self._VALUE_COUNT_QUERY,
                    json.dumps(poly_data[key]),
                    p_code,
                    year,
                )
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Raster extraction failed: {str(e)}")

        sorted_by_counts_desc = [(row["value"], row["count"]) for row in rows]
        poly_data["_cached_year_counts"] = sorted_by_counts_desc  # Cache for reuse in age cohorts
        return poly_data

    async def get_plantation_age_cohorts(self, poly_data: dict) -> list:
        # Re-use cached counts to avoid duplicate raster I/O
        if poly_data.get("_cached_year_counts") is None:
            poly_data = await self.get_plantation_year_count(poly_data)

        counts = poly_data["_cached_year_counts"]
        total_pixels = sum(count for _, count in counts)

        if total_pixels == 0:
            return []

        current_year = datetime.now().year

        result = [None] * len(counts)
        for idx, (yr, count) in enumerate(counts):
            tree_info = self.tree_svc.get_tree_count_raster_pixel(poly_data, int(count), total_pixels)
            result[idx] = {
                "age": int(current_year - yr),
                "pixel_count": int(count),
                "proportion": round(count / total_pixels, 4),
                "tree_count": tree_info["tree_count"],
            }
        return result

    async def get_plantation_year_of_planting_info(self, poly_data: dict) -> dict:
        if poly_data.get("_cached_year_counts") is None:
            poly_data = await self.get_plantation_year_count(poly_data)

        counts = poly_data["_cached_year_counts"]
        total_pixels = sum(count for _, count in counts)

        formatted_shares = []

        # Loop through the elements ordered by highest pixel count descending
        for year, count in counts:
            percentage = round(count / total_pixels, 4) * 100 if total_pixels > 0 else 0.0

            if year == 0:
                year_string = "NA"
            else:
                year_string = str(int(year))

            share_string = f"{year_string} ({percentage:.1f}%)"
            formatted_shares.append(share_string)

        return formatted_shares