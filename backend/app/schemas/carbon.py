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


# ── Assessment endpoint (/api/v1/carbon/assess) ──────────────────────────────

class CarbonAssessRequest(BasePlotsRequest):
    """Payload for /carbon/assess (Extends base structure with metrics and flags)"""
    year_of_planting: Optional[int] = Field(None, description="Manual year. If None, extract from raster.")
    rubber_clone: Optional[str] = Field(None, description="Clone type for growth coefficients")
    tree_count: Optional[int] = Field(None, description="User-defined count. If None, calculate using area and spacing.")
    spacing_system: Optional[str] = Field(None, description="Standard spacing, e.g. '2.5x8' = 500 trees/ha")
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
