/**
 * Carbon estimation API service
 * Calls the real backend API instead of using mockup calculations
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://127.0.0.1:8001/api/v1";

export interface CarbonAssessRequest {
    id: string;
    geometry: GeoJSON.Geometry;
    year_of_planting?: number | null;
    rubber_clone?: string | null;
    tree_count?: number | null;
    spacing_system?: string | null;
    growth_model?: string | null;
    allometry?: string | null;
    biomass_profile_version?: string | null;
    selected_lu_classes?: string[];
    project_type?: string;
}

export interface StatusMessage {
    status: string;
    status_code: string;
    message: string;
}

export interface CarbonValue {
    value: number;
    ci: number;
    ci_lower: number;
    ci_upper: number;
}

export interface YearlyAssess {
    year: number;
    year_at: number;
    age: number;
    stocks: CarbonValue;
    gain: CarbonValue;
}

export interface AssessParamYear {
    value: number | string[];
    note: string[] | null;
    source: string;
}

export interface AssessParamSimple {
    value: string | number;
    note: string | null;
    source: string;
}

export interface AssessParameters {
    /** Province the assessment resolved from the geometry (keys tbl_biomass_profile).
     *  Missing on assessments saved before it was added. */
    p_code?: string;
    area_m2?: number;
    year_of_planting: AssessParamYear;
    rubber_clone: AssessParamSimple;
    tree_count: AssessParamSimple;
    spacing_system: AssessParamSimple;
    growth_model: AssessParamSimple;
    allometry: AssessParamSimple;
    biomass_profile_version: AssessParamSimple;
}

export interface CarbonAssessResponse {
    polygon_id: string;
    status: StatusMessage;
    carbon_profile?: YearlyAssess[] | null;
    assess_parameters?: AssessParameters | null;
}

/** One row of POST /carbon/sim — a planting cohort; the backend sums all rows by year. */
export interface CarbonSimulationRow {
    p_code: string;
    clone: string;
    growth_model: string;
    allometry: string;
    biomass_profile_version: string;
    year_of_planting: number;
    area_m2: number;
    /** null = backend derives it from area_m2 and spacing_system */
    tree_count: number | null;
    spacing_system: string;
    rotation_year: number;
    /** 1 = 100% */
    replanting_rate: number;
}

export interface SimulationYearlyPoint {
    year: number;
    /** offset from the current year, -35..35 */
    year_at: number;
    tree_count: number;
    carbon_stock_tCO2e: number;
    /** same rotation_year, 100% replanting */
    carbon_stock_upper_tCO2e: number;
    /** same rotation_year, 0% replanting */
    carbon_stock_lower_tCO2e: number;
    /** central scenario at the biomass CI lower / upper bound */
    carbon_stock_ci_lower_tCO2e: number;
    carbon_stock_ci_upper_tCO2e: number;
}

export interface CarbonSimulationResponse {
    status: StatusMessage;
    rows: CarbonSimulationRow[];
    total_area_m2: number;
    total_tree_count: number;
    carbon_stock_tCO2e_simulation: SimulationYearlyPoint[] | null;
}

// ── Economic scenario (/carbon/economics) ────────────────────────────────────
// One 7-year T-VER crediting period starting this year; no rotation/replanting.

export type EconomicsRow = Omit<CarbonSimulationRow, "rotation_year" | "replanting_rate"> & {
    /** groups cohort rows into one plot in the per-plot breakdown */
    plot_id?: string;
    label?: string;
};

export interface EconomicsCosts {
    pdd: number;
    validation: number;
    monitoring_per_round: number;
    verification_per_round: number;
}

/** Per-round override; null fields fall back to price_thb_per_tCO2e / costs. */
export interface EconomicsRoundInput {
    /** must be one of this frequency's verification years (1..7) */
    year_at: number;
    price_thb_per_tCO2e?: number | null;
    monitoring_cost?: number | null;
    verification_cost?: number | null;
}

export interface CarbonEconomicsRequest {
    rows: EconomicsRow[];
    costs: EconomicsCosts;
    /** default price for rounds without their own */
    price_thb_per_tCO2e: number;
    verify_every_years: number;
    rounds?: EconomicsRoundInput[];
    /** 0.05 = 5% */
    discount_rate: number;
    compare_frequencies?: number[];
}

