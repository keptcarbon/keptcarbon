from pydantic import BaseModel, Field
from typing import List, Optional, Union

from app.schemas.plots import StatusMessage, BasePlotsRequest

# ── Carbon metric sub-models ──────────────────────────────────────────────────

class CarbonMetric(BaseModel):
    """A standardized component tracking an assessment along with its 95% Confidence Interval."""
    assess: float = Field(..., alias="value")  # 'alias' lets frontend see 'value'
    ci_margin: float = Field(..., alias="ci")
    ci_lower: float = Field(..., alias="ci_lower")
    ci_upper: float = Field(..., alias="ci_upper")

    class Config:
        populate_by_name = True  # Allows you to use either 'assess' or 'value' in your Python code


class YearlyAssess(BaseModel):
    year: int
    year_at: int
    age: Optional[int] = None

    # Nested components
    stocks: CarbonMetric = Field(..., description="Absolute carbon stock metrics for the given year")
    gain: CarbonMetric = Field(..., description="Cumulative carbon gain metrics relative to the baseline year")


# ── Assess Parameters sub-models ──────────────────────────────────────────

class AssessParamYear(BaseModel):
    value: Union[int, List[str]]
    note: Optional[List[str]] = None
    source: str


class AssessParamSimple(BaseModel):
    value: Union[str, int, float]
    note: Optional[str] = None
    source: str


class AssessParameters(BaseModel):
    area_m2: float = Field(..., description="Area in square meters")
    year_of_planting: AssessParamYear
    rubber_clone: AssessParamSimple
    tree_count: AssessParamSimple
    spacing_system: AssessParamSimple
    growth_model: AssessParamSimple
    allometry: AssessParamSimple
    biomass_profile_version: AssessParamSimple


# ── Assessment endpoint (/api/v1/carbon/assess) ──────────────────────────────

class CarbonAssessRequest(BasePlotsRequest):
    """Payload for /carbon/assess (Extends base structure with metrics and flags)"""
    year_of_planting: Optional[int] = Field(None, description="Manual year. If None, extract from raster.")
    rubber_clone: Optional[str] = Field(None, description="Clone type for growth coefficients")
    tree_count: Optional[int] = Field(None, description="User-defined count. If None, calculate using area and spacing.")
    spacing_system: Optional[str] = Field(None, description="Standard spacing, e.g. '2.5x8' = 500 trees/ha")
    growth_model: Optional[str] = Field(None, description="Growth model override, e.g. 'weibull'. If None, use the province's default from tbl_region_config.")
    allometry: Optional[str] = Field(None, description="Allometry equation override, e.g. 'hytonen_2018'. If None, use the province's default from tbl_region_config.")
    biomass_profile_version: Optional[str] = Field(None, description="Biomass profile dataset version override. If None, use the province's default from tbl_region_config.")
    selected_lu_classes: List[str] = Field(
        #default=["A302"],
        ...,
        description="List of LU codes, which identify areas the user wants included in carbon calculations"
    )


class CarbonAssessResponse(BaseModel):
    polygon_id: str
    status: StatusMessage
    carbon_profile: Optional[List[YearlyAssess]] = None
    assess_parameters: Optional[AssessParameters] = None


# ── Simulation endpoint (/api/v1/carbon/sim) ──────────────────────────────────
# Standalone growth-model/allometry simulation -- looks up tbl_biomass_profile
# directly by (p_code, clone, growth_model, allometry, age), no polygon or
# raster-derived province lookup.

class CarbonSimulationRequest(BaseModel):
    p_code: str = Field(..., description="Province code, e.g. 'RAY'")
    clone: str = Field(..., description="Rubber clone, e.g. 'RRIM 600'")
    growth_model: str = Field(..., description="Growth model name, e.g. 'weibull', 'schumacher', 'chapman_richards','gompertz','cubic_poly'")
    allometry: str = Field(..., description="Allometric equation name, e.g. 'chiarawipa', 'hytonen'")
    biomass_profile_version: str = Field(..., description="Version of the biomass profile to use")
    age: int = Field(..., description="Stand age in years")
    area_m2: float = Field(..., description="Area in square meters")
    tree_count: int = Field(..., description="Number of trees in the area")
    spacing_system: str = Field(..., description="Spacing system, e.g. '2.5x8' = 500 trees/ha")
    rotation_year: int = Field(35, description="Rotation length in years before replanting")
    replanting_rate: int = Field(100, description="Percent of the area replanted at the end of each rotation")


class CarbonSimulationResponse(BaseModel):
    p_code: str
    clone: str
    growth_model: str
    allometry: str
    biomass_profile_version: str
    age: int
    area_m2: float
    tree_count: int
    spacing_system: str
    rotation_year: int
    replanting_rate: int
    status: StatusMessage
    carbon_stock_tCO2e_simulation: Optional[float] = Field(None, description="Simulated carbon stock for the given area. None until the growth model is wired up.")
