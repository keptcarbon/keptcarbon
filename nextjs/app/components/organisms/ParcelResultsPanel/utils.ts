import type { EstimationResponse, YearlyEstimate } from "@/lib/carbon-api";
import type { BarPoint } from "./CarbonBarChart";

export interface PlotFormData {
    plantStatus: "replanting" | "existing" | "";
    plantYear: string;
    treeCount: string;
    variety: string;
    spacing: string;
    luChecked: Record<string, boolean>;
    plotIndex?: number;
}

export const VARIETY_OPTIONS = [
    "RRIM 600", "RRIT 251",
];
export const SPACING_OPTIONS = ["2.5x8", "3x7", "2.5x7", "2x6", "3x8"];
export const SUPPORTED_CLONES = ["RRIM 600", "RRIT 251"];

export const CURRENT_CE = new Date().getFullYear();
export const CURRENT_BE = CURRENT_CE + 543;

export const NEW_YEAR_OPTIONS = Array.from({ length: 4 }, (_, i) => String(CURRENT_BE + i));
export const OLD_YEAR_OPTIONS = Array.from({ length: CURRENT_BE - 2534 + 1 }, (_, i) => String(CURRENT_BE - i));

export const LU_DESC_MAP: Record<string, string> = {
    "A": "พื้นที่เกษตรกรรม",
    "U": "พื้นที่ชุมชนและสิ่งปลูกสร้าง",
    "F": "พื้นที่ป่าไม้",
    "W": "แหล่งน้ำ",
    "M": "พื้นที่เบ็ดเตล็ด"
};

export interface CarbonResult {
    plotIdx: number;
    age: number;
    plantYearBE: number;
    trees: number;
    spacing: string;
    variety: string;
    co2Now: number;
    co2NowCi?: number;
    source: "user" | "backend";
    yearUsedDetails?: string;
    selectedAreaRai?: number;
    luBreakdown?: Record<string, { rai: number; pct: number; desc: string }>;
}

export interface PlotInfo {
    age: number;
    plantYearBE: number;
    areaRai: number;
    trees: number;
    co2: number;
    confidence: number;
    province: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────
export function getCentroid(coords: [number, number][]): [number, number] {
    let sumX = 0, sumY = 0;
    coords.forEach(([x, y]) => {
        sumX += x;
        sumY += y;
    });
    return [sumX / coords.length, sumY / coords.length];
}

export function getSamplePoint(geom: GeoJSON.Geometry): [number, number] {
    if (geom.type === "Polygon") {
        return getCentroid(geom.coordinates[0] as [number, number][]);
    }
    if (geom.type === "MultiPolygon") {
        return getCentroid(geom.coordinates[0][0] as [number, number][]);
    }
    return [0, 0];
}

export function isPointInPolygon(point: [number, number], polygon: [number, number][][]): boolean {
    const [x, y] = point;
    let inside = false;
    for (const ring of polygon) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const xi = ring[i][0], yi = ring[i][1];
            const xj = ring[j][0], yj = ring[j][1];
            const intersect = ((yi > y) !== (yj > y))
                && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
    }
    return inside;
}

export function isPointInGeometry(point: [number, number], geom: GeoJSON.Geometry): boolean {
    if (geom.type === "Polygon") {
        return isPointInPolygon(point, geom.coordinates as [number, number][][]);
    }
    if (geom.type === "MultiPolygon") {
        return (geom.coordinates as [number, number][][][]).some(poly => isPointInPolygon(point, poly));
    }
    return false;
}

export function parseRai(v: unknown): number {
    if (!v) return 0;
    const s = String(v).trim();
    const m = s.match(/^(\d+)-(\d+)-(\d+)/);
    if (m) return +m[1] + +m[2] * 0.25 + +m[3] / 400;
    return parseFloat(s) || 0;
}

