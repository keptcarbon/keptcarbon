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
    MEAN_CUT_TREE_AGE,
    MIX_TREE_PROPORTION,
    TREE_AGE_HOMOLOGOUS_THRESHOLD
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

        if poly_data.get("project_type") == "existing":
            start_year = datetime.now().year
        else:
            start_year = poly_data.get("year_of_planting")

        projections = []

        # Using max() with a generator expression
        max_age = max(cohort['age'] for cohort in cohorts)
        limit_year = start_year + (GROWTH_MODEL_YEAR -  max_age) # Filter threshold
        print(f"Max cohort age: {max_age}, Profile limit year: {limit_year}")

        # Initialize baseline variables before entering the loop
        baseline_carbon = None
        baseline_ci = None
        baseline_lower = None
        baseline_upper = None

        for year_offset in range(0, GROWTH_MODEL_YEAR):

            target_year = start_year + year_offset

            if target_year > limit_year:
                break # Exit the loop once pass year threshold

            sum_biomass_est = 0.0
            sum_biomass_lower = 0.0
            sum_biomass_upper = 0.0

            for cohort in cohorts:
                future_age = cohort['age'] + year_offset

                if len(cohorts) == 1:
                    at_age = cohort['age'] + year_offset
                else:
                    at_age = None

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
            if sum_biomass_est > 0:
                total_carbon_tCO2e = round((sum_biomass_est * CARBON_FRACTION * CARBON_EQUIVALENT_FACTOR) / 1000.0, 4)
                total_carbon_ci_tCO2e = round(((sum_biomass_upper - sum_biomass_lower)/2 * CARBON_FRACTION * CARBON_EQUIVALENT_FACTOR) / 1000.0, 4) 
                total_carbon_ci_lower_tCO2e = round((sum_biomass_lower * CARBON_FRACTION * CARBON_EQUIVALENT_FACTOR) / 1000.0, 4)
                total_carbon_ci_upper_tCO2e = round((sum_biomass_upper * CARBON_FRACTION * CARBON_EQUIVALENT_FACTOR) / 1000.0, 4)

                # CRITICAL CAPTURE: Establish the absolute first year baseline values
                if year_offset == 0:
                    baseline_carbon = total_carbon_tCO2e
                    baseline_ci = total_carbon_ci_tCO2e
                    baseline_lower = total_carbon_ci_lower_tCO2e
                    baseline_upper = total_carbon_ci_upper_tCO2e

                # Calculate cumulative gain by finding the difference from the baseline year
                total_carbon_gain_tCO2e = round(total_carbon_tCO2e - baseline_carbon, 4)

                # LINEAR PROPAGATION: Subtract baseline boundaries directly to track the true variance channel
                total_carbon_gain_ci_lower_tCO2e = round(total_carbon_ci_lower_tCO2e - baseline_lower, 4)
                total_carbon_gain_ci_upper_tCO2e = round(total_carbon_ci_upper_tCO2e - baseline_upper, 4)

                # Re-calculate the half-width margin of error for the gain
                total_carbon_gain_ci_tCO2e = round((total_carbon_gain_ci_upper_tCO2e - total_carbon_gain_ci_lower_tCO2e) / 2.0, 4)

                # Match layout configuration of your structural YearlyEstimate schema
                projections.append({
                    "year": target_year,
                    "year_at": year_offset,
                    "age": at_age,
                    
                    
                    "stocks": {
                        "value": total_carbon_tCO2e,
                        "ci": total_carbon_ci_tCO2e,
                        "ci_lower": total_carbon_ci_lower_tCO2e,
                        "ci_upper": total_carbon_ci_upper_tCO2e
                    },
                    
                    "gain": {
                        "value": total_carbon_gain_tCO2e,
                        "ci": total_carbon_gain_ci_tCO2e,
                        "ci_lower": total_carbon_gain_ci_lower_tCO2e,
                        "ci_upper": total_carbon_gain_ci_upper_tCO2e
                    }
                })

        return projections


    async def get_carbon_profile(self, poly_data) -> dict:
        current_calendar_year = datetime.now().year

        print(f"Received polygon data for carbon profile generation: {poly_data}")

        # Step 1: Determine province code
        poly_data = self.pro_svc.get_province(poly_data)
        print(f"Province code determined: {poly_data.get('province_code')}")

        if poly_data.get("province_code") is None:
            print(f"Error: No valid province code found. Status: {poly_data['status']}")
            return {
                "polygon_id": poly_data.get("id"),
                "status": poly_data.get("status"),
                "carbon_profile": None,
                "estimated_parameters": None
            }

        # Step 2: Multi-Polygon Dissolve & Geometry Merge
        poly_data = self.lu_svc.find_rubber_cultivation_area(poly_data)
        if poly_data["A302_geometry"] is None:
            print(f"Error: No valid merged geometry found. Status: {poly_data['status']}")
            return {
                "polygon_id": poly_data.get("id"),
                "status": poly_data.get("status"),
                "carbon_profile": None,
                "estimated_parameters": None
            }

        # Step 3: Check user input year of planting and tree count for reliability
        # Cache the counts for later use in age cohort extraction to avoid duplicate raster I/O
        poly_data = self.age_map_svc.get_plantation_year_count(poly_data)
        print(f"Year counts for polygon {poly_data['id']}: {poly_data['_cached_year_counts']}")

        if poly_data.get("year_of_planting") is not None:

            if poly_data.get("project_type") == "existing":
                # User input year of planting is available — use it directly to calculate age and generate profile
                age = current_calendar_year - poly_data["year_of_planting"]

                planning_year_info = self.age_map_svc.get_plantation_year_of_planting_info(poly_data)
                print(f"Planning year info: {planning_year_info}")

                tree_info = self.tree_svc.get_tree_count_user_input(poly_data)
                
                cohorts = [{"age": age, 
                            "pixel_count": None,
                            "proportion": 1, 
                            "tree_count": tree_info['tree_count']}
                        ]

                profile = self.generate_carbon_profile(poly_data, cohorts)

                message_flag = "CALCULATED" if tree_info['is_calculated'] else "RELIABLE"

            else: # replanting
                # start at age 0
                age = 0
                planning_year_info = None

                tree_info = self.tree_svc.get_tree_count_user_input(poly_data)
                
                cohorts = [{"age": age, 
                            "pixel_count": None,
                            "proportion": 1, 
                            "tree_count": tree_info['tree_count']}
                        ]

                profile = self.generate_carbon_profile(poly_data, cohorts)

                message_flag = "CALCULATED" if tree_info['is_calculated'] else "RELIABLE"

            return {
                "polygon_id": poly_data["id"],
                "status": {
                    "status": "success", 
                    "status_code": "S03", 
                    "message": f"CARBON PROFILE GENERATED USING USER-INPUT YEAR OF PLANTING AND {message_flag} TREE COUNT."
                },
                "carbon_profile": profile,
                "estimated_parameters": {
                    "area_m2": poly_data["A302_area_m2"],
                    "year_of_planting": {
                        "value": poly_data.get("year_of_planting"),
                        "note": planning_year_info,
                        "source": "user input" if poly_data.get('year_of_planting') else "calculated from raster"
                    },
                    "rubber_clone": {
                        "value": poly_data.get('rubber_clone') if poly_data.get('rubber_clone') else "RRIM 600",
                        "note": "default",
                        "source": "user input" if poly_data.get('rubber_clone') else "default value applied"
                    },
                    "tree_count": {
                        "value": tree_info['tree_count'],
                        "source": "calculated from area and spacing system" if tree_info['is_calculated'] else "user input"
                    },
                    "spacing_system": {
                        "value": poly_data.get('spacing_system') if poly_data.get('spacing_system') else "2.5x8",
                        "source": "user input" if poly_data.get('spacing_system') else "default value applied"
                    }
                }
            }
            

        else:
            print("Error: No user input year of planting found.")
            
            cohorts = self.age_map_svc.get_plantation_age_cohorts(poly_data)
            print(f"Extracted age cohorts: {cohorts}")

            # Find the dictionary containing the maximum proportion value
            dominant_cohort = max(cohorts, key=lambda c: c['proportion'])
            
            highest_proportion = dominant_cohort['proportion']
            print(f"highest_proportion: {highest_proportion}")
            highest_proportion_age = dominant_cohort['age']
            print(f"highest_proportion_age age cohorts: {highest_proportion_age}")

            # Unknow year of planting is highest propotion
            if highest_proportion_age > MAX_TREE_AGE: 
                return {
                    "polygon_id": poly_data["id"],
                    "status": {
                        "status": "error", 
                        "status_code": "E04", 
                        "message": (
                                "CANNOT GENERATE CARBON PROFILE. MAJORITY OF UNIDENTIFIED YEAR OF PLANTING FOUND, "
                                "USER-INPUT YEAR OF PLANTING IS REQUIRED."
                            )
                    },
                    "carbon_profile": None,
                    "estimated_parameters": None
                }

            # Found mojority age
            if highest_proportion > TREE_AGE_HOMOLOGOUS_THRESHOLD:
                
                total_tree_count = sum((cohort.get('tree_count') or 0) for cohort in cohorts)

                cohorts = [{"age": highest_proportion_age, 
                            "pixel_count": None,
                            "proportion": 1, 
                            "tree_count": total_tree_count}
                        ]


            else: # High age VARIABILITY found
                # Identify undetermined entries where age equates to the current calendar year
                cohorts_with_null_age = [c for c in cohorts if c['age'] > MAX_TREE_AGE]
                print(f"Cohorts with null age: {cohorts_with_null_age}")

                reliable_mgs_add = ""
                if cohorts_with_null_age:
                    reliable_mgs_add = " (NOTE: EXCLUDE SOME PIXELS WITH UNDETERMINED PLANTING YEAR AND/OR IMPLAUSIBLY OLD AGE DUE TO NOISE IN RASTER.)"
                    # filter out unreliable cohorts with age > MAX_TREE_AGE, which are likely to be pixels with 
                    # undetermined planting year (age=0) or implausibly old age due to raster noise  
                    # 1. Clean out completely impossible ages beyond physiological limits (e.g., > 28 years) 
                    cohorts = [c for c in cohorts if c['age'] <= MAX_TREE_AGE]
                    # Delete a cohort only if it is BOTH old AND has a small proportion.
                    # 2. Keep it if it's young OR if it meets the minimum threshold size
                    cohorts = [
                        c for c in cohorts 
                        if c['age'] <= MEAN_CUT_TREE_AGE or c['proportion'] >= MIX_TREE_PROPORTION
                    ]
                
            
            print(f"Final cohorts used for profile generation: {cohorts}")
            # Sum the 'tree_count' from all cohorts
            # Safe calculation that falls back to 0 if 'tree_count' is None or missing
            total_tree_count = sum((cohort.get('tree_count') or 0) for cohort in cohorts)

            planning_year_info = self.age_map_svc.get_plantation_year_of_planting_info(poly_data)

            formatted_years = []

            current_year = datetime.now().year

            # Iterate and transform values
            for cohort in cohorts:
                # Convert age back to the original planting year (e.g., 2026 - 16 = 2010)
                planting_year = current_year - cohort["age"]
                
                # Extract proportion and convert to a percentage scale (e.g., 0.3045 -> 30.45)
                percentage = cohort["proportion"] * 100
                
                # Format to 1 decimal place matching your contract example contract: "30.4%"
                formatted_str = f"{int(planting_year)} ({percentage:.1f}%)"
                formatted_years.append(formatted_str)

            profile = self.generate_carbon_profile(poly_data, cohorts)

            reliable_mgs = (
                "CARBON PROFILE GENERATED USING CALCULATED YEAR "
                "OF PLANTING AND RELIABLE TREE COUNT."
            )
            return {
                "polygon_id": poly_data["id"],
                "status": {
                    "status": "success", 
                    "status_code": "S04", 
                    "message": reliable_mgs
                },
                "carbon_profile": profile,
                "estimated_parameters": {
                    "area_m2": poly_data["A302_area_m2"],
                    "year_of_planting": {
                        "value": formatted_years,
                        "note": planning_year_info,
                        "source": "calculated from raster"
                    },
                    "rubber_clone": {
                        "value": poly_data.get('rubber_clone') if poly_data.get('rubber_clone') else "RRIM 600",
                        "note": "default",
                        "source": "user input" if poly_data.get('rubber_clone') else "default value applied"
                    },
                    "tree_count": {
                        "value": total_tree_count,
                        "source": "calculated from area and spacing system"
                    },
                    "spacing_system": {
                        "value": poly_data.get('spacing_system') if poly_data.get('spacing_system') else "2.5x8",
                        "source": "user input" if poly_data.get('spacing_system') else "default value"
                    }
                }
            }

        