from fastapi import HTTPException

from app.services.province_service import ProvinceService
from app.services.landuse_service import LanduseService
from app.core.database import get_pool


class PlotsService:
    def __init__(self):
        self.pro_svc = ProvinceService()
        self.lu_svc = LanduseService()

    async def get_plots_info(self, poly_data: dict) -> dict:
        poly_data = await self.pro_svc.get_province(poly_data)
        if poly_data.get("province_code") is None:
            return {
                "polygon_id": poly_data.get("id"),
                "province_code": None,
                "geometry": poly_data.get("geometry"),
                "area_m2": poly_data.get("total_area_m2"),
                "status": poly_data.get("status"),
                "lu_polygon": None
            }

        poly_data = await self.lu_svc.find_lu_class_area(poly_data)

        return {
            "polygon_id": poly_data.get("id"),
            "province_code": poly_data.get("province_code"),
            "geometry": poly_data.get("geometry"),
            "area_m2": poly_data.get("total_area_m2"),
            "status": poly_data.get("status"),
            "lu_polygon": poly_data.get("lu_polygon")
        }

    async def get_plots_nav_info(self, latlon_data: dict) -> dict:
        point_data = {
            "id": "nav-point",
            "geometry": {
                "type": "Point",
                "coordinates": [latlon_data["lon"], latlon_data["lat"]]
            }
        }
        point_data = await self.pro_svc.get_province(point_data)
        province_code = point_data.get("province_code")

        if province_code is None:
            return {
                "supported": False,
                "province_code": None,
                "message": "POINT DOES NOT INTERSECT WITH ANY THAI PROVINCE."
            }

        try:
            pool = get_pool()
            async with pool.acquire() as conn:
                supported = await conn.fetchval(
                    "SELECT 1 FROM tbl_region_config WHERE p_code = $1", province_code
                )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to load region config: {str(e)}")

        if not supported:
            return {
                "supported": False,
                "province_code": province_code,
                "message": f"PROVINCE '{province_code}' IS NOT CURRENTLY SUPPORTED BY THE SYSTEM."
            }

        return {
            "supported": True,
            "province_code": province_code,
            "message": f"POINT IS WITHIN SUPPORTED PROVINCE '{province_code}'."
        }

