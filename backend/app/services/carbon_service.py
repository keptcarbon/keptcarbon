from datetime import datetime
from typing import List, Dict
from fastapi import HTTPException
from app.core.database import get_pool
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
    GROWTH_MODEL_YEAR,
    MAX_TREE_AGE,
    MEAN_CUT_TREE_AGE,
    MIX_TREE_PROPORTION,
    TREE_AGE_HOMOLOGOUS_THRESHOLD,
)

class CarbonService:
    def __init__(self):
        self.pro_svc = ProvinceService()
        self.lu_svc = LanduseService()
        self.age_map_svc = AgeMapService()
        self.tree_svc = TreeService()
        self.spatial_svc = SpatialUtils()


    async def _resolve_region_config(self, p_code: str, poly_data: dict) -> dict:
        """
        Single tbl_region_config lookup per assessment: validates the province
        is supported (raises 422 if not) and resolves clone/growth_model/
        allometry/biomass_profile_version -- clone always comes from the
        region's default (poly_data's own rubber_clone is a separate,
        display-only field, never consulted here), while growth_model/
        allometry/biomass_profile_version fall back to the region default only
        when poly_data sent null (map-draw quick-assess flow); the my-plots
        re-assess flow can override them explicitly. default_spacing is also
        returned for the assess_parameters display fallback.
        """
        try:
            pool = get_pool()
            async with pool.acquire() as conn:
                config_row = await conn.fetchrow(
                    """
                    SELECT default_clone, default_spacing, default_growth,
                           default_allometry, biomass_profile_version
                    FROM tbl_region_config
                    WHERE p_code = $1
                    """,
                    p_code,
                )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to load region config: {str(e)}")

        if config_row is None:
            raise HTTPException(
                status_code=422,
                detail=f"Province code '{p_code}' is not supported. No region config found in tbl_region_config."
            )

        return {
            "clone": config_row["default_clone"],
            "default_spacing": config_row["default_spacing"],
            "growth_model": poly_data.get("growth_model") or config_row["default_growth"],
            "allometry": poly_data.get("allometry") or config_row["default_allometry"],
            "biomass_profile_version": poly_data.get("biomass_profile_version") or config_row["biomass_profile_version"],
        }

    async def generate_carbon_profile(self, poly_data, cohorts) -> list:
        """
        Generates a fixed-length yearly carbon stock profile (tCO2e) with 95% CI,
        spanning the full modeled lifecycle age 0 to GROWTH_MODEL_YEAR, by
        aggregating multiple age cohorts.

        Expects poly_data['clone'], poly_data['growth_model'], poly_data['allometry']
        and poly_data['biomass_profile_version'] to already be resolved by
        get_carbon_profile() (via _resolve_region_config) -- this method only
        queries tbl_biomass_profile, no tbl_region_config lookup here.
        """
        p_code = poly_data.get("province_code")
        clone = poly_data.get("clone")
        growth_model = poly_data.get("growth_model")
        allometry = poly_data.get("allometry")
        biomass_profile_version = poly_data.get("biomass_profile_version")

        try:
            pool = get_pool()
            async with pool.acquire() as conn:
                rows = await conn.fetch(
                    """
                    SELECT age, biomass_est, biomass_ci_lower, biomass_ci_upper
                    FROM tbl_biomass_profile
                    WHERE p_code = $1 AND clone = $2 AND growth_model = $3 AND allometry = $4 AND version = $5
                    """,
                    p_code, clone, growth_model, allometry, biomass_profile_version,
                )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to load biomass profile: {str(e)}")

        if not rows:
            raise HTTPException(
                status_code=422,
                detail=f"No biomass profile for p_code='{p_code}', clone='{clone}', model='{growth_model}', "
                       f"allometry='{allometry}', version='{biomass_profile_version}'."
            )

        lookup_by_age = {row["age"]: row for row in rows}

        current_calendar_year = datetime.now().year

        if poly_data.get("project_type") == "existing":
            start_year = current_calendar_year
        else:
            start_year = poly_data.get("year_of_planting")

        # Row axis (age 0..GROWTH_MODEL_YEAR) is anchored on the dominant
        # (highest-proportion) cohort's current age -- for the common
        # single-cohort case this is simply that cohort's age. Ref_age only
        # decides which calendar year each age label maps to; it does not
        # change what gets summed for a given calendar year (future_age below
        # is still computed per-cohort).
        dominant_cohort = max(cohorts, key=lambda c: c.get('proportion', 1))
        ref_age = dominant_cohort['age']
        planting_year = start_year - ref_age  # calendar year at which age == 0

        # Pass 1: compute stocks for every row in the fixed 0..35 age window.
        # The window can start before today (negative year_at, i.e. the
        # tree's past) so we can't take the first row as the baseline.
        rows = []

        for age in range(0, GROWTH_MODEL_YEAR + 1):  # fixed 0..35 -> 36 rows

            target_year = planting_year + age
            year_at = target_year - current_calendar_year

            sum_biomass_est = 0.0
            sum_biomass_lower = 0.0
            sum_biomass_upper = 0.0

            for cohort in cohorts:
                future_age = cohort['age'] + (target_year - start_year)

                data = lookup_by_age.get(future_age)
                if data is not None:
                    count = cohort['tree_count']
                    sum_biomass_est += data['biomass_est'] * count
                    sum_biomass_lower += data['biomass_ci_lower'] * count
                    sum_biomass_upper += data['biomass_ci_upper'] * count

            # Convert aggregated biomass (kg) to Total Carbon (tC) -- always
            # computed, even when zero, so every plot emits the same 36 rows.
            total_carbon_tCO2e = round((sum_biomass_est * CARBON_FRACTION * CARBON_EQUIVALENT_FACTOR) / 1000.0, 4)
            total_carbon_ci_tCO2e = round(((sum_biomass_upper - sum_biomass_lower)/2 * CARBON_FRACTION * CARBON_EQUIVALENT_FACTOR) / 1000.0, 4)
            total_carbon_ci_lower_tCO2e = round((sum_biomass_lower * CARBON_FRACTION * CARBON_EQUIVALENT_FACTOR) / 1000.0, 4)
            total_carbon_ci_upper_tCO2e = round((sum_biomass_upper * CARBON_FRACTION * CARBON_EQUIVALENT_FACTOR) / 1000.0, 4)

            rows.append({
                "year": target_year,
                "year_at": year_at,
                "age": age,
                "total_carbon_tCO2e": total_carbon_tCO2e,
                "total_carbon_ci_tCO2e": total_carbon_ci_tCO2e,
                "total_carbon_ci_lower_tCO2e": total_carbon_ci_lower_tCO2e,
                "total_carbon_ci_upper_tCO2e": total_carbon_ci_upper_tCO2e,
            })

        # Baseline is the row where year_at == 0 (today), not the first row
        # emitted -- the fixed age window can start in the past.
        baseline_row = next((r for r in rows if r["year_at"] == 0), rows[0])
        baseline_carbon = baseline_row["total_carbon_tCO2e"]
        baseline_lower = baseline_row["total_carbon_ci_lower_tCO2e"]
        baseline_upper = baseline_row["total_carbon_ci_upper_tCO2e"]

        # Pass 2: gain relative to the year_at == 0 baseline. Rows before
        # today (negative year_at) hold less carbon than the baseline, so
        # their gain is negative.
        projections = []
        for r in rows:
            total_carbon_gain_tCO2e = round(r["total_carbon_tCO2e"] - baseline_carbon, 4)

            # LINEAR PROPAGATION: Subtract baseline boundaries directly to track the true variance channel
            gain_bound_a = round(r["total_carbon_ci_lower_tCO2e"] - baseline_lower, 4)
            gain_bound_b = round(r["total_carbon_ci_upper_tCO2e"] - baseline_upper, 4)

            # The underlying biomass CI bounds aren't guaranteed to widen
            # monotonically with age, so a direct subtraction can invert the
            # bounds (lower > upper). Re-order them so the gain interval is
            # always valid and the half-width margin of error is never negative.
            total_carbon_gain_ci_lower_tCO2e = min(gain_bound_a, gain_bound_b)
            total_carbon_gain_ci_upper_tCO2e = max(gain_bound_a, gain_bound_b)
            total_carbon_gain_ci_tCO2e = round((total_carbon_gain_ci_upper_tCO2e - total_carbon_gain_ci_lower_tCO2e) / 2.0, 4)

            # Match layout configuration of your structural YearlyAssess schema
            projections.append({
                "year": r["year"],
                "year_at": r["year_at"],
                "age": r["age"],

                "stocks": {
                    "value": r["total_carbon_tCO2e"],
                    "ci": r["total_carbon_ci_tCO2e"],
                    "ci_lower": r["total_carbon_ci_lower_tCO2e"],
                    "ci_upper": r["total_carbon_ci_upper_tCO2e"]
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

        # Step 1: Determine province code
        poly_data = await self.pro_svc.get_province(poly_data)

        if poly_data.get("province_code") is None:
            return {
                "polygon_id": poly_data.get("id"),
                "status": poly_data.get("status"),
                "carbon_profile": None,
                "assess_parameters": None
            }

        # Resolve region config once here (validates the province, resolves
        # clone/growth_model/allometry/biomass_profile_version): downstream
        # generate_carbon_profile() and this method's assess_parameters both
        # read the resolved values straight off poly_data, no repeat
        # tbl_region_config lookups. Capture which fields were user-supplied
        # before overwriting poly_data, so assess_parameters can still report
        # the right "source" below.
    
        spacing_is_default = poly_data.get('spacing_system') is None
        growth_model_is_default = poly_data.get('growth_model') is None
        allometry_is_default = poly_data.get('allometry') is None
        biomass_profile_version_is_default = poly_data.get('biomass_profile_version') is None

        region_config = await self._resolve_region_config(poly_data["province_code"], poly_data)
        
        if (spacing_is_default) poly_data['spacing_system'] = region_config['default_spacing']
        if (growth_model_is_default) poly_data['growth_model'] = region_config['growth_model']
        if (allometry_is_default) poly_data['allometry'] = region_config['allometry']
        if (biomass_profile_version_is_default) poly_data['biomass_profile_version'] = region_config['biomass_profile_version']
        
        default_spacing = region_config["default_spacing"]
        poly_data['rubber_clone_config'] = region_config['clone']
        
        # Step 2: Multi-Polygon Dissolve & Geometry Merge
        poly_data = await self.lu_svc.find_rubber_cultivation_area(poly_data)
        if poly_data["A302_geometry"] is None:
            return {
                "polygon_id": poly_data.get("id"),
                "status": poly_data.get("status"),
                "carbon_profile": None,
                "assess_parameters": None
            }

        # Step 3: Check user input year of planting and tree count for reliability
        # Cache the counts for later use in age cohort extraction to avoid duplicate raster I/O
        poly_data = await self.age_map_svc.get_plantation_year_count(poly_data)

        if poly_data.get("year_of_planting") is not None:

            if poly_data.get("project_type") == "existing":
                # User input year of planting is available — use it directly to calculate age
                age = current_calendar_year - poly_data["year_of_planting"]
                planning_year_info = await self.age_map_svc.get_plantation_year_of_planting_info(poly_data)
            else:  # replanting — starts at age 0, no raster-derived planting-year info
                age = 0
                planning_year_info = None

            tree_info = await self.tree_svc.get_tree_count_user_input(poly_data)

            cohorts = [{"age": age,
                        "pixel_count": None,
                        "proportion": 1,
                        "tree_count": tree_info['tree_count']}
                    ]

            profile = await self.generate_carbon_profile(poly_data, cohorts)

            message_flag = "CALCULATED" if tree_info['is_calculated'] else "RELIABLE"

            return {
                "polygon_id": poly_data["id"],
                "status": {
                    "status": "success", 
                    "status_code": "S03", 
                    "message": f"CARBON PROFILE GENERATED USING USER-INPUT YEAR OF PLANTING AND {message_flag} TREE COUNT."
                },
                "carbon_profile": profile,
                "assess_parameters": {
                    "area_m2": poly_data["A302_area_m2"],
                    "year_of_planting": {
                        "value": poly_data.get("year_of_planting"),
                        "note": planning_year_info,
                        "source": "user input" if poly_data.get('year_of_planting') else "calculated from raster"
                    },
                    "rubber_clone": {
                        "value": poly_data.get('rubber_clone'),
                        "note": "default",
                        "source": "user input" if poly_data.get('rubber_clone') else "default value applied"
                    },
                    "tree_count": {
                        "value": tree_info['tree_count'],
                        "source": "calculated from area and spacing system" if tree_info['is_calculated'] else "user input"
                    },
                    "spacing_system": {
                        "value": poly_data.get('spacing_system'),
                        "source": "user input" if poly_data.get('spacing_system') else "default value applied"
                    },
                    "growth_model": {
                        "value": poly_data.get('growth_model'),
                        "source": "default value applied" if growth_model_is_default else "user input"
                    },
                    "allometry": {
                        "value": poly_data.get('allometry'),
                        "source": "default value applied" if allometry_is_default else "user input"
                    },
                    "biomass_profile_version": {
                        "value": poly_data.get('biomass_profile_version'),
                        "source": "default value applied" if biomass_profile_version_is_default else "user input"
                    }
                }
            }


        else:
            cohorts = await self.age_map_svc.get_plantation_age_cohorts(poly_data)

            if not cohorts:
                return {
                    "polygon_id": poly_data["id"],
                    "status": {
                        "status": "error",
                        "status_code": "E05",
                        "message": (
                            "NO PLANTING-YEAR RASTER DATA FOUND FOR THE SELECTED LAND USE "
                            "CLASSES IN THIS PLOT. PLEASE VERIFY THE SELECTED LAND USE TYPES "
                            "OR PROVIDE A PLANTING YEAR MANUALLY."
                        )
                    },
                    "carbon_profile": None,
                    "assess_parameters": None
                }

            # Find the dictionary containing the maximum proportion value
            dominant_cohort = max(cohorts, key=lambda c: c['proportion'])

            highest_proportion = dominant_cohort['proportion']
            highest_proportion_age = dominant_cohort['age']

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
                    "assess_parameters": None
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

            # Sum the 'tree_count' from all cohorts
            # Safe calculation that falls back to 0 if 'tree_count' is None or missing
            total_tree_count = sum((cohort.get('tree_count') or 0) for cohort in cohorts)

            planning_year_info = await self.age_map_svc.get_plantation_year_of_planting_info(poly_data)

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

            profile = await self.generate_carbon_profile(poly_data, cohorts)

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
                "assess_parameters": {
                    "area_m2": poly_data["A302_area_m2"],
                    "year_of_planting": {
                        "value": formatted_years,
                        "note": planning_year_info,
                        "source": "calculated from raster"
                    },
                    "rubber_clone": {
                        "value": poly_data.get('rubber_clone'),
                        "note": "default value alway use",
                        "source": "user input" if poly_data.get('rubber_clone') else "default value applied"
                    },
                    "tree_count": {
                        "value": total_tree_count,
                        "source": "calculated from area and spacing system"
                    },
                    "spacing_system": {
                        "value": poly_data.get('spacing_system'),
                        "source": "user input" if poly_data.get('spacing_system') else "default value"
                    },
                    "growth_model": {
                        "value": poly_data.get('growth_model'),
                        "source": "default value applied" if growth_model_is_default else "user input"
                    },
                    "allometry": {
                        "value": poly_data.get('allometry'),
                        "source": "default value applied" if allometry_is_default else "user input"
                    },
                    "biomass_profile_version": {
                        "value": poly_data.get('biomass_profile_version'),
                        "source": "default value applied" if biomass_profile_version_is_default else "user input"
                    }
                }
            }

    async def get_carbon_simulation(self, sim_data: list) -> list:
        """
        Placeholder for future implementation of carbon simulation based on
        user-provided growth model and allometry. Takes the full batch of rows
        (one or more plantation-level entries, potentially spanning multiple
        p_codes) so a later implementation can group/aggregate them for
        region-level (province/district/sub-district) simulation. Currently
        returns one skeleton response per row with status indicating that the
        computation is not yet implemented.
        """
        return [
            {
                "p_code": row.get("p_code"),
                "clone": row.get("clone"),
                "age": row.get("age"),
                "area_m2": row.get("area_m2"),
                "growth_model": row.get("growth_model"),
                "allometry": row.get("allometry"),
                "rotation_year": row.get("rotation_year"),
                "replanting_rate": row.get("replanting_rate"),
                "status": {
                    "status": "pending",
                    "status_code": "P01",
                    "message": "SIMULATION SKELETON — GROWTH MODEL COMPUTATION NOT YET IMPLEMENTED."
                },
                "carbon_stock_tCO2e_simulation": None,
            }
            for row in sim_data
        ]