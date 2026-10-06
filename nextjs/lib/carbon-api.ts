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
}

export interface CarbonSimulationResponse {
    status: StatusMessage;
    rows: CarbonSimulationRow[];
    total_area_m2: number;
    total_tree_count: number;
    carbon_stock_tCO2e_simulation: SimulationYearlyPoint[] | null;
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
