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
    p_code: str = Field(..., description="Province code the assessment resolved from the geometry; keys the tbl_biomass_profile lookup")
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
    growth_model: Optional[str] = Field(None, description="Growth model override, e.g. 'anchored_weibull'. If None, use the province's default from tbl_region_config.")
    allometry: Optional[str] = Field(None, description="Allometry equation override, e.g. 'hytönen_2018'. If None, use the province's default from tbl_region_config.")
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
    growth_model: str = Field(..., description="Growth model name, e.g. 'anchored_weibull', 'anchored_schumacher', 'anchored_chapman_richards', 'anchored_gompertz'")
    allometry: str = Field(..., description="Allometric equation name, e.g. 'chiarawipa', 'hytonen'")
    biomass_profile_version: str = Field(..., description="Version of the biomass profile to use")
    year_of_planting: int = Field(..., description="Year the stand was planted")
    area_m2: float = Field(..., description="Area in square meters")
    tree_count: Optional[int] = Field(None, description="Number of trees in the area. If None, calculate from area_m2 and spacing_system.")
    spacing_system: str = Field(..., description="Spacing system, e.g. '2.5x8' = 500 trees/ha")
    rotation_year: int = Field(35, description="Rotation length in years before replanting")
    replanting_rate: float = Field(1.0, description="Replanting rate multiplier applied to tree_count at each rotation, e.g. 0.9 = 90%, 1.1 = 110%")


class SimulationYearlyPoint(BaseModel):
    year: int
    year_at: int
    tree_count: int = Field(..., description="Central-scenario tree count, summed across all input rows for this year")
    carbon_stock_tCO2e: float
    carbon_stock_upper_tCO2e: float = Field(..., description="Upper-bound scenario: each row's rotation_year with 100% replanting, summed across all input rows")
    carbon_stock_lower_tCO2e: float = Field(..., description="Lower-bound scenario: each row's rotation_year with 0% replanting, summed across all input rows")


class CarbonSimulationRowSummary(BaseModel):
    """Resolved input parameters for one row of the sim_data batch, echoed back for traceability."""
    p_code: str
    clone: str
    growth_model: str
    allometry: str
    biomass_profile_version: str
    year_of_planting: int
    area_m2: float
    tree_count: int
    spacing_system: str
    rotation_year: int
    replanting_rate: float


class CarbonSimulationResponse(BaseModel):
    status: StatusMessage
    rows: List[CarbonSimulationRowSummary] = Field(..., description="Per-row resolved inputs that went into the summed profile below")
    total_area_m2: float
    total_tree_count: int
    carbon_stock_tCO2e_simulation: Optional[List[SimulationYearlyPoint]] = Field(
        None,
        description="71-year (current_year-35 .. current_year+35) carbon stock profile, summed by year across all rows in sim_data."
    )


# ── Economic scenario endpoint (/api/v1/carbon/economics) ────────────────────
# T-VER feasibility: one 7-year crediting period starting this year, no cutting
# or replanting inside it, credits = raw stock gain (no deductions yet).

class EconomicsRow(BaseModel):
    """One cohort of a plot -- same shape as a /carbon/sim row, minus rotation/replanting."""
    p_code: str
    clone: str
    growth_model: str
    allometry: str
    biomass_profile_version: str
    year_of_planting: int
    area_m2: float = Field(..., gt=0)
    tree_count: Optional[int] = Field(None, description="If None, derived from area_m2 and spacing_system.")
    spacing_system: str
    plot_id: Optional[str] = Field(None, description="Groups cohort rows into one plot in the per-plot breakdown")
    label: Optional[str] = Field(None, description="Display name for the plot")


class EconomicsCosts(BaseModel):
    pdd: float = Field(400_000, ge=0, description="Project design document (once)")
    validation: float = Field(200_000, ge=0, description="Validation/registration (once)")
    monitoring_per_round: float = Field(400_000, ge=0, description="Monitoring report, per verification round")
    verification_per_round: float = Field(200_000, ge=0, description="Verification, per round")


class EconomicsRoundInput(BaseModel):
    """Per-round override; None fields fall back to price_thb_per_tCO2e / costs."""
    year_at: int = Field(..., ge=1, le=7, description="Verification year (1..7) this round falls on")
    price_thb_per_tCO2e: Optional[float] = Field(None, ge=0)
    monitoring_cost: Optional[float] = Field(None, ge=0)
    verification_cost: Optional[float] = Field(None, ge=0)