/** One CI case (biomass lower or upper bound) of a scenario's headline figures. */
export interface EconomicsBound {
    total_credits_tCO2e: number;
    total_revenue_thb: number;
    net_profit_thb: number;
    npv_thb: number;
    irr: number | null;
    break_even_price_thb: number | null;
    discounted_break_even_price_thb: number | null;
    min_viable_area_rai: number | null;
    is_viable: boolean;
    payback_year_at: number | null;
}

export interface EconomicsScheduleYear {
    year: number;
    /** 0..7, years since the project start */
    year_at: number;
    is_verification: boolean;
    /** sale price at this round; null in non-verification years */
    price_thb_per_tCO2e: number | null;
    carbon_stock_tCO2e: number;
    credits_issued_tCO2e: number;
    cost_thb: number;
    revenue_thb: number;
    net_thb: number;
    cumulative_net_thb: number;
    discounted_net_thb: number;
    /** CI range of credits_issued_tCO2e / net_thb */
    credits_issued_low_tCO2e: number;
    credits_issued_high_tCO2e: number;
    net_low_thb: number;
    net_high_thb: number;
}

export interface EconomicsScenario {
    verify_every_years: number;
    verification_rounds: number;
    verification_years: number[];
    /** credit-weighted average sale price across rounds */
    price_thb_per_tCO2e: number;
    /** monitoring + verification cost per round, in verification_years order */
    round_cost_thb: number[];
    total_cost_thb: number;
    total_credits_tCO2e: number;
    credits_per_rai_tCO2e: number;
    total_revenue_thb: number;
    net_profit_thb: number;
    is_viable: boolean;
    /** null = cumulative net never reaches 0 within the period */
    payback_year_at: number | null;
    npv_thb: number;
    /** fraction; null when the cash flows never change sign */
    irr: number | null;
    break_even_price_thb: number | null;
    discounted_break_even_price_thb: number | null;
    min_viable_area_rai: number | null;
    /** the same scenario with the biomass CI case giving fewer / more credits */
    low: EconomicsBound;
    high: EconomicsBound;
}

export interface EconomicsPlot {
    plot_id: string;
    label: string | null;
    area_rai: number;
    tree_count: number;
    age_at_start: number;
    cohort_ages: number[];
    carbon_stock_start_tCO2e: number;
    carbon_stock_end_tCO2e: number;
    /** whole tonnes, rounded down per round (TGO) */
    credits_tCO2e: number;
    /** credits x each round's price; plots sum to the project revenue */
    revenue_thb: number;
    /** CI range of credits_tCO2e / revenue_thb */
    credits_low_tCO2e: number;
    credits_high_tCO2e: number;
    revenue_low_thb: number;
    revenue_high_thb: number;
    credits_per_rai_tCO2e: number;
    /** a cohort passes the last modeled age (35) during the period; growth held flat */
    beyond_model_age: boolean;
}

export interface EconomicsAgeRow {
    start_age: number;
    credits_per_rai_tCO2e: number;
    min_viable_area_rai: number | null;
}

export interface CarbonEconomicsResponse {
    status: StatusMessage;
    start_year: number;
    crediting_years: number;
    discount_rate: number;
    total_area_rai: number;
    result: EconomicsScenario & { schedule: EconomicsScheduleYear[] };
    plots: EconomicsPlot[];
    frequency_comparison: EconomicsScenario[];
    min_break_even_price_thb: number | null;
    max_break_even_price_thb: number | null;
    age_matrix: EconomicsAgeRow[];
}

export interface LUPolygon {
    lu_class: string;
    lu_class_desc_th: string | null;
    lu_class_desc_en: string | null;
    geometry: GeoJSON.Geometry;
    area_m2: number;
    area_percent: number;
}

export interface PlotsInfoResponse {
    polygon_id: string;
    province_code: string | null;
    geometry: GeoJSON.Geometry;
    area_m2: number | null;
    status: StatusMessage;
    lu_polygon: LUPolygon[] | null;
}