export function getFriendlyErrorMessage(err: unknown, plots: PlotInfo[], plotForms: PlotFormData[], plotIds: string[] = []): string {
    const msg = err instanceof Error ? err.message : String(err);

    // Try to parse backend error JSON if possible
    let backendErrData: any = null;
    const jsonMatch = msg.match(/Backend API error: \d+ (\{.*\})/);
    if (jsonMatch && jsonMatch[1]) {
        try {
            backendErrData = JSON.parse(jsonMatch[1]);
        } catch (e) {
            // ignore parse errors
        }
    }

    // Check for specific error codes (E01, E02, E04)
    const statusCode = backendErrData?.status_code || backendErrData?.status?.status_code;
    const backendMessage = backendErrData?.message || backendErrData?.status?.message || "";
    const polygonId = backendErrData?.polygon_id || backendErrData?.status?.polygon_id;

    let plotSuffix = "";
    if (polygonId && typeof polygonId === "string") {
        let plotIdx = plotIds.indexOf(polygonId);
        if (plotIdx === -1 && polygonId.startsWith("plot-")) {
            plotIdx = parseInt(polygonId.replace("plot-", ""), 10);
        }
        if (plotIdx !== -1 && !isNaN(plotIdx)) {
            plotSuffix = ` (ที่แปลง ${plotIdx + 1})`;
        }
    }

    const isE01 = statusCode === "E01" || msg.includes('"status_code":"E01"') || msg.includes('"E01"');
    const isE02 = statusCode === "E02" || msg.includes('"status_code":"E02"') || msg.includes('"E02"');
    const isE04 = statusCode === "E04" || msg.includes('"status_code":"E04"') || msg.includes('"E04"');

    // Fallback for E04: find missing plots manually
    if (isE04 && !plotSuffix) {
        const missingPlots = [];
        for (let i = 0; i < plots.length; i++) {
            const form = plotForms[i];
            if (form?.plantStatus === "existing" && !form?.plantYear) {
                missingPlots.push(i + 1);
            }
        }
        if (missingPlots.length > 0) {
            plotSuffix = ` (ที่แปลง ${missingPlots.join(", ")})`;
        }
    }

    if (isE01) {
        return `พื้นที่ที่คุณระบุไม่อยู่ในขอบเขตประเทศไทย กรุณาลบแล้ววาดแปลงใหม่${plotSuffix}`;
    }
    if (isE02) {
        return `พื้นที่ที่คุณระบุไม่อยู่ในจังหวัดที่ให้บริการ กรุณาลบแล้ววาดแปลงใหม่${plotSuffix}`;
    }
    if (isE04) {
        return `ไม่พบข้อมูลปีปลูกในฐานข้อมูล กรุณาระบุปีปลูก (พ.ศ.) ในช่องกรอกข้อมูล${plotSuffix}`;
    }

    // Translate English errors from the backend
    if (backendMessage) {
        if (backendErrData?.message_th) {
            return `${backendErrData.message_th}${plotSuffix}`;
        }
        if (backendErrData?.status?.message_th) {
            return `${backendErrData.status.message_th}${plotSuffix}`;
        }

        const engMsg = backendMessage.toLowerCase();
        if (engMsg.includes("not found")) return `ไม่พบข้อมูลในระบบ กรุณาตรวจสอบอีกครั้ง${plotSuffix}`;
        if (engMsg.includes("invalid") && engMsg.includes("polygon")) return `รูปทรงหรือขอบเขตพื้นที่ไม่ถูกต้อง กรุณาลบแล้ววาดแปลงใหม่${plotSuffix}`;
        if (engMsg.includes("invalid")) return `ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง${plotSuffix}`;
        if (engMsg.includes("geometry")) return `ข้อมูลพิกัดพื้นที่ไม่ถูกต้อง กรุณาลบแล้ววาดแปลงใหม่${plotSuffix}`;
        if (engMsg.includes("timeout")) return `ระบบใช้เวลาประมวลผลนานเกินไป กรุณาลองใหม่อีกครั้ง${plotSuffix}`;
        if (engMsg.includes("missing")) return `ข้อมูลไม่ครบถ้วน กรุณาตรวจสอบการกรอกข้อมูล${plotSuffix}`;
        if (engMsg.includes("overlap")) return `พื้นที่ทับซ้อนกับแปลงอื่น กรุณาลบแล้ววาดแปลงใหม่${plotSuffix}`;
        if (engMsg.includes("error") || engMsg.includes("failed")) return `ระบบเกิดข้อผิดพลาดในการประมวลผล กรุณาลองใหม่อีกครั้ง${plotSuffix}`;

        // General prefix for unknown backend messages translated
        return `ระบบไม่สามารถประมวลผลได้: ${backendMessage} กรุณาลองใหม่อีกครั้ง${plotSuffix}`;
    }

    // Backend 500 errors
    if (msg.includes("Backend API error: 500")) {
        return `กรุณาเลือกประเภทการใช้ที่ดินอย่างน้อย 1 ประเภทในแต่ละแปลงก่อนประมวลผล${plotSuffix}`;
    }

    // Network / connection errors
    if (msg.includes("fetch") || msg.includes("NetworkError") || msg.includes("Failed to fetch")) {
        return `ไม่สามารถเชื่อมต่อกับระบบประมวลผลคาร์บอนเครดิตได้${plotSuffix}`;
    }

    // Other errors
    return `เกิดข้อผิดพลาดในการประมวลผลคาร์บอนเครดิต กรุณาตรวจสอบข้อมูลแปลงและลองอีกครั้ง${plotSuffix}`;
}

