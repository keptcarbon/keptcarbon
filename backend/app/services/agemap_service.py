import rasterio
from rasterio.mask import mask
from shapely.geometry import shape
from collections import Counter
from datetime import datetime
from pathlib import Path
from fastapi import HTTPException
from app.core.constants import REGION_CONFIG
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

        if total_pixels == 0:
            return []

        current_year = datetime.now().year

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
        