/**
 * Simulated 71-year carbon stock profile for one plot's cohorts.
 * Throws with the backend's `detail` message (e.g. a 422 for an unknown biomass profile).
 */
export async function simulateCarbon(
    rows: CarbonSimulationRow[],
    signal?: AbortSignal
): Promise<CarbonSimulationResponse> {
    const response = await fetch(`${API_BASE_URL}/carbon/sim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rows),
        signal,
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
            typeof errorData?.detail === "string" ? errorData.detail : `Backend API error: ${response.status}`
        );
    }
    return response.json();
}

/** T-VER cost/revenue scenario for a plot's or project's cohort rows. Throws with the backend's `detail`. */
export async function simulateEconomics(
    req: CarbonEconomicsRequest,
    signal?: AbortSignal
): Promise<CarbonEconomicsResponse> {
    const response = await fetch(`${API_BASE_URL}/carbon/economics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
        signal,
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
            typeof errorData?.detail === "string" ? errorData.detail : `Backend API error: ${response.status}`
        );
    }
    return response.json();
}

/**
 * Estimate carbon for plantation polygons using the backend API
 * @param polygons Array of plantation polygons with geometry and optional parameters
 * @returns Array of estimation responses with yearly carbon profiles
 */
export async function assessCarbon(
    polygons: CarbonAssessRequest[]
): Promise<CarbonAssessResponse[]> {
    try {
        const response = await fetch(`${API_BASE_URL}/carbon/assess`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(polygons),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(
                `Backend API error: ${response.status} ${JSON.stringify(errorData)}`
            );
        }

        const data: CarbonAssessResponse[] = await response.json();
        return data;
    } catch (error) {
        console.error("Carbon estimation API error:", error);
        throw error;
    }
}

/**
 * Get land use classification and province for a drawn polygon.
 * @param output_crs CRS for returned geometry: "EPSG:4326" (WGS84 lon/lat, default) or "EPSG:32647" (UTM)
 */
export async function getPlotsInfo(polygon: {
    id: string;
    geometry: GeoJSON.Geometry;
    project_type?: string | null;
    output_crs?: string | null;
}): Promise<PlotsInfoResponse> {
    const response = await fetch(`${API_BASE_URL}/plots/info`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(polygon),
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(`Backend API error: ${response.status} ${JSON.stringify(err)}`);
    }
    return response.json();
}

export interface PlotsNavResponse {
    supported: boolean;
    province_code: string | null;
    message: string;
}

/**
 * Check whether a lat/lon point falls within a province the system services.
 */
export async function getPlotsNav(point: {
    lat: number;
    lon: number;
}): Promise<PlotsNavResponse> {
    const response = await fetch(`${API_BASE_URL}/plots/nav`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(point),
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(`Backend API error: ${response.status} ${JSON.stringify(err)}`);
    }
    return response.json();
}

/** [minLng, minLat, maxLng, maxLat] */
export type BBox = [number, number, number, number];

export interface PlotsLocateResult {
    id: string;
    /** Smallest area that fully contains the geometry. */
    level: "subdistrict" | "district" | "province" | "multi_province" | "none";
    supported: boolean;
    region_th: string | null;
    province_code: string | null;
    province_th: string | null;
    province_bbox: BBox | null;
    district_th: string | null;
    district_bbox: BBox | null;
    subdistrict_th: string | null;
    subdistrict_bbox: BBox | null;
}

/**
 * Find the province / district / subdistrict containing each geometry — a
 * lat/long point, a plot, or a project's bounding box.
 */
export async function getPlotsLocate(
    items: { id: string; geometry: GeoJSON.Geometry }[]
): Promise<PlotsLocateResult[]> {
    const response = await fetch(`${API_BASE_URL}/plots/locate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(`Backend API error: ${response.status} ${JSON.stringify(err)}`);
    }
    const data = await response.json();
    return data.results;
}

/**
 * Get the current year in Buddhist Era (BE)
 * @returns Current year in BE
 */
export function getCurrentYearBE(): number {
    return new Date().getFullYear() + 543;
}
