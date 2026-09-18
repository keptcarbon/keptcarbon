from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Union, Any

# ── Shared sub-models ─────────────────────────────────────────────────────────

class StatusMessage(BaseModel):
    status: str
    status_code: str
    message: str


class ParamWithSource(BaseModel):
    # Can accept a single value (2010) or multiple values ([2010, 2015, 2018])
    value: Optional[Union[Any, List[Any]]] = None
    note: Optional[Union[Any, List[Any]]] = Field(None, description="Percentage of the values (year or tree count) or defult")
    source: Optional[str] = Field(None, description="Origin tracking: 'user input' or 'calculated'")


class LUPolygon(BaseModel):
    lu_class: str
    lu_class_desc_th: Optional[str] = None
    lu_class_desc_en: Optional[str] = None
    geometry: Dict[str, Any] = Field(..., description="GeoJSON Polygon or MultiPolygon with 'EPSG:4326' = WGS84 lon/lat coordinates")
    area_m2: float = Field(..., description="Area in square meters")
    area_percent: float = Field(..., description="Percentage of total area")


class BasePlotsRequest(BaseModel):
    """The generalized blueprint for any plantation API call."""
    id: str = Field(..., description="Unique ID from the frontend map")
    geometry: Dict[str, Any] = Field(..., description="GeoJSON Raw Drawn Polygon/MultiPolygon with 'EPSG:4326' = WGS84 lon/lat coordinates")
    project_type: Optional[str] = Field(None, description="e.g., 'replanting', 'existing'")


# ── Plot-info endpoint (/api/v1/plots) ────────────────────

class PlotsInfoRequest(BasePlotsRequest):
    """Payload for /plots/info (Extends base structure with output CRS)"""
    output_crs: Optional[str] = Field('EPSG:4326', description="Desired CRS for returned geometries, e.g. 'EPSG:4326'. Defaults to 'EPSG:4326' if not provided.")


class PlotsInfoResponse(BaseModel):
    polygon_id: str
    province_code: Optional[str] = Field(None, description="Province code if polygon is within a supported province")
    geometry: Dict[str, Any] = Field(..., description="GeoJSON Polygon or MultiPolygon")
    area_m2: Optional[float] = Field(None, description="Total area in square meters")
    status: StatusMessage
    lu_polygon: Optional[List[LUPolygon]] = None


# ── Nav endpoint (/api/v1/plots/nav) ──────────────────────

class PlotsNavRequest(BaseModel):
    """Payload for /plots/nav (Check whether a point falls in a supported province)"""
    lat: float = Field(..., description="Latitude in EPSG:4326 (WGS84)")
    lon: float = Field(..., description="Longitude in EPSG:4326 (WGS84)")


class PlotsNavResponse(BaseModel):
    supported: bool = Field(..., description="True if the point is within a Thai province supported by the system")
    province_code: Optional[str] = Field(None, description="Matched province code, if any")
    message: str