export function computePlot(feat: GeoJSON.Feature): PlotInfo {
    const p = (feat.properties ?? {}) as Record<string, unknown>;
    const rawM2 = (p.area_m2 as number) || 0;
    const areaRai = rawM2 > 0 ? rawM2 / 1600 : parseRai(p.rai ?? p.grow_area ?? p.areaRai);

    let bPlantYear = Number(p.grow_year || 0);
    let bAge = Number(p.rubber_age || 0);

    const CURRENT_BE = new Date().getFullYear() + 543;

    // Normalize plant year to BE
    if (bPlantYear > 0 && bPlantYear < 2300) {
        bPlantYear += 543;
    }

    // If we have plantYear but no age, compute age
    if (bAge === 0 && bPlantYear > 0) {
        bAge = Math.max(0, CURRENT_BE - bPlantYear);
    }
    // If we have age but no plantYear, compute plantYear
    if (bPlantYear === 0 && bAge > 0) {
        bPlantYear = CURRENT_BE - bAge;
    }

    return {
        age: bAge,
        plantYearBE: bPlantYear,
        areaRai,
        trees: 0,
        co2: 0,
        confidence: 0,
        province: String(p.province ?? ""),
    };
}

export function aggregateProfiles(responses: EstimationResponse[], fallbackBaseAge: number = 0): BarPoint[] {
    // Only keep non-empty profiles and filter by age <= 35 to match visual graph cutoff
    const profiles = responses
        .map(r => r.carbon_profile)
        .filter((p): p is YearlyEstimate[] => Array.isArray(p) && p.length > 0);

    if (profiles.length === 0) return [];

    // Find the total year range: earliest start year → shortest end year across all profiles.
    // 'พศที่สั้นที่สุด' means we stop the aggregate graph entirely when the shortest plot ends.
    const limitEndYear = Math.min(...profiles.map(p => p[p.length - 1].year));
    const minStartYear = Math.min(...profiles.map(p => p[0].year));

    const validYears: number[] = [];
    for (let y = minStartYear; y <= limitEndYear; y++) {
        validYears.push(y);
    }
    const validYearsSet = new Set(validYears);

    // Initialise the accumulator only for valid years
    const yearMap = new Map<number, {
        totalCo2: number;
        sumLinearCI: number;
        totalAge: number;
        validAgeCount: number;
        totalGain: number;
        sumLinearGainCI: number;
    }>();
    for (const year of validYears) {
        yearMap.set(year, { totalCo2: 0, sumLinearCI: 0, totalAge: 0, validAgeCount: 0, totalGain: 0, sumLinearGainCI: 0 });
    }

    // Sum each plot's contribution, skipping years outside the shortest profile's range
    for (const profile of profiles) {
        for (const item of profile) {
            if (!item || !validYearsSet.has(item.year)) continue;
            const data = yearMap.get(item.year)!;
            data.totalCo2 += Math.floor(item.stocks.value || 0);
            data.sumLinearCI = Math.round((data.sumLinearCI + Math.floor((item.stocks.ci || 0) * 10) / 10) * 10) / 10;
            if (item.age != null && !isNaN(item.age)) {
                data.totalAge += item.age;
                data.validAgeCount++;
            }
            data.totalGain += Math.floor(item.gain.value || 0);
            data.sumLinearGainCI = Math.round((data.sumLinearGainCI + Math.floor((item.gain.ci || 0) * 10) / 10) * 10) / 10;
        }
    }

    return validYears.map((year, j) => {
        const data = yearMap.get(year)!;
        const avgAge = data.validAgeCount > 0 ? Math.round(data.totalAge / data.validAgeCount) : fallbackBaseAge + j;
        return {
            age: avgAge,
            yearBE: year + 543,
            year_at: j,
            co2: data.totalCo2,
            ci: data.sumLinearCI,
            gainValue: data.totalGain,
            gainCi: data.sumLinearGainCI,
            cycle: Math.floor(j / 7),
            cycleAge: avgAge,
            errorMargin: data.sumLinearCI,
        };
    });
}

export function convertYearNoteToBE(note: string): string {
    return note.replace(/^(\d{4})/, (_, y) => String(parseInt(y) + 543));
}