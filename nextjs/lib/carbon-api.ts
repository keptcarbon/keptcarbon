/**
 * Carbon estimation API service
 * Calls the real backend API instead of using mockup calculations
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:8000/api/v1";

export interface PlantationPolygon {
    id: string;
    geometry: GeoJSON.Geometry;
    year_of_planting?: number | null;
    rubber_clone?: string | null;
    tree_count?: number | null;
    spacing_system?: string | null;
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

export interface YearlyEstimate {
    year: number;
    year_at: number;
    age: number;
    stocks: CarbonValue;
    gain: CarbonValue;
}

export interface EstimatedParamYear {
    value: number | string[];
    note: string[] | null;
    source: string;
}

export interface EstimatedParamSimple {
    value: string | number;
    note: string | null;
    source: string;
}

export interface EstimatedParameters {
    year_of_planting: EstimatedParamYear;
    rubber_clone: EstimatedParamSimple;
    tree_count: EstimatedParamSimple;
    spacing_system: EstimatedParamSimple;
}

export interface EstimationResponse {
    polygon_id: string;
    status: StatusMessage;
    ci?: number | null;
    carbon_profile?: YearlyEstimate[] | null;
    estimated_parameters?: EstimatedParameters | null;
}

export interface LUPolygon {
    lu_class: string;
    lu_class_desc_th: string | null;
    lu_class_desc_en: string | null;
    geometry: GeoJSON.Geometry;
    area_m2: number;
    area_percent: number;
}

export interface PlantationInfoResponse {
    polygon_id: string;
    province_code: string | null;
    geometry: GeoJSON.Geometry;
    area_m2: number | null;
    status: StatusMessage;
    lu_polygon: LUPolygon[] | null;
}

/**
 * Estimate carbon for plantation polygons using the backend API
 * @param polygons Array of plantation polygons with geometry and optional parameters
 * @returns Array of estimation responses with yearly carbon profiles
 */
export async function estimateCarbon(
    polygons: PlantationPolygon[]
): Promise<EstimationResponse[]> {
    try {
        const response = await fetch(`${API_BASE_URL}/estimate`, {
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

        const data: EstimationResponse[] = await response.json();
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
export async function getPlantationInfo(polygon: {
    id: string;
    geometry: GeoJSON.Geometry;
    project_type?: string | null;
    output_crs?: string | null;
}): Promise<PlantationInfoResponse> {
    const response = await fetch(`${API_BASE_URL}/plantation-info`, {
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

/**
 * Get the current year in Buddhist Era (BE)
 * @returns Current year in BE
 */
export function getCurrentYearBE(): number {
    return new Date().getFullYear() + 543;
}

export interface DashboardRayongPerYear {
    age: number;
    plantYearBE: number;
    areaRai: number;
    carbonTco2: number;
}

export interface DashboardRayongAgeGroup {
    key: string;
    areaRai: number;
    carbonTco2: number;
    pct: number;
}

export interface DashboardRayongResponse {
    status: string;
    totalAreaRai: number;
    totalCarbonTco2: number;
    perYearRai: DashboardRayongPerYear[];
    ageGroups: DashboardRayongAgeGroup[];
}

export interface DashboardDistrict {
    name: string;
    areaRai: number;
    carbonTco2: number;
    ageDist: Array<{ group: string; areaRai: number; carbonTco2: number }>;
}

export async function getDashboardRayong(): Promise<DashboardRayongResponse> {
    const response = await fetch(`${API_BASE_URL}/dashboard/rayong-summary`);
    if (!response.ok) throw new Error(`Dashboard API error: ${response.status}`);
    return response.json();
}

export async function getDashboardDistricts(): Promise<{ districts: DashboardDistrict[] }> {
    const response = await fetch(`${API_BASE_URL}/dashboard/districts-summary`);
    if (!response.ok) throw new Error(`Dashboard API error: ${response.status}`);
    return response.json();
}
