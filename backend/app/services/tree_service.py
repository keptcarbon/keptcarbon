"""
Tree count reliability check.
"""

from fastapi import HTTPException

from app.core.database import get_pool
from app.services.spatial_utils import SpatialUtils
from app.core.constants import (
    TREE_COUNT_VALIDATION_THRESHOLD,
    TREE_AGE_HOMOLOGOUS_THRESHOLD,
)

# Last-resort fallback only -- used if a province somehow has no
# tbl_region_config row / tbl_tree_density match by the time this runs.
# Callers upstream (CarbonService.generate_carbon_profile) already reject
# unsupported provinces before reaching here, so this should not trigger
# in practice.
_FALLBACK_SPACING = "2.5x8"
_FALLBACK_DENSITY = 500

class TreeService:
    def __init__(self):
        self.spatial_utils = SpatialUtils()

    async def _resolve_spacing_and_density(self, poly_data: dict) -> tuple[str, int]:
        """Resolve the spacing system (user input, else the province's
        default_spacing from tbl_region_config) and its tree density
        (tbl_tree_density)."""
        p_code = poly_data.get("province_code")
        spacing = poly_data.get("spacing_system")

        try:
            pool = get_pool()
            async with pool.acquire() as conn:
                if not spacing:
                    config_row = await conn.fetchrow(
                        "SELECT default_spacing FROM tbl_region_config WHERE p_code = $1",
                        p_code,
                    )
                    spacing = config_row["default_spacing"] if config_row else _FALLBACK_SPACING

                density_row = await conn.fetchrow(
                    "SELECT tree_density_ha FROM tbl_tree_density WHERE tree_spacing = $1",
                    spacing,
                )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to load tree density config: {str(e)}")

        density = density_row["tree_density_ha"] if density_row else _FALLBACK_DENSITY
        return spacing, density

    async def get_tree_count_user_input(self, poly_data: dict) -> dict:
        geom = poly_data.get("A302_geometry")
        area_ha = self.spatial_utils.calculate_area_ha(geom)

        _, density = await self._resolve_spacing_and_density(poly_data)

        calculated_count = int(area_ha * density)

        user_tree_count = poly_data.get("tree_count")

        if user_tree_count is None:
            return {
                "tree_count": calculated_count,
                "is_calculated": True,
                "note": "CALCULATED FROM AREA AND SPACING."
            }

        if calculated_count == 0:
            # Can't validate against a zero-area calculation — trust the
            # user's number as-is rather than reporting 0 trees.
            return {
                "tree_count": user_tree_count,
                "is_calculated": False,
                "note": "USER INPUT USED — CALCULATED AREA IS ZERO, CANNOT VALIDATE."
            }

        positive_diff_percent = (user_tree_count - calculated_count) / calculated_count

        if positive_diff_percent <= TREE_COUNT_VALIDATION_THRESHOLD:
            return {
                "tree_count": user_tree_count,
                "is_calculated": False,
                "note": "USER INPUT VALIDATED AGAINST AREA."
            }

        return {
            "tree_count": calculated_count,
            "is_calculated": True,
            "note": (
                f"USER INPUT ({user_tree_count}) DEVIATED >{TREE_COUNT_VALIDATION_THRESHOLD*100}% "
                f"FROM CALCULATED ({calculated_count}). USED CALCULATED VALUE."
            )
        }

    async def get_tree_count_raster_pixel(self, poly_data: dict, num_pixel: int, total_pixels: int) -> dict:
        geom = poly_data.get("A302_geometry")
        area_ha = self.spatial_utils.calculate_area_ha(geom)

        if (num_pixel / total_pixels) > TREE_AGE_HOMOLOGOUS_THRESHOLD:
            # If the age map data is dominated by one age class, we will use the calculated tree count based on area
            # and spacing without adjustment, as the age homogeneity suggests that the plantation is likely to have
            # use user-input spacing to estimate tree density across the area or use default spacing if no user-input is provided.
            _, density = await self._resolve_spacing_and_density(poly_data)

            calculated_count = int(area_ha * density)

        else: # if found age heterogeneity, we will use the pixel ratio to adjust the calculated tree count,
              # which is derived from area and use default spacing, to get a more accurate estimation of tree count for the specific polygon.
            area_ha = area_ha * (num_pixel / total_pixels)
            density = 500
            calculated_count = int(area_ha * density)

        return {
            "tree_count": calculated_count,
            "is_calculated": True,
            "note": (
                "USE RASTER DATA TO ESTIMATE TREE COUNT."
                "THUS, USED CALCULATED TREE COUNT."
            )
        }
