import rasterio
import numpy as np
from rasterio.mask import mask
from shapely.geometry import shape
from collections import Counter
from datetime import datetime
from pathlib import Path
from fastapi import HTTPException
from app.core.constants import REGION_CONFIG, TREE_AGE_HOMOLOGOUS_THRESHOLD
from app.services.tree_service import TreeService


class AgeMapService:
    def __init__(self):
        self.base_path = Path("app/data/rasters")
        self.tree_svc = TreeService()
        self.target_crs = "EPSG:32647"
        self._raster_handles = {}

        for p_code, cfg in REGION_CONFIG.items():
            raster_path = self.base_path / cfg["plaining_year_map"]
            if raster_path.exists():
                self._raster_handles[p_code] = rasterio.open(raster_path)
            else:
                print(f"Warning: Age raster file not found for P_CODE: {p_code}")


    def get_plantation_year_count(self, poly_data: dict) -> Counter:
        p_code = poly_data.get("province_code")
        src = self._raster_handles.get(p_code)

        if src is None:
            raise HTTPException(
                status_code=400,
                detail=f"AGE RASTER NOT AVAILABLE FOR PROVINCE: {p_code}"
            )

        try:
            key = "A302_geometry" if poly_data.get("merged_geometry") is None else "merged_geometry"
            plantation_geom = shape(poly_data[key])

            # Skip microscopic geometries to avoid rasterio errors
            if plantation_geom.area == 0:
                return Counter()

            out_image, _ = mask(src, [plantation_geom], crop=True, filled=True, nodata=-9999)

            data = out_image[0]
            nodata_val = src.nodata if src.nodata is not None else -9999
            valid_pixels = data[(data != -9999) & (data != nodata_val)]
            print(f"Valid age pixels count: {len(valid_pixels)} out of {data.size} total pixels")

            # Extract all elements sorted strictly by counts descending
            sorted_by_counts_desc = Counter(valid_pixels).most_common()

            poly_data["_cached_year_counts"] = sorted_by_counts_desc  # Cache for reuse in age cohorts
            return poly_data

        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Raster extraction failed: {str(e)}")

    def get_plantation_age_cohorts(self, poly_data: dict) -> list:
        # Re-use cached counts to avoid duplicate raster I/O
        if poly_data.get("_cached_year_counts") is None:
            poly_data = self.get_plantation_year_count(poly_data)
            
        counts = poly_data["_cached_year_counts"] 

        # If a previous function has already modified this cache into a list of tuples
        if isinstance(counts, list):
            total_pixels = sum(item[1] for item in counts)
            most_common_list = counts
        else:
            # It's a standard Counter/Dict object
            total_pixels = sum(counts.values())
            most_common_list = counts.most_common()
        # --- TYPE GUARD FIX END ---

        if total_pixels == 0:
            return []

        current_year = datetime.now().year
        '''
        most_common_year, max_count = counts.most_common(1)[0]

        if (max_count / total_pixels) > TREE_AGE_HOMOLOGOUS_THRESHOLD:
            tree_info = self.tree_svc.get_tree_count_raster_pixel(poly_data, int(max_count), total_pixels)
            return [{
                "age": int(current_year - most_common_year),
                "pixel_count": int(max_count),
                "proportion": round(max_count / total_pixels, 4),
                "tree_count": tree_info["tree_count"],
            }]
        '''

        result = [None] * len(most_common_list)
        for idx, (yr, count) in enumerate(most_common_list):
            tree_info = self.tree_svc.get_tree_count_raster_pixel(poly_data, int(count), total_pixels)
            result[idx] = {
                "age": int(current_year - yr),
                "pixel_count": int(count),
                "proportion": round(count / total_pixels, 4),
                "tree_count": tree_info["tree_count"],
            }
        return result

    def get_plantation_year_check(self, poly_data: dict) -> dict:
        # Compute and cache counts so get_plantation_age_cohorts can reuse them
        counts = self.get_plantation_year_count(poly_data)
        poly_data["_cached_year_counts"] = counts
        print(f"Year counts for polygon {poly_data['id']}: {counts}")

        total_pixels = sum(counts.values())
        if total_pixels == 0:
            return {"year": None, "is_reliable": False, "note": "EMPTY RANGE OR OUT OF BOUNDS RASTER COVERAGE."}

        most_common_year, max_count = counts.most_common(1)[0]
        print(f"Most common planting year: {most_common_year} with count: {max_count} out of {total_pixels} pixels")

        if (max_count / total_pixels) > TREE_AGE_HOMOLOGOUS_THRESHOLD:
            return {
                "year": int(most_common_year),
                "is_reliable": True,
                "note": "AGE MAP DATA IS DOMINATED BY ONE AGE CLASS; USED MOST COMMON AGE.",
            }

        return {
            "year": None,
            "is_reliable": False,
            "note": (
                "AGE MAP DATA SHOWS HIGH VARIABILITY; CANNOT RELIABLY DETERMINE AGE. "
                "CONSIDER USING USER-INPUT AGE OR OTHER METHODS."
            ),
        }

    def get_plantation_year_of_planting_info(self, poly_data: dict) -> dict:
        if poly_data.get("_cached_year_counts") is None:
            poly_data = self.get_plantation_year_count(poly_data)

        counts = poly_data["_cached_year_counts"] 
        # SAFETY CHECK: If counts is already a list of tuples (from a previous .most_common() call)
        if isinstance(counts, list):
            total_pixels = sum(item[1] for item in counts)
            iterator = counts
        else:
            # It's a Counter/Dict object
            total_pixels = sum(counts.values())
            iterator = counts.most_common()
        
        formatted_shares = []

        # Loop through the elements ordered by highest pixel count descending
        # Loop through the elements safely
        for year, count in iterator:
            percentage = round(count / total_pixels, 4) * 100 if total_pixels > 0 else 0.0

            if year == 0:
                year_string = "NA"
            else:
                year_string = str(int(year))

            share_string = f"{year_string} ({percentage:.1f}%)"
            formatted_shares.append(share_string)

        return formatted_shares
        