class CarbonEconomicsRequest(BaseModel):
    rows: List[EconomicsRow] = Field(..., min_length=1)
    costs: EconomicsCosts = Field(default_factory=EconomicsCosts)
    price_thb_per_tCO2e: float = Field(100, gt=0)
    verify_every_years: int = Field(7, ge=1, le=7)
    rounds: Optional[List[EconomicsRoundInput]] = Field(None, description="When sent (even empty), these year_at values ARE the verification years (any subset of 1..7) and verify_every_years is ignored for the result; None = every verify_every_years with default price/fees")
    discount_rate: float = Field(0.05, ge=0, le=1, description="Annual rate for NPV, e.g. 0.05 = 5%")
    compare_frequencies: List[int] = Field(default_factory=lambda: [1, 2, 3, 7], description="Verification intervals (years) for the comparison table and min/max break-even price")


class EconomicsScheduleYear(BaseModel):
    year: int
    year_at: int
    is_verification: bool
    price_thb_per_tCO2e: Optional[float] = Field(None, description="Sale price used at this round; None in non-verification years")
    carbon_stock_tCO2e: float
    credits_issued_tCO2e: int = Field(..., description="Sum of each plot's credits for this round, each rounded down to whole tonnes (TGO)")
    cost_thb: float
    revenue_thb: float
    net_thb: float
    cumulative_net_thb: float
    discounted_net_thb: float


class EconomicsScenario(BaseModel):
    verify_every_years: Optional[int] = Field(None, description="None when the verification years don't follow a regular every-k pattern")
    verification_rounds: int
    verification_years: List[int]
    price_thb_per_tCO2e: float = Field(..., description="Credit-weighted average sale price across rounds")
    round_cost_thb: List[float] = Field(..., description="Monitoring + verification cost of each round, in verification_years order")
    total_cost_thb: float
    total_credits_tCO2e: int = Field(..., description="Whole tonnes: each plot rounded down per round, then summed")
    credits_per_rai_tCO2e: float
    total_revenue_thb: float
    net_profit_thb: float
    is_viable: bool
    payback_year_at: Optional[int] = Field(None, description="First year_at where cumulative net >= 0; None if never within the period")
    npv_thb: float
    irr: Optional[float] = Field(None, description="Annual IRR as a fraction; None when cash flows never change sign")
    break_even_price_thb: Optional[float]
    discounted_break_even_price_thb: Optional[float] = Field(None, description="Price where NPV = 0 at discount_rate")
    min_viable_area_rai: Optional[float] = Field(None, description="Area at this project's average credits/rai that covers total cost at this price")


class EconomicsResult(EconomicsScenario):
    schedule: List[EconomicsScheduleYear]


class EconomicsPlot(BaseModel):
    plot_id: str
    label: Optional[str]
    area_rai: float
    tree_count: int
    age_at_start: float = Field(..., description="Area-weighted cohort age this year")
    cohort_ages: List[int]
    carbon_stock_start_tCO2e: float
    carbon_stock_end_tCO2e: float
    credits_tCO2e: int = Field(..., description="This plot's credits over the requested rounds, rounded down per round")
    revenue_thb: float = Field(..., description="This plot's credits x each round's price; plots sum to the project revenue")
    credits_per_rai_tCO2e: float
    beyond_model_age: bool = Field(..., description="A cohort passes the last modeled age during the period (growth held flat)")


class EconomicsAgeRow(BaseModel):
    start_age: int
    credits_per_rai_tCO2e: float
    min_viable_area_rai: Optional[float]


class CarbonEconomicsResponse(BaseModel):
    status: StatusMessage
    start_year: int
    crediting_years: int
    discount_rate: float
    total_area_rai: float
    result: EconomicsResult = Field(..., description="The requested price + verification frequency")
    plots: List[EconomicsPlot]
    frequency_comparison: List[EconomicsScenario] = Field(..., description="Each of compare_frequencies; the one matching the requested years is the exact result, the others use its average price and average per-round fees")
    min_break_even_price_thb: Optional[float] = Field(None, description="Lowest break-even price across compare_frequencies")
    max_break_even_price_thb: Optional[float] = Field(None, description="Highest break-even price across compare_frequencies")
    age_matrix: List[EconomicsAgeRow] = Field(..., description="Credits/rai and min viable area by starting age, using the first row's growth profile and the project's trees/rai, at the requested price + frequency")
