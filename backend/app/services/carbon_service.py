from datetime import datetime
from typing import List, Dict
from pathlib import Path
import pandas as pd
from fastapi import HTTPException
from app.services.province_service import ProvinceService
from app.services.landuse_service import LanduseService
from app.services.tree_service import TreeService
from app.services.agemap_service import AgeMapService
from app.services.spatial_utils import SpatialUtils

from shapely.geometry import shape, mapping
from shapely.ops import unary_union

from app.core.constants import (
    CARBON_FRACTION,
    CARBON_EQUIVALENT_FACTOR,
    REGION_CONFIG,
    GROWTH_MODEL_YEAR,
    MAX_TREE_AGE,
    CUT_AGE,
)

class CarbonService:
    def __init__(self):
        self.pro_svc = ProvinceService()
        self.lu_svc = LanduseService()
        self.age_map_svc = AgeMapService()
        self.tree_svc = TreeService()
        self.spatial_svc = SpatialUtils()
        self.lookup_file_path = Path("app/data/lookup_tables")


    def generate_carbon_profile(self, poly_data, cohorts) -> list:
        """
        Generates a yearly carbon stock profile (tCO2e) with 95% CI
        by aggregating multiple age cohorts from age 0 to GROWTH_MODEL_YEAR.
        """
        p_code = poly_data.get("province_code")
        config = REGION_CONFIG.get(p_code)
        if config is None:
            raise HTTPException(
                status_code=422,
                detail=f"Province code '{p_code}' is not supported. Supported: {list(REGION_CONFIG.keys())}"
            )

        clone = poly_data.get("rubber_clone") or "RRIM 600"
        growth_model = config.get("model_used", "cubic_poly")
        allometry = config.get("biomass_estimation_method", "hytonen_2018")

        table_key = (clone, growth_model, allometry)
        file_name = config["biomass_estimation_tables"].get(table_key)
        if file_name is None:
            available = list(config["biomass_estimation_tables"].keys())
            raise HTTPException(
                status_code=422,
                detail=f"No lookup table for clone='{clone}', model='{growth_model}', allometry='{allometry}'. "
                       f"Available combinations: {available}"
            )

        try:
            lookup_df = pd.read_csv(self.lookup_file_path / file_name)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to load lookup file: {str(e)}")

        if not cohorts:
            return []

        current_year = datetime.now().year
        projections = []

        # Using max() with a generator expression
        max_age = max(cohort['age'] for cohort in cohorts)
        limit_year = current_year + (GROWTH_MODEL_YEAR -  max_age) # Filter threshold
        print(f"Max cohort age: {max_age}, Profile limit year: {limit_year}")

        for year_offset in range(0, GROWTH_MODEL_YEAR):

            target_year = current_year + year_offset

            if target_year > limit_year:
                break # Exit the loop once pass year threshold

            sum_biomass_est = 0.0
            sum_biomass_lower = 0.0
            sum_biomass_upper = 0.0

            for cohort in cohorts:
                #raw_age = cohort['age'] + year_offset
                # Apply replanting cycle: trees cut and replanted at CUT_AGE
                #if raw_age > CUT_AGE:
                #    future_age = ((raw_age - 1) % 
                # ) + 1
                #else:
                #    future_age = raw_age

                future_age = cohort['age'] + year_offset

                # Check cohort eligibility within the 35-year modeled window 
                if future_age <= GROWTH_MODEL_YEAR:
                    row = lookup_df[lookup_df['Age'] == future_age]
                    if not row.empty:
                        data = row.iloc[0]
                        count = cohort['tree_count']
                        sum_biomass_est += data['Biomass_Est'] * count
                        sum_biomass_lower += data['Biomass_CI_Lower'] * count
                        sum_biomass_upper += data['Biomass_CI_Upper'] * count
            
            # Convert aggregated biomass (kg) to Total Carbon (tC)
            # Formula: (Summed Biomass * Carbon Fraction 0.47) / 1000 to convert kg to tC
            # Then convert tC to tCO2e using the equivalent factor 3.667 (44/12)
            if sum_biomass_est > 0:
                projections.append({
                    "year": target_year,
                    "total_carbon_tCO2e": round((sum_biomass_est * CARBON_FRACTION * CARBON_EQUIVALENT_FACTOR) / 1000.0, 4),
                    "ci_lower_tCO2e": round((sum_biomass_lower * CARBON_FRACTION * CARBON_EQUIVALENT_FACTOR) / 1000.0, 4),
                    "ci_upper_tCO2e": round((sum_biomass_upper * CARBON_FRACTION * CARBON_EQUIVALENT_FACTOR) / 1000.0, 4)
                })

        return projections


    async def get_carbon_profile(self, poly_data) -> dict:
        current_calendar_year = datetime.now().year


        print(f"Received polygon data for carbon profile generation: {poly_data}")

        # Step 1: Determine province code, skip if already set
        print(f"Initial province code in poly_data: {poly_data.get('province_code')}")
        if poly_data.get("province_code") is None:
            poly_data = self.pro_svc.get_province(poly_data)
            print(f"Province code determined: {poly_data.get('province_code')}")

        if poly_data.get("province_code") is None:
            print(f"Error: No valid province code found. Status: {poly_data['status']}")
            return {
                "polygon_id": poly_data.get("id"),
                "status": poly_data.get("status"),
                "carbon_profile": None
            }

        # Step 2: Multi-Polygon Dissolve & Geometry Merge
        poly_data = self.lu_svc.find_rubber_cultivation_area(poly_data)
        if poly_data["merged_geometry"] is None:
            print(f"Error: No valid merged geometry found. Status: {poly_data['status']}")
            return {
                "polygon_id": poly_data.get("id"),
                "status": poly_data.get("status"),
                "carbon_profile": None
            }

        # Step 3: Homogeneity Validation & In-Memory Raster Caching
        planting_year_info = self.age_map_svc.get_plantation_year_check(poly_data)
        print(f"Planting year info: {planting_year_info}")

        # --- BRANCH 1: Heterogeneous Age Space --- 
        # Use all cohorts from raster, but filter out unreliable ones (age > MAX_TREE_AGE)

        if planting_year_info["year"] is None:
            # Heterogeneous age classes — use all cohorts from raster and validate reliability
            # Leveraging our high-speed contextual optimization cache pattern (0ms runtime)
            cohorts = self.age_map_svc.get_plantation_age_cohorts(poly_data)
            print(f"Extracted age cohorts: {cohorts}")

            # Identify undetermined entries where age equates to the current calendar year
            cohorts_with_null_age = [c for c in cohorts if c['age'] > MAX_TREE_AGE]
            print(f"Cohorts with null age: {cohorts_with_null_age}")

            if cohorts_with_null_age:
                reliable_mgs_add = " (NOTE: SOME PIXELS HAVE UNDETERMINED PLANTING YEAR)"
                cohorts = [c for c in cohorts if c['age'] <= MAX_TREE_AGE]
            else:
                reliable_mgs_add = ""

            # Explicit structural safety guard against empty cohort collections after filtering
            if not cohorts:
                reliable_mgs = (
                    "CARBON PROFILE CANNOT BE GENERATED DUE TO UNRELIABLE EXTRACTED YEAR OF PLANTING."
                    " (SOME PIXELS HAVE UNDETERMINED PLANTING YEAR AND/OR TREE AGE IS OVER 28 YEARS.)"
                )
                return {
                    "polygon_id": poly_data["id"],
                    "status": {
                        "status": "error", 
                        "status_code": "E05", 
                        "message": reliable_mgs
                    },
                    "carbon_profile": None
                }

            print(f"Final cohorts used for profile generation: {cohorts}")
            profile = self.generate_carbon_profile(poly_data, cohorts)

            reliable_mgs = (
                "CARBON PROFILE GENERATED USING CALCULATED YEAR "
                "OF PLANTING AND RELIABLE TREE COUNT." + reliable_mgs_add
            )
            return {
                "polygon_id": poly_data["id"],
                "status": {
                    "status": "success", 
                    "status_code": "S04", 
                    "message": reliable_mgs
                },
                "carbon_profile": profile
            }
        # --- BRANCH 2: Majority of UNDETERMINED PLANTING YEAR ---
        elif planting_year_info["year"] == 0:
            # Raster pixels all 0 — year undetermined
            if poly_data.get("year_of_planting") is None:
                reliable_mgs = (
                    "CARBON PROFILE CANNOT BE GENERATED DUE TO UNRELIABLE EXTRACTED YEAR OF PLANTING."
                    " (USER-INPUT YEAR OF PLANTING IS REQUIRED.)"
                )
                return {
                    "polygon_id": poly_data["id"],
                    "status": {
                        "status": "error", 
                        "status_code": "E04", 
                        "message": reliable_mgs
                    },
                    "carbon_profile": None
                }
            
            age = current_year - poly_data["year_of_planting"]
            tree_info = self.tree_svc.get_tree_count_user_input(poly_data)
            cohorts = [{'age': age, 'tree_count': tree_info['tree_count']}]
            profile = self.generate_carbon_profile(poly_data, cohorts)

            message_flag = "RELIABLE" if tree_info['is_reliable'] else "CALCULATED"
            return {
                "polygon_id": poly_data["id"],
                "status": {
                    "status": "success", 
                    "status_code": "S03", 
                    "message": f"CARBON PROFILE GENERATED USING USER-DEFINED YEAR OF PLANTING AND {message_flag} TREE COUNT."
                },
                "carbon_profile": profile
            }

        # --- BRANCH 3: Homogeneous Target Capture ---
        else: 
            if poly_data.get("year_of_planting") is None:
                age = current_calendar_year - planting_year_info["year"]
                tree_info = self.tree_svc.get_tree_count_user_input(poly_data)
                cohorts = [{'age': age, 'tree_count': tree_info['tree_count']}]
                profile = self.generate_carbon_profile(poly_data, cohorts)

                message_flag = "RELIABLE" if tree_info['is_reliable'] else "CALCULATED"
                return {
                    "polygon_id": poly_data["id"],
                    "status": {
                        "status": "success", 
                        "status_code": "S03", 
                        "message": f"CARBON PROFILE GENERATED USING CALCULATED YEAR OF PLANTING AND {message_flag} TREE COUNT."
                    },
                    "carbon_profile": profile
                }
            else:
                age = current_calendar_year - poly_data["year_of_planting"]
                tree_info = self.tree_svc.get_tree_count_user_input(poly_data)
                cohorts = [{'age': age, 'tree_count': tree_info['tree_count']}]
                profile = self.generate_carbon_profile(poly_data, cohorts)

                message_flag = "RELIABLE" if tree_info['is_reliable'] else "CALCULATED"
                return {
                    "polygon_id": poly_data["id"],
                    "status": {
                        "status": "success", 
                        "status_code": "S03", 
                        "message": f"CARBON PROFILE GENERATED USING USER-DEFINED YEAR OF PLANTING AND {message_flag} TREE COUNT."
                    },
                    "carbon_profile": profile
                }
