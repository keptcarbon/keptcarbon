from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Union, Any

# ── Shared sub-models ─────────────────────────────────────────────────────────

class StatusMessage(BaseModel):
    status: str
    status_code: str
    message: str


class CarbonValueEstimate(BaseModel):
    value: float
    ci: float
    ci_lower: float
    ci_upper: float
class ParamWithSource(BaseModel):
    # Can accept a single value (2010) or multiple values ([2010, 2015, 2018])
    value: Optional[Union[Any, List[Any]]] = None
    note: Optional[Union[Any, List[Any]]] = Field(None, description="Percentage of the values (year or tree count) or defult")
    source: Optional[str] = Field(None, description="Origin tracking: 'user input' or 'calculated'")


class EstimationParameters(BaseModel):
    year_of_planting: ParamWithSource = Field(default_factory=ParamWithSource)
    rubber_clone: ParamWithSource = Field(default_factory=ParamWithSource)
    tree_count: ParamWithSource = Field(default_factory=ParamWithSource)
    spacing_system: ParamWithSource = Field(default_factory=ParamWithSource)


class CarbonMetric(BaseModel):
    """A standardized component tracking an estimate along with its 95% Confidence Interval."""
    estimate: float = Field(..., alias="value")  # 'alias' lets frontend see 'value'
    ci_margin: float = Field(..., alias="ci")
    ci_lower: float = Field(..., alias="ci_lower")
    ci_upper: float = Field(..., alias="ci_upper")

    class Config:
        populate_by_name = True  # Allows you to use either 'estimate' or 'value' in your Python code


class YearlyEstimate(BaseModel):
    year: int
    year_at: int
    age: Optional[int] = None
    

    # Nested components
    stocks: CarbonMetric = Field(..., description="Absolute carbon stock metrics for the given year")
    gain: CarbonMetric = Field(..., description="Cumulative carbon gain metrics relative to the baseline year")


class LUPolygon(BaseModel):
    lu_class: str
    lu_class_desc_th: Optional[str] = None
    lu_class_desc_en: Optional[str] = None
    geometry: Dict[str, Any] = Field(..., description="GeoJSON Polygon or MultiPolygon with 'EPSG:4326' = WGS84 lon/lat coordinates")
    area_m2: float = Field(..., description="Area in square meters")
    area_percent: float = Field(..., description="Percentage of total area")


# ── Estimated Parameters sub-models ──────────────────────────────────────────

class EstimatedParamYear(BaseModel):
    value: Union[int, List[str]]
    note: Optional[List[str]] = None
    source: str


class EstimatedParamSimple(BaseModel):
    value: Union[str, int, float]
    note: Optional[str] = None
    source: str


class EstimatedParameters(BaseModel):
    area_m2: float = Field(..., description="Area in square meters")
    year_of_planting: EstimatedParamYear
    rubber_clone: EstimatedParamSimple
    tree_count: EstimatedParamSimple
    spacing_system: EstimatedParamSimple


class BasePlantationRequest(BaseModel):
    """The generalized blueprint for any plantation API call."""
    id: str = Field(..., description="Unique ID from the frontend map")
    geometry: Dict[str, Any] = Field(..., description="GeoJSON Raw Drawn Polygon/MultiPolygon with 'EPSG:4326' = WGS84 lon/lat coordinates")
    project_type: Optional[str] = Field(None, description="e.g., 'replanting', 'existing'")


# ── Estimation endpoint (/api/estimate) ──────────────────────────────

class PlantationEstimateRequest(BasePlantationRequest):
    """Payload for /estimate (Extends base structure with metrics and flags)"""
    year_of_planting: Optional[int] = Field(None, description="Manual year. If None, extract from raster.")
    rubber_clone: Optional[str] = Field(None, description="Clone type for growth coefficients")
    tree_count: Optional[int] = Field(None, description="User-defined count. If None, calculate using area and spacing.")
    spacing_system: Optional[str] = Field(None, description="Standard spacing, e.g. '2.5x8' = 500 trees/ha")
    selected_lu_classes: List[str] = Field(
        #default=["A302"], 
        ...,
        description="List of LU codes, which identify areas the user wants included in carbon calculations"
    )


class PlantationEstimationResponse(BaseModel):
    polygon_id: str
    status: StatusMessage
    carbon_profile: Optional[List[YearlyEstimate]] = None
    estimated_parameters: Optional[EstimatedParameters] = None


# ── Plantation-info endpoint (/api/v1/plantation-info) ────────────────────

class PlantationInfoRequest(BasePlantationRequest):
    """Payload for /plantation-info (Extends base structure with output CRS)"""
    output_crs: Optional[str] = Field('EPSG:4326', description="Desired CRS for returned geometries, e.g. 'EPSG:4326'. Defaults to 'EPSG:4326' if not provided.")


class PlantationInfoResponse(BaseModel):
    polygon_id: str
    province_code: Optional[str] = Field(None, description="Province code if polygon is within a supported province")
    geometry: Dict[str, Any] = Field(..., description="GeoJSON Polygon or MultiPolygon")
    area_m2: Optional[float] = Field(None, description="Total area in square meters")
    status: StatusMessage
    lu_polygon: Optional[List[LUPolygon]] = None




