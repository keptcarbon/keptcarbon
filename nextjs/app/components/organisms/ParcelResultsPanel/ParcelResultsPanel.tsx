"use client";
import { useState, useMemo, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { CarbonBarChart, buildBarPoints, carbonCo2, type BarPoint } from "./CarbonBarChart";
import { estimateCarbon, type PlantationPolygon, type EstimationResponse, type YearlyEstimate, type EstimatedParameters } from "@/lib/carbon-api";


// ── Types ─────────────────────────────────────────────────────────────────
type Props = {
    searchRunning: boolean;
    searchErr: string | null;
    searchCount: number | null;
    searchTruncated: boolean;
    parcelFeatures: GeoJSON.Feature[];
    luFeatures?: GeoJSON.Feature[];
    userDisplayName?: string;
    drawnGeometry?: GeoJSON.Geometry | null;
    onFlyTo: (feature: GeoJSON.Feature) => void;
    onReset?: () => void;
    onBack?: () => void;
    onCancel?: () => void;
    currentStep: 1 | 2 | 3;
    onStepChange: (step: 1 | 2 | 3) => void;
    selectedMapPlotIndex?: number | "total";
    onMapPlotSelected?: (idx: number | "total") => void;
    onDeleteParcel?: (idx: number) => void;
    onDrawMore?: () => void;
    onCancelDraw?: () => void;
    isDrawing?: boolean;
    onLandUseChange?: (allPlotsChecked: Record<number, Record<string, boolean>>, focusedPlotIdx?: number | null) => void;
    onProjectTypeChange?: (type: "replanting" | "existing") => void;
    projectName?: string;
};



interface PlotFormData {
    plantStatus: "replanting" | "existing" | "";
    plantYear: string;
    treeCount: string;
    variety: string;
    spacing: string;
    luChecked: Record<string, boolean>;
}

const VARIETY_OPTIONS = [
    "RRIM 600", "RRIT 251",
];
const SPACING_OPTIONS = ["2.5x8", "3x7", "2.5x7", "2x6", "3x8"];
const SUPPORTED_CLONES = ["RRIM 600", "RRIT 251"];

const CURRENT_CE = new Date().getFullYear();
const CURRENT_BE = CURRENT_CE + 543;

const NEW_YEAR_OPTIONS = Array.from({ length: 4 }, (_, i) => String(CURRENT_BE + i));
const OLD_YEAR_OPTIONS = Array.from({ length: CURRENT_BE - 2534 + 1 }, (_, i) => String(CURRENT_BE - i));

const LU_DESC_MAP: Record<string, string> = {
    "A": "พื้นที่เกษตรกรรม",
    "U": "พื้นที่ชุมชนและสิ่งปลูกสร้าง",
    "F": "พื้นที่ป่าไม้",
    "W": "แหล่งน้ำ",
    "M": "พื้นที่เบ็ดเตล็ด"
};

interface CarbonResult {
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

interface PlotInfo {
    age: number;
    plantYearBE: number;
    areaRai: number;
    trees: number;
    co2: number;
    confidence: number;
    province: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────
function getCentroid(coords: [number, number][]): [number, number] {
    let sumX = 0, sumY = 0;
    coords.forEach(([x, y]) => {
        sumX += x;
        sumY += y;
    });
    return [sumX / coords.length, sumY / coords.length];
}

function getSamplePoint(geom: GeoJSON.Geometry): [number, number] {
    if (geom.type === "Polygon") {
        return getCentroid(geom.coordinates[0] as [number, number][]);
    }
    if (geom.type === "MultiPolygon") {
        return getCentroid(geom.coordinates[0][0] as [number, number][]);
    }
    return [0, 0];
}

function isPointInPolygon(point: [number, number], polygon: [number, number][][]): boolean {
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

function isPointInGeometry(point: [number, number], geom: GeoJSON.Geometry): boolean {
    if (geom.type === "Polygon") {
        return isPointInPolygon(point, geom.coordinates as [number, number][][]);
    }
    if (geom.type === "MultiPolygon") {
        return (geom.coordinates as [number, number][][][]).some(poly => isPointInPolygon(point, poly));
    }
    return false;
}

function parseRai(v: unknown): number {
    if (!v) return 0;
    const s = String(v).trim();
    const m = s.match(/^(\d+)-(\d+)-(\d+)/);
    if (m) return +m[1] + +m[2] * 0.25 + +m[3] / 400;
    return parseFloat(s) || 0;
}

function getFriendlyErrorMessage(err: unknown, plots: PlotInfo[], plotForms: PlotFormData[]): string {
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
    if (polygonId && typeof polygonId === "string" && polygonId.startsWith("plot-")) {
        const plotIdx = parseInt(polygonId.replace("plot-", ""), 10);
        if (!isNaN(plotIdx)) {
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
        // Check if any plot is "existing" with no planting data — likely cause
        const missingPlots = [];
        for (let i = 0; i < plots.length; i++) {
            const form = plotForms[i];
            const p = plots[i];
            if (form?.plantStatus === "existing" && !form.plantYear && !p.plantYearBE) {
                missingPlots.push(i + 1);
            }
        }
        if (missingPlots.length > 0) {
            const updatedSuffix = plotSuffix || ` (ที่แปลง ${missingPlots.join(", ")})`;
            return `ไม่พบข้อมูลปีปลูกในฐานข้อมูล กรุณาระบุปีปลูก (พ.ศ.) ในช่องกรอกข้อมูล${updatedSuffix}`;
        }
        return `ระบบไม่สามารถประมวลผลคาร์บอนได้ในขณะนี้ กรุณาตรวจสอบข้อมูลแปลงอีกครั้ง หรือลองใหม่ภายหลัง${plotSuffix}`;
    }

    // Network / connection errors
    if (msg.includes("fetch") || msg.includes("NetworkError") || msg.includes("Failed to fetch")) {
        return `ไม่สามารถเชื่อมต่อกับระบบประมวลผลได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ตและลองอีกครั้ง${plotSuffix}`;
    }

    // Other errors
    return `เกิดข้อผิดพลาดในการประมวลผลคาร์บอน กรุณาตรวจสอบข้อมูลแปลงและลองอีกครั้ง${plotSuffix}`;
}

function computePlot(feat: GeoJSON.Feature): PlotInfo {
    const p = (feat.properties ?? {}) as Record<string, unknown>;
    const areaRai = parseRai(p.grow_area || p.rai);

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

function profileToBarPoints(profile: YearlyEstimate[], baseAge: number = 0): BarPoint[] {
    return profile.map((item, i) => {
        const yearAt = item.year_at ?? i;
        const age = (item.age != null && !isNaN(item.age)) ? item.age : baseAge + yearAt;
        return {
            age,
            yearBE: item.year + 543,
            year_at: yearAt,
            co2: item.stocks.value,
            ci: item.stocks.ci,
            gainValue: item.gain.value,
            gainCi: item.gain.ci,
            cycle: Math.floor(yearAt / 7),
            cycleAge: age,
            errorMargin: item.stocks.ci,
        };
    });
}

function aggregateProfiles(responses: EstimationResponse[], fallbackBaseAge: number = 0): BarPoint[] {
    const profiles = responses.map(r => r.carbon_profile ?? []);
    if (!profiles.length || !profiles[0].length) return [];
    const len = Math.min(...profiles.map(p => p.length));
    const pts: BarPoint[] = [];
    for (let j = 0; j < len; j++) {
        const first = profiles[0][j];
        const yearBE = first.year + 543;
        const year_at = first.year_at;
        let totalCo2 = 0;
        let sumSqCI = 0;
        let totalAge = 0;
        let validAgeCount = 0;
        let totalGain = 0;
        let sumSqGainCI = 0;

        for (let i = 0; i < profiles.length; i++) {
            const item = profiles[i][j];
            if (!item) continue;
            totalCo2 += item.stocks.value;
            sumSqCI += item.stocks.ci * item.stocks.ci;
            if (item.age != null && !isNaN(item.age)) {
                totalAge += item.age;
                validAgeCount++;
            }
            totalGain += item.gain.value;
            sumSqGainCI += item.gain.ci * item.gain.ci;
        }

        const avgAge = validAgeCount > 0 ? Math.round(totalAge / validAgeCount) : fallbackBaseAge + j;
        const totalCI = Math.sqrt(sumSqCI);
        const totalGainCI = Math.sqrt(sumSqGainCI);

        pts.push({
            age: avgAge,
            yearBE,
            year_at,
            co2: totalCo2,
            ci: totalCI,
            gainValue: totalGain,
            gainCi: totalGainCI,
            cycle: Math.floor(year_at / 7),
            cycleAge: avgAge,
            errorMargin: totalCI,
        });
    }
    return pts;
}

function convertYearNoteToBE(note: string): string {
    return note.replace(/^(\d{4})/, (_, y) => String(parseInt(y) + 543));
}

function PlotDetailCard({
    form,
    cr,
    ep,
}: {
    form: PlotFormData | undefined;
    cr: CarbonResult;
    ep: EstimatedParameters | null | undefined;
}) {
    const userEnteredYear = !!form?.plantYear;
    const yearParam = ep?.year_of_planting;
    const rawNotes = yearParam?.note ?? [];
    const yearNotes = rawNotes.slice(0, 5);

    // Parse year boxes from value
    let yearBoxItems: Array<{ label: string; pct: number }> = [];
    let displayYearBE: number | null = null;

    if (yearParam) {
        if (typeof yearParam.value === "number" && yearParam.value > 0) {
            displayYearBE = yearParam.value + 543;
            yearBoxItems = [{ label: `พ.ศ. ${displayYearBE}`, pct: 0 }];
        } else if (Array.isArray(yearParam.value) && yearParam.value.length > 0) {
            const parsed = (yearParam.value as string[]).map(s => {
                const yearMatch = s.match(/^(\d{4})/);
                const pctMatch = s.match(/([\d.]+)%/);
                const yearCE = yearMatch ? parseInt(yearMatch[1]) : null;
                const yearBE = yearCE !== null ? yearCE + 543 : null;
                const pct = pctMatch ? parseFloat(pctMatch[1]) : 0;
                return { label: yearBE ? `${yearBE}` : s, pct, yearBE };
            }).filter((x): x is { label: string; pct: number; yearBE: number } => x.yearBE !== null);
            parsed.sort((a, b) => b.pct - a.pct);
            yearBoxItems = parsed;
            if (parsed.length > 0) displayYearBE = parsed[0].yearBE;
        }
    }
    if (!displayYearBE && cr.plantYearBE > 0) displayYearBE = cr.plantYearBE;

    const isVarietyFromUser = !!form?.variety;
    const isSpacingFromUser = !!form?.spacing;
    const isTreeCountFromUser = !!form?.treeCount;

    const variety = isVarietyFromUser ? form.variety : (ep?.rubber_clone.value ? String(ep.rubber_clone.value) : "");
    const spacing = isSpacingFromUser ? form.spacing : (ep?.spacing_system.value ? String(ep.spacing_system.value).replace(/\s*\([^)]*\)/, "").trim() : "");
    const treeCount = isTreeCountFromUser
        ? (parseInt(form.treeCount) || 0)
        : (ep?.tree_count.value && typeof ep.tree_count.value === "number" ? ep.tree_count.value : cr.trees);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13, color: "#475569" }}>
            <div style={{ padding: "12px 14px", background: "rgba(16,185,129,0.04)", borderRadius: 10, border: "1px solid rgba(16,185,129,0.15)" }}>
                {/* Header Section */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                    <span style={{ fontWeight: 700, color: "#047857", display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
                        <i className="bi bi-layers-fill" /> ข้อมูลที่ใช้ในการประมวลผล
                    </span>
                </div>

                {/* Main Year Info (from user or value) */}
                <div style={{ marginBottom: yearNotes.length > 0 ? 12 : 0 }}>
                    <div style={{ fontSize: 12, color: "#475569", fontWeight: 700, marginBottom: 6 }}>
                        ปีที่เริ่มปลูกที่ใช้ในการคำนวณ {(!userEnteredYear && yearBoxItems.length > 0) ? `(${yearBoxItems.length} ปี):` : ":"}
                    </div>
                    <div style={{
                        display: "flex", alignItems: "flex-start", gap: 6,
                        fontSize: 11, color: "#059669", fontWeight: 600,
                        background: "rgba(16,185,129,0.1)", padding: "6px 8px",
                        borderRadius: 6, border: "1px dashed rgba(16,185,129,0.2)", width: "fit-content", lineHeight: 1.3,
                        marginBottom: 8
                    }}>
                        <i className="bi bi-info-circle-fill" style={{ marginTop: 1, flexShrink: 0 }} />
                        <span>
                            {userEnteredYear
                                ? "ข้อมูลที่ผู้ใช้ระบุ"
                                : "ข้อมูลอ้างอิงจากระบบ"}
                        </span>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                        {userEnteredYear ? (
                            <div style={{
                                padding: "4px 10px",
                                background: "rgba(100,116,139,0.06)",
                                borderRadius: 8,
                                border: "1px solid rgba(100,116,139,0.15)",
                                fontWeight: 500,
                                fontSize: 12,
                                color: "#475569",
                            }}>
                                {displayYearBE ? `${displayYearBE}` : "—"}
                            </div>
                        ) : yearBoxItems.length > 0 ? (
                            <>
                                {yearBoxItems.slice(0, 3).map((box, bi) => (
                                    <div key={bi} style={{
                                        padding: "4px 10px",
                                        background: "rgba(100,116,139,0.06)",
                                        borderRadius: 8,
                                        border: "1px solid rgba(100,116,139,0.15)",
                                        fontWeight: 500,
                                        fontSize: 12,
                                        color: "#475569",
                                    }}>
                                        {box.label}{box.pct > 0 ? ` (${box.pct}%)` : ""}
                                    </div>
                                ))}
                                {yearBoxItems.length > 3 && (
                                    <span style={{ fontSize: 14, color: "#94a3b8", fontWeight: 600 }}>...</span>
                                )}
                            </>
                        ) : (
                            <div style={{ fontSize: 12, color: "#475569" }}>—</div>
                        )}
                    </div>
                </div>

                {/* Inner Box for yearNotes (สัดส่วนปีที่ปลูกที่ตรวจพบในแปลง) */}
                {yearNotes.length > 0 && (
                    <div style={{ padding: "10px 12px", background: "rgba(255,255,255,0.6)", borderRadius: 8, border: "1px solid rgba(16,185,129,0.2)" }}>
                        <div style={{ fontSize: 12, color: "#475569", fontWeight: 700, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                            <i className="bi bi-pie-chart-fill" style={{ color: "#059669" }} /> สัดส่วนปีที่เริ่มปลูกที่ตรวจพบในแปลง:
                        </div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                            {yearNotes.slice(0, 3).map((note, ni) => {
                                const beNote = convertYearNoteToBE(note);
                                const displayNote = beNote;
                                return (
                                    <div key={ni} style={{
                                        padding: "4px 8px",
                                        background: "rgba(100,116,139,0.04)",
                                        borderRadius: 6,
                                        border: "1px solid rgba(100,116,139,0.1)",
                                        fontWeight: 500,
                                        fontSize: 11,
                                        color: "#475569",
                                    }}>
                                        {displayNote}
                                    </div>
                                );
                            })}
                            {yearNotes.length > 3 && (
                                <span style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>...</span>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Common params: variety, spacing, tree count */}
            <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 2 }}>
                {variety && <div>• พันธุ์ยาง: <strong style={{ color: "#0f172a" }}>{variety}</strong> {!isVarietyFromUser && <span style={{ color: "#64748b", fontSize: 12 }}>(ค่าเริ่มต้น)</span>}</div>}
                {spacing && <div>• ระยะปลูก: <strong style={{ color: "#0f172a" }}>{spacing}</strong> {!isSpacingFromUser && <span style={{ color: "#64748b", fontSize: 12 }}>(ค่าเริ่มต้น)</span>}</div>}
                {treeCount > 0 && <div>• จำนวนต้น: <strong style={{ color: "#0f172a" }}>{treeCount.toLocaleString("th-TH")}</strong> ต้น {!isTreeCountFromUser && <span style={{ color: "#64748b", fontSize: 12 }}>(ประเมินโดยระบบ)</span>}</div>}
            </div>
        </div>
    );
}

// ── Main component ─────────────────────────────────────────────────────────
export function ParcelResultsPanel({
    searchRunning,
    searchErr,
    searchCount,
    searchTruncated,
    parcelFeatures,
    luFeatures = [],
    userDisplayName = "",
    drawnGeometry = null,
    onFlyTo,
    onReset,
    onBack,
    onCancel,
    currentStep,
    onStepChange,
    selectedMapPlotIndex = "total",
    onMapPlotSelected,
    onDeleteParcel,
    onDrawMore,
    onCancelDraw,
    isDrawing,
    onLandUseChange,
    onProjectTypeChange,
    projectName = "",
}: Props) {
    const [expandedIdx, setExpandedIdx] = useState<number | null>(0);
    const [expandedResultIdx, setExpandedResultIdx] = useState<number | "total" | null>(null);
    const { user } = useAuth();

    const plots = useMemo(() => parcelFeatures.map(computePlot), [parcelFeatures]);
    const totalArea = useMemo(() => plots.reduce((s, p) => s + p.areaRai, 0), [plots]);

    console.log("[ParcelResultsPanel] Render/Props:", {
        parcelFeaturesCount: parcelFeatures.length,
        luFeaturesCount: luFeatures.length,
        plotsCount: plots.length,
        totalArea,
        parcelFeatures,
        luFeatures
    });

    // Build real land-use area data from luFeatures (lu_polygon properties from plantation-info API)
    const plotsLuRealData = useMemo(() => {
        const dataArr: Record<string, { rai: number; pct: number; desc?: string }>[] = [];
        const featuresToUse = luFeatures.length > 0 ? luFeatures : parcelFeatures;

        const featsByPlot: Record<number, typeof featuresToUse> = {};
        for (let idx = 0; idx < parcelFeatures.length; idx++) {
            featsByPlot[idx] = [];
        }

        featuresToUse.forEach(feat => {
            const props = (feat.properties ?? {}) as Record<string, unknown>;
            const plotIdxFromProp = props.plot_index !== undefined
                ? parseInt(String(props.plot_index), 10) - 1
                : -1;
            let matchedPlotIdx = 0;
            if (plotIdxFromProp >= 0 && plotIdxFromProp < parcelFeatures.length) {
                matchedPlotIdx = plotIdxFromProp;
            } else {
                const samplePoint = getSamplePoint(feat.geometry);
                for (let idx = 0; idx < parcelFeatures.length; idx++) {
                    if (isPointInGeometry(samplePoint, parcelFeatures[idx].geometry)) {
                        matchedPlotIdx = idx;
                        break;
                    }
                }
            }
            featsByPlot[matchedPlotIdx].push(feat);
        });

        for (let idx = 0; idx < parcelFeatures.length; idx++) {
            const plotFeats = featsByPlot[idx] || [];
            const data: Record<string, { rai: number; pct: number; desc?: string }> = {};
            const plotTotalArea = plots[idx]?.areaRai || 0;

            let totalIntersectedM2 = 0;
            for (const feat of plotFeats) {
                const p = (feat.properties ?? {}) as Record<string, unknown>;
                const m2 = (p.area_m2 as number) || 0;
                if (p.lu_class) totalIntersectedM2 += m2;
            }

            const scaleFactor = (totalIntersectedM2 > 0 && plotTotalArea > 0)
                ? (plotTotalArea * 1600) / totalIntersectedM2
                : 1.0;

            for (const feat of plotFeats) {
                const p = (feat.properties ?? {}) as Record<string, unknown>;
                const cls = p.lu_class as string | undefined;
                const desc = p.lu_class_desc_th as string | undefined;
                const rawM2 = (p.area_m2 as number) || 0;

                if (cls) {
                    const scaledM2 = rawM2 * scaleFactor;
                    const scaledRai = scaledM2 / 1600;
                    const scaledPct = totalIntersectedM2 > 0 ? (rawM2 / totalIntersectedM2) * 100 : 0;

                    if (!data[cls]) {
                        data[cls] = { rai: 0, pct: 0, desc: desc || "" };
                    }
                    data[cls].rai += scaledRai;
                    data[cls].pct += scaledPct;
                    if (desc) data[cls].desc = desc;
                }
            }

            let aRai = 0, aPct = 0;
            for (const key in data) {
                if (key.startsWith("A") && key !== "A") {
                    aRai += data[key].rai;
                    aPct += data[key].pct;
                }
            }
            if (aRai > 0) {
                data["A"] = { rai: aRai, pct: aPct, desc: "พื้นที่เกษตรกรรม" };
            }

            const parentKeys = ["A", "U", "F", "W", "M"];
            let roundedParentRaiSum = 0, roundedParentPctSum = 0;
            let largestParentKey = "", maxRai = -1;

            for (const key in data) {
                data[key].rai = Math.round(data[key].rai * 100) / 100;
                data[key].pct = Math.round(data[key].pct * 10) / 10;
                if (parentKeys.includes(key)) {
                    roundedParentRaiSum += data[key].rai;
                    roundedParentPctSum += data[key].pct;
                    if (data[key].rai > maxRai) {
                        maxRai = data[key].rai;
                        largestParentKey = key;
                    }
                }
            }

            if (plotTotalArea > 0 && largestParentKey) {
                const raiDiff = plotTotalArea - roundedParentRaiSum;
                const pctDiff = 100.0 - roundedParentPctSum;
                if (Math.abs(raiDiff) < 0.2) {
                    data[largestParentKey].rai = Math.round((data[largestParentKey].rai + raiDiff) * 100) / 100;
                }
                if (Math.abs(pctDiff) < 2.0) {
                    data[largestParentKey].pct = Math.round((data[largestParentKey].pct + pctDiff) * 10) / 10;
                }
            }

            if (data["A"]) {
                const subKeys = Object.keys(data).filter(k => k.startsWith("A") && k !== "A");
                if (subKeys.length > 0) {
                    let roundedSubRaiSum = 0, roundedSubPctSum = 0;
                    let largestSubKey = "", maxSubRai = -1;
                    subKeys.forEach(k => {
                        roundedSubRaiSum += data[k].rai;
                        roundedSubPctSum += data[k].pct;
                        if (data[k].rai > maxSubRai) {
                            maxSubRai = data[k].rai;
                            largestSubKey = k;
                        }
                    });
                    if (largestSubKey) {
                        const subRaiDiff = data["A"].rai - roundedSubRaiSum;
                        const subPctDiff = data["A"].pct - roundedSubPctSum;
                        if (Math.abs(subRaiDiff) < 0.2) {
                            data[largestSubKey].rai = Math.round((data[largestSubKey].rai + subRaiDiff) * 100) / 100;
                        }
                        if (Math.abs(subPctDiff) < 2.0) {
                            data[largestSubKey].pct = Math.round((data[largestSubKey].pct + subPctDiff) * 10) / 10;
                        }
                    }
                }
            }
            dataArr.push(data);
        }
        return dataArr;
    }, [parcelFeatures, luFeatures, plots]);
    const dominantProvince = useMemo(() => {
        const freq: Record<string, number> = {};
        plots.forEach(p => { if (p.province) freq[p.province] = (freq[p.province] ?? 0) + 1; });
        return Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
    }, [plots]);

    // Responsive detection
    const [isMobile, setIsMobile] = useState(typeof window !== "undefined" ? window.innerWidth < 768 : false);
    useEffect(() => {
        if (typeof window === "undefined") return;
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    const prevPlotsLen = useRef(plots.length);
    useEffect(() => {
        if (plots.length > prevPlotsLen.current) {
            setExpandedIdx(plots.length - 1);
        }
        prevPlotsLen.current = plots.length;
    }, [plots.length]);


    const searchParams = useSearchParams();
    const initialProjectName = searchParams.get("project") || "";

    const isDuplicateProjectName = useMemo(() => {
        if (!projectName.trim()) return false;
        if (initialProjectName && projectName.trim().toLowerCase() === initialProjectName.trim().toLowerCase()) {
            return false;
        }

        try {
            const key = user ? `user_saved_plots_${user.id}` : "global_saved_plots";
            const existing = JSON.parse(localStorage.getItem(key) || "[]");
            const names = new Set(existing.map((p: any) => String(p.name || "").trim().toLowerCase()));
            return names.has(projectName.trim().toLowerCase());
        } catch (e) {
            console.error(e);
            return false;
        }
    }, [projectName, initialProjectName, user]);

    const [ownerName, setOwnerName] = useState(userDisplayName);
    const [province, setProvince] = useState("");
    const [saveState, setSaveState] = useState<"idle" | "saving" | "done">("idle");
    const [plotForms, setPlotForms] = useState<PlotFormData[]>([]);

    // When plotForms grows (new parcel added), propagate initial luChecked to map
    const prevPlotFormsLen = useRef(0);
    useEffect(() => {
        if (plotForms.length > prevPlotFormsLen.current && currentStep === 2) {
            const allChecked: Record<number, Record<string, boolean>> = {};
            plotForms.forEach((f, idx) => { allChecked[idx] = f.luChecked; });
            onLandUseChange?.(allChecked, expandedIdx);
        }
        prevPlotFormsLen.current = plotForms.length;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [plotForms.length]);

    // Sync map with currently expanded plot whenever step 2 is active or expandedIdx changes
    useEffect(() => {
        if (currentStep !== 2) return;
        if (expandedIdx !== null) {
            onMapPlotSelected?.(expandedIdx);
            const allChecked: Record<number, Record<string, boolean>> = {};
            plotForms.forEach((f, idx) => { allChecked[idx] = f.luChecked; });
            onLandUseChange?.(allChecked, expandedIdx);
        }
    }, [currentStep, expandedIdx, plotForms, onMapPlotSelected, onLandUseChange]);

    // When LU data arrives from backend, auto-check relevant LU classes per status
    useEffect(() => {
        setPlotForms(prev => {
            let changed = false;
            const next = prev.map((form) => {
                if (form.plantStatus === "replanting") {
                    // replanting: A and A302 are auto-checked, other classes must be checked manually
                    if (form.luChecked.A && form.luChecked.A302) return form;
                    changed = true;
                    return { ...form, luChecked: { ...form.luChecked, A: true, A302: true } };
                } else if (form.plantStatus === "existing") {
                    // existing: only A302 is auto-checked, other sub-types must be checked manually
                    const newChecked: Record<string, boolean> = { ...form.luChecked, A: true, A302: true };
                    if (newChecked.A === form.luChecked.A && newChecked.A302 === form.luChecked.A302) return form;
                    changed = true;
                    return { ...form, luChecked: newChecked };
                }
                return form;
            });
            return changed ? next : prev;
        });
    }, [plotsLuRealData]);
    // (removed auto-collapse: expanded content stays visible when selecting status)

    const [carbonResults, setCarbonResults] = useState<CarbonResult[]>([]);
    const [backendResponses, setBackendResponses] = useState<EstimationResponse[] | null>(null);
    const [processingCarbon, setProcessingCarbon] = useState(false);
    const [carbonErr, setCarbonErr] = useState<string | null>(null);
    const [deleteConfirmIdx, setDeleteConfirmIdx] = useState<number | null>(null);

    const hasEmptyStatus = useMemo(() => {
        if (plotForms.length === 0) return true;
        return plotForms.some(f => !f.plantStatus);
    }, [plotForms]);


    const sortedPlotIndices = useMemo(() => {
        // Newest plot always goes first (reverse index order)
        return plots.map((_, idx) => idx).reverse();
    }, [plots]);
    // Initialize plotForms automatically when ready
    useEffect(() => {
        if (plots.length !== plotForms.length) {
            setPlotForms(prev => {
                if (plots.length > prev.length) {
                    const next = [...prev];
                    for (let i = next.length; i < plots.length; i++) {
                        const feat = parcelFeatures[i];
                        const props = feat?.properties as any || {};
                        const savedLU = props.luChecked;
                        const initialLU = (savedLU && typeof savedLU === 'object' && !Array.isArray(savedLU))
                            ? savedLU
                            : { A: true, A302: true };

                        // Restore plantStatus from saved data first, then infer from year as fallback
                        let initialStatus: "replanting" | "existing" | "" =
                            (props.plantStatus === "replanting" || props.plantStatus === "existing")
                                ? props.plantStatus
                                : "";
                        if (!initialStatus && props.plantYearBE) {
                            const yStr = String(props.plantYearBE);
                            if (NEW_YEAR_OPTIONS.includes(yStr)) {
                                initialStatus = "replanting";
                            } else if (OLD_YEAR_OPTIONS.includes(yStr)) {
                                initialStatus = "existing";
                            }
                        }

                        next.push({
                            plantStatus: initialStatus,
                            plantYear: props.plantYearBE ? String(props.plantYearBE) : "",
                            treeCount: props.trees ? String(props.trees) : "",
                            variety: props.variety || "",
                            spacing: props.spacing || "",
                            luChecked: { ...initialLU },
                        });
                    }
                    return next;
                } else {
                    return prev.slice(0, plots.length);
                }
            });
        }
    }, [plots, plotForms.length, parcelFeatures]);

    const handleProcessCarbon = async () => {
        if (isDuplicateProjectName) {
            setCarbonErr("ชื่อโครงการนี้ถูกใช้งานแล้ว กรุณาใช้ชื่ออื่น");
            return;
        }
        if (hasEmptyStatus) {
            setCarbonErr("กรุณากรอกสถานะแปลงให้ครบทุกแปลงก่อนทำการประมวลผล");
            return;
        }

        setCarbonErr(null);
        setProcessingCarbon(true);
        const CURRENT_BE_NOW = new Date().getFullYear() + 543;

        // Build polygons array for the estimateCarbon backend API call, one polygon per plot!
        const polygons: PlantationPolygon[] = [];
        const featuresToUse = luFeatures.length > 0 ? luFeatures : parcelFeatures;

        const allFeatsByPlot: Record<number, typeof featuresToUse> = {};
        for (let idx = 0; idx < parcelFeatures.length; idx++) {
            allFeatsByPlot[idx] = [];
        }

        featuresToUse.forEach(feat => {
            const props = (feat.properties ?? {}) as Record<string, unknown>;
            const plotIdxFromProp = props.plot_index !== undefined
                ? parseInt(String(props.plot_index), 10) - 1
                : -1;
            let matchedPlotIdx = 0;
            if (plotIdxFromProp >= 0 && plotIdxFromProp < parcelFeatures.length) {
                matchedPlotIdx = plotIdxFromProp;
            } else {
                const samplePoint = getSamplePoint(feat.geometry);
                for (let idx = 0; idx < parcelFeatures.length; idx++) {
                    if (isPointInGeometry(samplePoint, parcelFeatures[idx].geometry)) {
                        matchedPlotIdx = idx;
                        break;
                    }
                }
            }
            allFeatsByPlot[matchedPlotIdx].push(feat);
        });

        const featsByPlot: Record<number, typeof featuresToUse> = {};
        let hasAnyPolygons = false;

        for (let idx = 0; idx < parcelFeatures.length; idx++) {
            const form = plotForms[idx];
            const checkedClasses = new Set<string>();
            Object.entries(form?.luChecked || {}).forEach(([cls, on]) => { if (on) checkedClasses.add(cls); });

            const plotFeats = allFeatsByPlot[idx].filter(feat => {
                const luClass = ((feat.properties ?? {}) as Record<string, unknown>).lu_class as string | undefined;
                if (!luClass) return true; // include non-lu features as-is
                return checkedClasses.has(luClass) || luClass === "A302"; // Force A302 just in case
            });
            featsByPlot[idx] = plotFeats;
            // Count as valid if we have LU features OR can fall back to the drawn parcel
            if (plotFeats.length > 0 || !!parcelFeatures[idx]) hasAnyPolygons = true;
        }

        if (!hasAnyPolygons) {
            setCarbonErr("กรุณาเลือกพื้นที่อย่างน้อย 1 ประเภทการใช้ที่ดินในอย่างน้อย 1 แปลง");
            setProcessingCarbon(false);
            return;
        }

        // Now, for each plot `idx`, build its combined geometry and PlantationPolygon!
        for (let idx = 0; idx < parcelFeatures.length; idx++) {
            const plotFeats = featsByPlot[idx] || [];
            const form = plotForms[idx] || { plantYear: "", variety: "", treeCount: "", spacing: "2.5*8" };

            let combinedGeom: GeoJSON.Geometry;
            if (plotFeats.length === 0) {
                // No matching LU features (e.g. replanting on forest/misc land) — use drawn parcel geometry
                if (!parcelFeatures[idx]?.geometry) continue;
                combinedGeom = parcelFeatures[idx].geometry;
            } else {
                const allRings: GeoJSON.Position[][][] = [];
                for (const feat of plotFeats) {
                    const geom = feat.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon;
                    if (geom.type === "Polygon") allRings.push(geom.coordinates);
                    else if (geom.type === "MultiPolygon") allRings.push(...geom.coordinates);
                }
                combinedGeom = allRings.length === 1
                    ? { type: "Polygon", coordinates: allRings[0] }
                    : { type: "MultiPolygon", coordinates: allRings };
            }


            const backendYearBE = plots[idx]?.plantYearBE || 0;
            const userYearBE = form.plantYear ? parseInt(form.plantYear) : 0;

            const finalPlantYearBE = userYearBE > 0 ? userYearBE : (backendYearBE > 0 ? backendYearBE : 0);

            polygons.push({
                id: `plot-${idx}`,
                geometry: combinedGeom,
                year_of_planting: finalPlantYearBE > 0 ? finalPlantYearBE - 543 : null, // null = ให้ backend ดึงจาก raster
                rubber_clone: (form.variety && SUPPORTED_CLONES.includes(form.variety)) ? form.variety : null,
                tree_count: form.treeCount ? (parseInt(form.treeCount) || null) : null,
                spacing_system: form.spacing || null,
                selected_lu_classes: Object.entries(form?.luChecked || {})
                    .filter(([cls, on]) => on && (plotsLuRealData[idx]?.[cls]?.rai ?? 0) > 0)
                    .map(([cls]) => cls),
                project_type: form?.plantStatus || undefined,
            });
        }

        console.log("[CARBON] polygons payload:", JSON.stringify(polygons, null, 2));

        if (polygons.length === 0) {
            setCarbonErr("ไม่พบขอบเขตพื้นที่ที่สามารถประมวลผลได้");
            setProcessingCarbon(false);
            return;
        }

        // Warn and proceed if "existing" plots have no planting year — backend may still process
        const existingMissingYear = polygons.some(p => p.project_type === "existing" && !p.year_of_planting);
        if (existingMissingYear) {
            console.warn("[Carbon] Some existing plots have no planting year — backend may fail");
        }

        try {
            const responses = await estimateCarbon(polygons);
            console.log("[KeptCarbon] Backend responses:", JSON.stringify(responses, null, 2));

            // Check for errors in the responses (e.g., E04)
            const errResp = responses.find((r: any) => r.status?.status === "error");
            if (errResp) {
                throw new Error(`Backend API error: 200 ${JSON.stringify(errResp)}`);
            }

            setBackendResponses(responses);

            const results: CarbonResult[] = [];
            for (let idx = 0; idx < parcelFeatures.length; idx++) {
                const form = plotForms[idx] || { plantYear: "", variety: "", treeCount: "", spacing: "2.5*8", luChecked: {} };
                const plotFeats = featsByPlot[idx] || [];
                const totalAreaRai = plotFeats.reduce((s, f) => s + (((f.properties ?? {}) as Record<string, unknown>).area_m2 as number || 0) / 1600, 0);

                // --- Calculate real land use breakdown for this plot ---
                const totalPlotSelectedM2 = plotFeats.reduce((s, f) => s + (((f.properties ?? {}) as Record<string, unknown>).area_m2 as number || 0), 0);
                const totalPlotSelectedRai = totalPlotSelectedM2 / 1600;

                const classM2s: Record<string, number> = {};
                const classDescs: Record<string, string> = {};
                plotFeats.forEach(feat => {
                    const props = (feat.properties ?? {}) as Record<string, unknown>;
                    const luClass = props.lu_class as string || "M";
                    const luDesc = props.lu_class_desc_th as string | undefined;
                    classM2s[luClass] = (classM2s[luClass] || 0) + (props.area_m2 as number || 0);
                    if (luDesc && !classDescs[luClass]) classDescs[luClass] = luDesc;
                });

                const luBreakdown: Record<string, { rai: number; pct: number; desc: string }> = {};
                Object.entries(classM2s).forEach(([cls, m2]) => {
                    const rai = m2 / 1600;
                    const pct = totalPlotSelectedM2 > 0 ? (m2 / totalPlotSelectedM2) * 100 : 0;
                    luBreakdown[cls] = {
                        rai: Math.round(rai * 100) / 100,
                        pct: Math.round(pct * 10) / 10,
                        desc: cls.startsWith("A") && cls !== "A"
                            ? (classDescs[cls] || "")
                            : (LU_DESC_MAP[cls] || cls)
                    };
                });

                const backendYearBE = plots[idx]?.plantYearBE || 0;
                const userYearBE = form.plantYear ? parseInt(form.plantYear) : 0;

                // Find corresponding response by matching polygon ID
                const resp = responses.find(r => r.polygon_id === `plot-${idx}`);
                const profile = resp?.carbon_profile ?? [];

                let finalPlantYearBE = 0;
                let yearUsedDetails = "";

                if (userYearBE > 0) {
                    // 1. ผู้ใช้กรอกปีเอง — ใช้ก่อนเสมอ
                    finalPlantYearBE = userYearBE;
                    yearUsedDetails = `ใช้ตามที่คุณระบุ (พ.ศ. ${userYearBE})`;
                } else if (resp?.estimated_parameters) {
                    // 2. ไม่กรอกปี → ใช้ max cohort age (oldest cohort = year น้อยที่สุด) จาก carbon API
                    const yop = resp.estimated_parameters.year_of_planting;
                    const allYearsCE: number[] = [];
                    if (typeof yop.value === "number" && yop.value > 0) {
                        allYearsCE.push(yop.value);
                    } else if (Array.isArray(yop.value)) {
                        (yop.value as string[]).forEach(s => {
                            const m = String(s).match(/^(\d{4})/);
                            if (m) allYearsCE.push(parseInt(m[1]));
                        });
                    }
                    if (allYearsCE.length > 0) {
                        const oldestYearCE = Math.min(...allYearsCE); // oldest cohort = max age
                        finalPlantYearBE = oldestYearCE + 543;
                        yearUsedDetails = `ใช้ปีจากระบบประมาณการ (พ.ศ. ${finalPlantYearBE})`;
                    }
                }

                // 3. Fallback: ปีจาก parcel API ถ้า estimated_parameters ไม่มี
                if (finalPlantYearBE === 0 && backendYearBE > 0) {
                    finalPlantYearBE = backendYearBE;
                    yearUsedDetails = `ใช้ปีจากดาวเทียมที่ตรวจพบ (พ.ศ. ${backendYearBE})`;
                }

                let startAge = finalPlantYearBE > 0 ? CURRENT_BE_NOW - finalPlantYearBE : 0;

                // 4. Fallback: อายุจาก profile โดยตรง ถ้ายังเป็น 0
                if (startAge === 0 && profile.length > 0) {
                    const profileAge = profile[0].age;
                    if (profileAge != null && !isNaN(profileAge)) {
                        startAge = profileAge;
                        if (finalPlantYearBE === 0) {
                            finalPlantYearBE = CURRENT_BE_NOW - startAge;
                            yearUsedDetails = `ใช้ปีจากข้อมูลหลังบ้าน (พ.ศ. ${finalPlantYearBE})`;
                        }
                    }
                }

                if (startAge === 0 && finalPlantYearBE === 0) {
                    startAge = 1;
                }
                const userTrees = form.treeCount ? parseInt(form.treeCount) : 0;
                const epTrees = typeof resp?.estimated_parameters?.tree_count?.value === "number" ? resp.estimated_parameters.tree_count.value : 0;
                const finalTrees = userTrees > 0 ? userTrees : (epTrees > 0 ? epTrees : Math.round(totalAreaRai * 76));
                const co2Now = profile[0]?.stocks?.value ?? 0;
                const co2NowCi = profile[0]?.stocks?.ci ?? 0;

                results.push({
                    plotIdx: idx,
                    age: startAge,
                    plantYearBE: finalPlantYearBE,
                    trees: finalTrees,
                    spacing: form.spacing,
                    variety: form.variety,
                    co2Now,
                    co2NowCi,
                    source: "backend" as const,
                    yearUsedDetails,
                    selectedAreaRai: totalPlotSelectedRai,
                    luBreakdown
                });
            }

            setCarbonResults(results);
            setExpandedResultIdx("total");
            if (onMapPlotSelected) onMapPlotSelected("total");
            onStepChange(3);
        } catch (err) {
            setCarbonErr(getFriendlyErrorMessage(err, plots, plotForms));
        } finally {
            setProcessingCarbon(false);
        }
    };


    // Removed: if (!(searchRunning || searchErr || searchCount !== null)) return null;

    const handleSave = async (overrideResults?: CarbonResult[]) => {
        if (isDuplicateProjectName) {
            setCarbonErr("ชื่อโครงการนี้ถูกใช้งานแล้ว กรุณาใช้ชื่ออื่น");
            return;
        }
        const resultsToSave = overrideResults || carbonResults;
        const hasCarbonResults = resultsToSave.length > 0;

        setSaveState("saving");

        await new Promise(r => setTimeout(r, 900));
        try {
            if (!user) return;
            const CURRENT_BE_NOW = new Date().getFullYear() + 543;
            const newPlots = plots.map((p, i) => {
                const feat = parcelFeatures[i];
                const props = (feat?.properties || {}) as any;
                const cr = resultsToSave[i];
                const form = plotForms[i];

                const userPlantYear = form?.plantYear ? parseInt(form.plantYear) : 0;
                const userTrees = form?.treeCount ? parseInt(form.treeCount) : 0;

                const backendResp = backendResponses?.find(r => r.polygon_id === `plot-${i}`);
                const ep = backendResp?.estimated_parameters;

                const epPlantYearCE = typeof ep?.year_of_planting?.value === "number" ? ep.year_of_planting.value : 0;
                const epPlantYearBE = epPlantYearCE > 0 ? epPlantYearCE + 543 : 0;
                const epTrees = typeof ep?.tree_count?.value === "number" ? ep.tree_count.value : 0;

                const age = cr?.age ?? (userPlantYear > 0 ? (CURRENT_BE_NOW - userPlantYear) : (epPlantYearBE > 0 ? (CURRENT_BE_NOW - epPlantYearBE) : 0));
                const trees = cr?.trees ?? (userTrees > 0 ? userTrees : (epTrees > 0 ? epTrees : 0));
                const finalPlantYear = cr?.plantYearBE ?? (userPlantYear > 0 ? userPlantYear : epPlantYearBE);

                // If saved directly without processing, set carbon to 0
                const co2 = hasCarbonResults ? (cr?.co2Now ?? 0) : 0;

                // Use backend estimated_parameters to fill missing variety/spacing when user didn't fill form
                const epVariety = typeof ep?.rubber_clone?.value === "string" ? ep.rubber_clone.value : "";
                const epSpacingRaw = typeof ep?.spacing_system?.value === "string" ? ep.spacing_system.value : "";
                const epSpacing = epSpacingRaw.replace(/\s*\([^)]*\)/, "").trim(); // "2.5x8 (default)" → "2.5x8"

                const variety = form?.variety || cr?.variety || epVariety;
                const spacing = cr?.spacing || form?.spacing || epSpacing;

                // Save backend profile as BarPoint[] so my-plots can render the exact same chart
                // Only include carbonProfile when we actually have carbon results (Step 3 processing)
                const rawProfile = backendResp?.carbon_profile ?? [];
                const carbonProfile = hasCarbonResults && rawProfile.length > 0 ? profileToBarPoints(rawProfile, age) : null;

                return {
                    id: props.id || Math.random().toString(36).substring(7),
                    userId: user.id,
                    name: projectName || props.farm_name || "แปลงยางใหม่",
                    areaRai: p.areaRai,
                    carbonTotal: co2,
                    rubberAge: age,
                    plantYearBE: finalPlantYear,
                    trees,
                    variety,
                    spacing,
                    luChecked: form?.luChecked || { A: true, A302: true },
                    plantStatus: form?.plantStatus || "",
                    confidence: p.confidence,
                    ownerName: ownerName || props.owner_name || "",
                    province: province || dominantProvince,
                    date: new Date().toISOString(),
                    geojson: feat?.geometry || null,
                    boundaryGeojson: drawnGeometry || null,
                    carbonProfile,
                    processed: hasCarbonResults,
                    forecast: hasCarbonResults ? {
                        yr3: carbonCo2(age + 3, trees, spacing),
                        yr5: carbonCo2(age + 5, trees, spacing),
                        yr7: carbonCo2(age + 7, trees, spacing),
                    } : { yr3: 0, yr5: 0, yr7: 0 },
                    backendData: {
                        plantYearBE: epPlantYearBE,
                        age: epPlantYearBE > 0 ? (CURRENT_BE_NOW - epPlantYearBE) : 0,
                        variety: epVariety,
                        spacing: epSpacing,
                        trees: epTrees,
                        ep: ep || null,
                        form: form || null
                    }
                };
            });
            const newPlotsWithStatus = newPlots.filter(p => p.plantStatus);
            if (newPlotsWithStatus.length === 0) {
                setCarbonErr("กรุณาเลือกสถานะแปลงอย่างน้อย 1 แปลงก่อนบันทึก");
                setSaveState("idle");
                return;
            }
            await fetch("/api/plots", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ plots: newPlotsWithStatus }),
            });
        } catch (e) { console.error(e); }
        setSaveState("done");
        setTimeout(() => setSaveState("idle"), 2000);
    };


    // ── Loading ────────────────────────────────────────────────────────────
    if (searchRunning) {
        return (
            <div className="prp-shell">
                <div className="s1-results-loading">
                    <div className="s1-spin" />
                    <span>กำลังค้นหาแปลงที่ทับซ้อน...</span>
                </div>
                {onCancel && (
                    <button onClick={onCancel} style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 6, padding: "6px 16px", borderRadius: 8, border: "1px solid #dc3545", background: "transparent", color: "#dc3545", fontSize: 13, cursor: "pointer", fontWeight: 500, margin: "16px auto 0" }}>
                        <i className="bi bi-x-circle" /> ยกเลิกการประมวลผล
                    </button>
                )}
            </div>
        );
    }

    // ── Error ──────────────────────────────────────────────────────────────
    if (searchErr) {
        return (
            <div className="prp-shell">
                <div className="s1-results-error">
                    <i className="bi bi-exclamation-triangle me-2" />{searchErr}
                </div>
                {onReset && (
                    <button className="mds-btn mds-btn-soft" style={{ marginTop: 12 }} onClick={onReset}>
                        <i className="bi bi-arrow-left me-1" /> กลับขั้นตอนที่ 1
                    </button>
                )}
            </div>
        );
    }

    // Removed: if (searchCount === null) return null;

    // ── Step 2: Data entry form ────────────────────────────────
    if (currentStep === 2) {
        const updateForm = (idx: number, field: keyof PlotFormData, val: string) => {
            setPlotForms(prev => prev.map((f, i) => i === idx ? { ...f, [field]: val } : f));
        };
        return (
            <div className="prp-shell">


                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
                    <div className="prp-header-block" style={{ marginBottom: 0 }}>
                        <div className="prp-main-title" style={{ fontSize: isMobile ? 16 : 18 }}>
                            <i className="bi bi-pencil-square me-2" style={{ color: "#10b981" }} />
                            {projectName?.trim() ? `โครงการ ${projectName}` : "กรอกข้อมูลแปลง"}
                        </div>
                        <div className="prp-subtitle">เพื่อนำไปประเมินคาร์บอนเครดิต</div>
                    </div>
                </div>

                {/* Action buttons (Moved to top) */}
                {carbonErr && (
                    <div style={{
                        marginBottom: 16,
                        padding: "14px 16px",
                        background: "linear-gradient(135deg, #fef2f2, #fff5f5)",
                        border: "1px solid #fecaca",
                        borderRadius: 14,
                        fontSize: 13,
                        color: "#991b1b",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 10,
                        boxShadow: "0 2px 8px rgba(220,38,38,0.06)",
                        animation: "slideInUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards"
                    }}>
                        <div style={{
                            width: 28, height: 28, borderRadius: 8,
                            background: "rgba(220,38,38,0.1)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            flexShrink: 0, marginTop: 1
                        }}>
                            <i className="bi bi-exclamation-triangle-fill" style={{ fontSize: 14, color: "#dc2626" }} />
                        </div>
                        <div style={{ flex: 1, lineHeight: 1.6 }}>
                            <div style={{ fontWeight: 700, marginBottom: 2 }}>ไม่สามารถประมวลผลคาร์บอนได้</div>
                            <span style={{ color: "#b91c1c", opacity: 0.9 }}>{carbonErr}</span>
                        </div>
                        <button
                            onClick={() => setCarbonErr(null)}
                            style={{
                                background: "rgba(220,38,38,0.06)",
                                border: "none",
                                borderRadius: 6,
                                width: 24, height: 24,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                cursor: "pointer", flexShrink: 0, marginTop: 1,
                                color: "#991b1b", fontSize: 13,
                                padding: 0, lineHeight: 1
                            }}
                            title="ปิด"
                        >
                            <i className="bi bi-x" />
                        </button>
                    </div>
                )}
                {user && isDuplicateProjectName && (
                    <div style={{
                        marginBottom: 16,
                        padding: "10px 14px",
                        background: "rgba(220,38,38,0.06)",
                        border: "1px solid rgba(220,38,38,0.2)",
                        borderRadius: 10,
                        fontSize: 12,
                        color: "#dc2626",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontWeight: 600
                    }}>
                        <i className="bi bi-exclamation-triangle-fill" style={{ flexShrink: 0, color: "#dc2626" }} />
                        <span>ชื่อโครงการนี้ถูกใช้งานแล้ว กรุณาใช้ชื่ออื่น</span>
                    </div>
                )}
                {!(user && isDuplicateProjectName) && ((user && !projectName.trim()) || hasEmptyStatus) && (
                    <div style={{
                        marginBottom: 16,
                        padding: "10px 14px",
                        background: "rgba(249,115,22,0.06)",
                        border: "1px solid rgba(249,115,22,0.2)",
                        borderRadius: 10,
                        fontSize: 12,
                        color: "#c2410c",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontWeight: 600
                    }}>
                        <i className="bi bi-exclamation-circle-fill" style={{ flexShrink: 0 }} />
                        <span>
                            {(user && !projectName.trim()) && hasEmptyStatus
                                ? 'กรุณากรอก "ชื่อโครงการ" และเลือก "สถานะแปลง" ให้ครบทุกแปลง เพื่อประมวลผลหรือบันทึกข้อมูล'
                                : (user && !projectName.trim())
                                    ? 'กรุณากรอก "ชื่อโครงการ" เพื่อประมวลผลหรือบันทึกข้อมูล'
                                    : 'กรุณาเลือก "สถานะแปลง" ให้ครบทุกแปลง เพื่อประมวลผลหรือบันทึกข้อมูล'
                            }
                        </span>
                    </div>
                )}
                <div style={{ display: "flex", gap: isMobile ? 6 : 8, marginBottom: 16, flexWrap: "wrap", justifyContent: "stretch" }}>
                    {onDrawMore && !isDrawing && (
                        <button className="prp-btn-ghost" style={{ flex: "1 1 calc(33% - 8px)", minWidth: 100, padding: isMobile ? "8px 6px" : "10px 12px", fontSize: isMobile ? 12 : 14, display: "flex", flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6, background: "rgba(16,185,129,0.1)", color: "#059669", border: "1px solid rgba(16,185,129,0.2)", borderRadius: isMobile ? 10 : 12 }} onClick={onDrawMore}>
                            <i className="bi bi-pencil-square" style={{ fontSize: isMobile ? 14 : 16 }} /> <span style={{ fontWeight: 600, textAlign: "center", whiteSpace: "nowrap" }}>วาดแปลงเพิ่ม</span>
                        </button>
                    )}
                    {onCancelDraw && isDrawing && (
                        <button className="prp-btn-ghost" style={{ flex: "1 1 calc(33% - 8px)", minWidth: 100, padding: isMobile ? "8px 6px" : "10px 12px", fontSize: isMobile ? 12 : 14, display: "flex", flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6, background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)", borderRadius: isMobile ? 10 : 12 }} onClick={onCancelDraw}>
                            <i className="bi bi-x-circle" style={{ fontSize: isMobile ? 14 : 16 }} /> <span style={{ fontWeight: 600, textAlign: "center", whiteSpace: "nowrap" }}>ยกเลิกการวาด</span>
                        </button>
                    )}
                    <button
                        className="prp-btn-primary"
                        onClick={() => handleSave([])}
                        disabled={!user || !projectName.trim() || isDuplicateProjectName || saveState === "saving"}
                        style={{
                            flex: "1 1 calc(33% - 8px)", minWidth: 110, padding: isMobile ? "8px 6px" : "10px 12px", fontSize: isMobile ? 12 : 14, display: "flex", flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6,
                            background: !user ? "#cbd5e1" : (saveState === "done" ? "#94a3b8" : ((projectName.trim() && !isDuplicateProjectName && !hasEmptyStatus) ? "linear-gradient(135deg,#0ea5e9,#0284c7)" : "#cbd5e1")),
                            color: "#fff", border: "none", borderRadius: isMobile ? 10 : 12,
                            cursor: !user ? "not-allowed" : (saveState !== "idle" ? "not-allowed" : ((projectName.trim() && !isDuplicateProjectName && !hasEmptyStatus) ? "pointer" : "not-allowed")),
                            boxShadow: !user ? "none" : (saveState === "done" ? "none" : ((projectName.trim() && !isDuplicateProjectName && !hasEmptyStatus) ? "0 4px 10px rgba(2,132,199,0.2)" : "none")),
                            opacity: !user ? 0.5 : (saveState === "done" ? 0.6 : 1),
                            transition: "all 0.3s"
                        }}
                    >
                        {saveState === "saving" ? (
                            <><span className="s1-spin" style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff" }} /> <span style={{ fontWeight: 600, textAlign: "center", whiteSpace: "nowrap" }}>บันทึก...</span></>
                        ) : saveState === "done" ? (
                            <><i className="bi bi-check-circle-fill" style={{ fontSize: isMobile ? 14 : 16 }} /> <span style={{ fontWeight: 600, textAlign: "center", whiteSpace: "nowrap" }}>บันทึกแล้ว</span></>
                        ) : (
                            <><i className="bi bi-save" style={{ fontSize: isMobile ? 14 : 16 }} /> <span style={{ fontWeight: 600, textAlign: "center", whiteSpace: "nowrap" }}>บันทึกข้อมูล</span></>
                        )}
                    </button>
                    <button
                        className="prp-btn-primary"
                        onClick={() => { void handleProcessCarbon(); }}
                        disabled={(!!user && (!projectName.trim() || isDuplicateProjectName)) || hasEmptyStatus || processingCarbon}
                        style={{
                            flex: "1 1 calc(33% - 8px)", minWidth: 110, padding: isMobile ? "8px 6px" : "10px 12px", fontSize: isMobile ? 12 : 14, display: "flex", flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6,
                            background: ((!user || (projectName.trim() && !isDuplicateProjectName)) && !hasEmptyStatus && !processingCarbon) ? "linear-gradient(135deg,#10b981,#059669)" : "#cbd5e1",
                            color: "#fff", border: "none", borderRadius: isMobile ? 10 : 12,
                            cursor: ((!user || (projectName.trim() && !isDuplicateProjectName)) && !hasEmptyStatus && !processingCarbon) ? "pointer" : "not-allowed",
                            boxShadow: ((!user || (projectName.trim() && !isDuplicateProjectName)) && !hasEmptyStatus && !processingCarbon) ? "0 4px 10px rgba(16,185,129,0.2)" : "none"
                        }}
                    >
                        {processingCarbon ? (
                            <><span className="s1-spin" style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff" }} /> <span style={{ fontWeight: 600, textAlign: "center", whiteSpace: "nowrap" }}>ประมวลผล</span></>
                        ) : (
                            <><i className="bi bi-graph-up-arrow" style={{ fontSize: isMobile ? 14 : 16 }} /> <span style={{ fontWeight: 600, textAlign: "center", whiteSpace: "nowrap" }}>ประมวลผล</span></>
                        )}
                    </button>
                </div>

                {/* Warning: no LU selected for a plot that has detected data */}
                {plotForms.some((form, idx) => {
                    if (!form.plantStatus) return false;
                    const plotLU = plotsLuRealData[idx] || {};
                    const hasDetected = Object.values(plotLU).some(v => v.rai > 0);
                    if (!hasDetected) return false;
                    // Exclude "A" (parent category, always auto-checked) — only count actual leaf LU classes
                    return Object.entries(form.luChecked || {})
                        .filter(([cls, on]) => cls !== "A" && on && (plotLU[cls]?.rai ?? 0) > 0).length === 0;
                }) && (
                        <div style={{
                            marginBottom: 12, padding: "8px 12px",
                            background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.35)",
                            borderRadius: 10, display: "flex", alignItems: "center", gap: 8,
                            fontSize: 12, color: "#92400e", fontWeight: 600
                        }}>
                            <i className="bi bi-exclamation-triangle-fill" style={{ color: "#f59e0b", flexShrink: 0 }} />
                            <span>กรุณาเลือกประเภทการใช้ที่ดินอย่างน้อย 1 ประเภทในแต่ละแปลงก่อนประมวลผล</span>
                        </div>
                    )}



                {/* Summary of drawn parcels */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, padding: "0 4px" }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#475569" }}>
                        แปลงที่วาดแล้ว
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#10b981" }}>
                        {totalArea.toFixed(2)} ไร่
                    </div>
                </div>

                {/* Per-plot fields */}
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {sortedPlotIndices.map((i) => {
                        const p = plots[i];
                        const form = plotForms[i] || { plantYear: "", treeCount: "", variety: "", spacing: "2.5*8" };
                        return (
                            <div key={i} style={{ background: "#fff", borderRadius: 14, border: "1px solid rgba(16,185,129,0.15)", overflow: "hidden", boxShadow: "0 2px 10px rgba(0,0,0,0.04)" }}>
                                {/* Plot header */}
                                <div
                                    onClick={() => {
                                        setExpandedIdx(expandedIdx === i ? null : i);
                                        if (parcelFeatures[i]) {
                                            onFlyTo(parcelFeatures[i]);
                                            onMapPlotSelected?.(i);
                                            const allChecked: Record<number, Record<string, boolean>> = {};
                                            plotForms.forEach((f, idx) => { allChecked[idx] = f.luChecked; });
                                            onLandUseChange?.(allChecked, i);
                                        }
                                    }}
                                    style={{
                                        background: "linear-gradient(135deg,rgba(16,185,129,0.08),rgba(5,150,105,0.04))",
                                        padding: "10px 14px",
                                        borderBottom: "none",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 10,
                                        cursor: "pointer",
                                        userSelect: "none"
                                    }}
                                >
                                    <div style={{ pointerEvents: 'none', width: 28, height: 28, borderRadius: 8, background: "#10b981", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13 }}>{i + 1}</div>
                                    <div style={{ pointerEvents: 'none', flex: 1 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a" }}>แปลงที่ {i + 1}</div>
                                        </div>
                                        {p.areaRai > 0 && (
                                            <div style={{ fontSize: 13, color: "#64748b" }}>{p.areaRai.toFixed(2)} ไร่</div>
                                        )}
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setDeleteConfirmIdx(i); }}
                                            style={{ border: "none", background: "none", color: "#94a3b8", cursor: "pointer", fontSize: 16, padding: 4 }}
                                        >
                                            <i className="bi bi-trash" />
                                        </button>
                                        <span className={`bi bi-chevron-${expandedIdx === i ? 'up' : 'down'}`} style={{ pointerEvents: 'none', color: "#64748b", fontSize: 14 }} />
                                    </div>
                                </div>
                                {expandedIdx === i && (
                                    <>
                                        {/* Status Selection */}
                                        <div style={{ padding: isMobile ? "16px 16px 0" : "20px 24px 0", background: "#fff" }}>
                                            <div style={{ fontSize: 15, fontWeight: 700, color: "#1e293b", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                                                <i className="bi bi-info-circle" style={{ color: "#10b981" }} /> สถานะแปลง <span style={{ color: "#ef4444" }}>*</span>
                                            </div>
                                            <div style={{ display: "flex", gap: 16 }}>
                                                <div onClick={() => {
                                                    setPlotForms(prev => prev.map((f, idx) => idx === i ? {
                                                        ...f,
                                                        plantStatus: "replanting",
                                                        plantYear: String(CURRENT_BE),
                                                        luChecked: { A: true, A302: true },
                                                    } : f));
                                                    onProjectTypeChange?.("replanting");
                                                }} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 15, cursor: "pointer", userSelect: "none" }}>
                                                    <div style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid", borderColor: form.plantStatus === "replanting" ? "#10b981" : "#cbd5e1", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.2s" }}>
                                                        {form.plantStatus === "replanting" && <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#10b981" }} />}
                                                    </div>
                                                    เริ่มปลูกใหม่
                                                </div>
                                                <div onClick={() => {
                                                    // Auto-check A sub-types and F detected by backend for existing plots
                                                    setPlotForms(prev => prev.map((f, idx) => idx === i ? {
                                                        ...f,
                                                        plantStatus: "existing",
                                                        plantYear: "",
                                                        luChecked: { A: true, A302: true },
                                                    } : f));
                                                    onProjectTypeChange?.("existing");
                                                }} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 15, cursor: "pointer", userSelect: "none" }}>
                                                    <div style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid", borderColor: form.plantStatus === "existing" ? "#10b981" : "#cbd5e1", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.2s" }}>
                                                        {form.plantStatus === "existing" && <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#10b981" }} />}
                                                    </div>
                                                    ปลูกมาแล้ว
                                                </div>
                                            </div>
                                            {!form.plantStatus && (
                                                <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 8, display: "flex", alignItems: "center", gap: 4 }}>
                                                    <i className="bi bi-exclamation-circle-fill" /> กรุณาเลือกสถานะแปลงก่อนจึงจะกรอกข้อมูลด้านล่างได้
                                                </div>
                                            )}
                                        </div>

                                        {/* Fields grid */}
                                        <div style={{
                                            position: "relative",
                                            opacity: form.plantStatus ? 1 : 0.4,
                                            transition: "opacity 0.3s",
                                            pointerEvents: form.plantStatus ? "auto" : "none",
                                        }}>
                                            {!form.plantStatus && (
                                                <div style={{
                                                    position: "absolute", inset: 0, background: "rgba(248,250,252,0.6)",
                                                    zIndex: 5, borderRadius: 8,
                                                    display: "flex", alignItems: "center", justifyContent: "center",
                                                    fontSize: 12, color: "#94a3b8", gap: 6
                                                }}>
                                                    <i className="bi bi-lock-fill" /> รอเลือกสถานะแปลงก่อน
                                                </div>
                                            )}
                                            <div style={{
                                                display: "grid",
                                                gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                                                gap: "16px 20px",
                                                padding: isMobile ? "16px" : "20px 24px",
                                                background: "#fff"
                                            }}>
                                                <div className="prp-field-group">
                                                    <div style={{ fontSize: 15, fontWeight: 700, color: "#1e293b", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                                                        <i className="bi bi-calendar-event" style={{ color: "#10b981" }} /> ปีที่ปลูก (พ.ศ.)
                                                    </div>
                                                    <select
                                                        className="prp-input"
                                                        style={{ marginBottom: 0, height: 46, borderRadius: 10, border: "1.5px solid #e2e8f0", padding: "0 12px" }}
                                                        value={form.plantYear}
                                                        onChange={e => updateForm(i, "plantYear", e.target.value)}
                                                        disabled={!form.plantStatus}
                                                    >
                                                        <option value="">— เลือกปีที่ปลูก —</option>
                                                        {(form.plantStatus === "replanting" ? NEW_YEAR_OPTIONS : form.plantStatus === "existing" ? OLD_YEAR_OPTIONS : []).map(y => <option key={y} value={y}>{y}</option>)}
                                                    </select>
                                                </div>
                                                <div className="prp-field-group">
                                                    <div style={{ fontSize: 15, fontWeight: 700, color: "#1e293b", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                                                        <i className="bi bi-tags" style={{ color: "#10b981" }} /> พันธุ์ยาง
                                                    </div>
                                                    <select
                                                        className="prp-input"
                                                        style={{ marginBottom: 0, height: 46, borderRadius: 10, border: "1.5px solid #e2e8f0", padding: "0 12px" }}
                                                        value={form.variety}
                                                        onChange={e => updateForm(i, "variety", e.target.value)}
                                                        disabled={!form.plantStatus}
                                                    >
                                                        <option value="">— เลือกสายพันธุ์ยาง —</option>
                                                        {VARIETY_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                                                    </select>
                                                </div>
                                                <div className="prp-field-group">
                                                    <div style={{ fontSize: 15, fontWeight: 700, color: "#1e293b", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                                                        <i className="bi bi-tree" style={{ color: "#10b981" }} /> จำนวนต้นยาง
                                                    </div>
                                                    <input
                                                        className="prp-input"
                                                        style={{ marginBottom: 0, height: 46, borderRadius: 10, border: "1.5px solid #e2e8f0", padding: "0 12px" }}
                                                        type="number"
                                                        placeholder="ระบุจำนวนต้น เช่น 70"
                                                        value={form.treeCount}
                                                        onChange={e => updateForm(i, "treeCount", e.target.value)}
                                                        disabled={!form.plantStatus}
                                                    />
                                                </div>
                                                <div className="prp-field-group">
                                                    <div style={{ fontSize: 15, fontWeight: 700, color: "#1e293b", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                                                        <i className="bi bi-arrows-expand" style={{ color: "#10b981" }} /> ระยะปลูก (ม.)
                                                    </div>
                                                    <select
                                                        className="prp-input"
                                                        style={{ marginBottom: 0, height: 46, borderRadius: 10, border: "1.5px solid #e2e8f0", padding: "0 12px" }}
                                                        value={form.spacing}
                                                        onChange={e => updateForm(i, "spacing", e.target.value)}
                                                        disabled={!form.plantStatus}
                                                    >
                                                        <option value="">— เลือกระยะปลูก —</option>
                                                        {SPACING_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                                                    </select>
                                                </div>
                                            </div>

                                            {/* Land Use Checkboxes */}
                                            <div style={{ padding: isMobile ? "0 16px 16px" : "0 24px 20px", background: "#fff" }}>
                                                <div style={{ fontSize: 15, fontWeight: 700, color: "#1e293b", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                                                    <i className="bi bi-layers" style={{ color: "#10b981" }} /> ชั้นข้อมูลการใช้ประโยชน์ที่ดิน (กรมพัฒนาที่ดิน)
                                                </div>
                                                <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 14 }}>
                                                    {(() => {
                                                        const plotLUData = plotsLuRealData[i] || {};
                                                        const isNew = form.plantStatus === "replanting";
                                                        const isOld = form.plantStatus === "existing";

                                                        // Behavior differs by plantStatus:
                                                        // replanting: A, M, W, F, A-sub checkable (U displayOnly, A302 fixed)
                                                        // existing:   A fixed, F checkable, A-sub checkable (U,W,M displayOnly, A302 fixed)
                                                        const baseLU = [
                                                            { id: "U", label: "U พื้นที่ชุมชนและสิ่งปลูกสร้าง", color: "#ef4444", displayOnly: true },
                                                            { id: "A", label: "A พื้นที่เกษตรกรรม", color: "#84cc16", fixed: true },
                                                            { id: "F", label: "F พื้นที่ป่าไม้", color: "#166534" },
                                                            ...(isNew
                                                                ? [{ id: "W", label: "W แหล่งน้ำ", color: "#3b82f6" }]
                                                                : [{ id: "W", label: "W แหล่งน้ำ", color: "#3b82f6", displayOnly: true }]
                                                            ),
                                                            ...(isNew
                                                                ? [{ id: "M", label: "M พื้นที่เบ็ดเตล็ด", color: "#9ca3af" }]
                                                                : [{ id: "M", label: "M พื้นที่เบ็ดเตล็ด", color: "#9ca3af", displayOnly: true }]
                                                            ),
                                                        ];
                                                        const displayLU: any[] = [];
                                                        baseLU.forEach(base => {
                                                            // Only show types that were detected by the API
                                                            const hasBase = plotLUData[base.id] && plotLUData[base.id].rai > 0;
                                                            if (!hasBase) return;
                                                            displayLU.push({ ...base });

                                                            if (base.id === "A") {
                                                                const aSubtypes = Object.keys(plotLUData).filter(k => k.startsWith("A") && k !== "A").sort();
                                                                aSubtypes.forEach(sub => {
                                                                    const realSubData = plotLUData[sub];
                                                                    if (realSubData && realSubData.rai > 0) {
                                                                        const desc = realSubData.desc || "";
                                                                        const isA302 = sub === "A302";
                                                                        displayLU.push({
                                                                            id: sub,
                                                                            label: desc ? `${sub} ${desc}` : sub,
                                                                            fixed: isA302,
                                                                            indent: true,
                                                                            color: "#84cc16"
                                                                        });
                                                                    }
                                                                });
                                                            }
                                                        });

                                                        if (displayLU.length === 0) {
                                                            return <div style={{ color: "#94a3b8", fontSize: 12 }}>ไม่พบข้อมูลการใช้ประโยชน์ที่ดินในแปลงนี้</div>;
                                                        }

                                                        return displayLU.map(lu => {
                                                            const isDisabled = !form.plantStatus || lu.fixed || lu.displayOnly;
                                                            const isChecked = lu.fixed ? true : (lu.displayOnly ? false : (form.luChecked?.[lu.id] || false));
                                                            const realData = plotLUData[lu.id];
                                                            const hasArea = realData && realData.rai > 0;
                                                            return (
                                                                <label key={lu.id} style={{
                                                                    display: "flex", alignItems: "center", gap: 8,
                                                                    cursor: isDisabled ? "not-allowed" : "pointer",
                                                                    paddingLeft: lu.indent ? 24 : 0
                                                                }}>
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={isChecked}
                                                                        disabled={isDisabled}
                                                                        style={{ accentColor: isChecked ? lu.color : "#94a3b8", width: 16, height: 16 }}
                                                                        onChange={(e) => {
                                                                            const newChecked = { ...form.luChecked, [lu.id]: e.target.checked };
                                                                            setPlotForms(prev => {
                                                                                const updated = prev.map((f, idx) => idx === i ? { ...f, luChecked: newChecked } : f);
                                                                                const allChecked: Record<number, Record<string, boolean>> = {};
                                                                                updated.forEach((f, idx) => { allChecked[idx] = f.luChecked; });
                                                                                setTimeout(() => onLandUseChange?.(allChecked, i), 0);
                                                                                return updated;
                                                                            });
                                                                        }}
                                                                    />
                                                                    <div style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: lu.color, flexShrink: 0 }} />
                                                                    <span style={{ flex: 1, color: "#0f172a", fontWeight: isChecked ? 600 : 400 }}>{lu.label}</span>
                                                                    <span style={{ color: isChecked ? lu.color : "#64748b", fontSize: 14, fontWeight: 700 }}>
                                                                        {hasArea ? `${realData.rai.toFixed(2)} ไร่` : "0.00 ไร่"}
                                                                        {hasArea && (
                                                                            <span style={{ opacity: 0.7, fontSize: 13 }}> ({realData.pct}%)</span>
                                                                        )}
                                                                    </span>
                                                                </label>
                                                            );
                                                        });
                                                    })()}
                                                </div>
                                                {/* Selected area summary */}
                                                {(() => {
                                                    const plotLUData = plotsLuRealData[i] || {};
                                                    const activeLeafIds: string[] = [];

                                                    const allFormKeys = Object.keys(form.luChecked || {});
                                                    const allDataKeys = Object.keys(plotLUData);
                                                    const allKeys = new Set([...allDataKeys, ...allFormKeys]);

                                                    allKeys.forEach(k => {
                                                        if (k === "A") return;
                                                        const isSubA = k.startsWith("A") && k !== "A";
                                                        const isTopLevel = !k.startsWith("A");

                                                        if (isSubA) {
                                                            const isChecked = k === "A302" || !!form.luChecked?.[k];
                                                            if (isChecked) activeLeafIds.push(k);
                                                        } else if (isTopLevel) {
                                                            const isChecked = !!form.luChecked?.[k];
                                                            if (isChecked) activeLeafIds.push(k);
                                                        }
                                                    });

                                                    const hasCheckedA = activeLeafIds.some(id => id.startsWith("A"));
                                                    if (!hasCheckedA && plotLUData["A"]) {
                                                        activeLeafIds.push("A");
                                                    }

                                                    const selectedRai = activeLeafIds.reduce((sum, cls) => {
                                                        const realRai = plotLUData[cls]?.rai || 0;
                                                        return sum + realRai;
                                                    }, 0);

                                                    const hasAnyDetected = Object.values(plotLUData).some(v => v.rai > 0);
                                                    // Exclude "A" (parent, always auto-checked) — only count actual leaf LU classes
                                                    const effectiveCount = Object.entries(form.luChecked || {})
                                                        .filter(([cls, on]) => cls !== "A" && on && (plotLUData[cls]?.rai ?? 0) > 0).length;
                                                    const showNoLuWarning = form.plantStatus && hasAnyDetected && effectiveCount === 0;

                                                    return selectedRai > 0 ? (
                                                        <div style={{ marginTop: 12, padding: "8px 12px", background: "rgba(249,115,22,0.08)", borderRadius: 8, border: "1px solid rgba(249,115,22,0.2)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                                            <span style={{ fontSize: 14, color: "#92400e", fontWeight: 600 }}>
                                                                <i className="bi bi-check2-square me-1" /> พื้นที่ที่เลือก
                                                            </span>
                                                            <span style={{ fontSize: 15, color: "#c2410c", fontWeight: 700 }}>
                                                                {selectedRai.toFixed(2)} ไร่
                                                            </span>
                                                        </div>
                                                    ) : showNoLuWarning ? (
                                                        <div style={{ marginTop: 12, padding: "8px 12px", background: "rgba(239,68,68,0.08)", borderRadius: 8, border: "1px solid rgba(239,68,68,0.25)", display: "flex", alignItems: "center", gap: 8 }}>
                                                            <i className="bi bi-exclamation-triangle-fill" style={{ color: "#dc2626", fontSize: 13, flexShrink: 0 }} />
                                                            <span style={{ fontSize: 12, color: "#dc2626", fontWeight: 600 }}>กรุณาเลือกประเภทการใช้ที่ดินอย่างน้อย 1 ประเภท</span>
                                                        </div>
                                                    ) : null;
                                                })()}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>




                {/* Delete confirmation popup */}
                {deleteConfirmIdx !== null && (
                    <div style={{
                        position: "fixed", inset: 0, zIndex: 9999,
                        background: "rgba(0,0,0,0.45)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        padding: "0 20px"
                    }} onClick={() => setDeleteConfirmIdx(null)}>
                        <div
                            style={{
                                background: "#fff", borderRadius: 18, padding: "24px 20px 20px",
                                width: "100%", maxWidth: 320,
                                boxShadow: "0 24px 64px rgba(0,0,0,0.25)"
                            }}
                            onClick={e => e.stopPropagation()}
                        >
                            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                                <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(239,68,68,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    <i className="bi bi-trash3-fill" style={{ color: "#ef4444", fontSize: 17 }} />
                                </div>
                                <div>
                                    <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>แปลงที่ {deleteConfirmIdx + 1}</div>
                                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>
                                        {plots[deleteConfirmIdx]?.areaRai ? `${plots[deleteConfirmIdx].areaRai.toFixed(2)} ไร่` : ""}
                                    </div>
                                </div>
                            </div>
                            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 20, lineHeight: 1.6, padding: "10px 12px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                                ต้องการลบแปลงนี้ใช่หรือไม่?<br />
                                <span style={{ color: "#ef4444", fontWeight: 600 }}>ข้อมูลแปลงนี้จะไม่สามารถกู้คืนได้</span>
                            </div>
                            <div style={{ display: "flex", gap: 10 }}>
                                <button
                                    onClick={() => setDeleteConfirmIdx(null)}
                                    style={{
                                        flex: 1, padding: "11px 0", borderRadius: 10,
                                        border: "1.5px solid #e2e8f0", background: "#f8fafc",
                                        cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#475569"
                                    }}
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    onClick={() => { onDeleteParcel?.(deleteConfirmIdx); setDeleteConfirmIdx(null); }}
                                    style={{
                                        flex: 1, padding: "11px 0", borderRadius: 10,
                                        border: "none",
                                        background: "linear-gradient(135deg,#ef4444,#dc2626)",
                                        color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700,
                                        boxShadow: "0 4px 12px rgba(220,38,38,0.25)"
                                    }}
                                >
                                    <i className="bi bi-trash3 me-1" /> ลบแปลง
                                </button>
                            </div>
                        </div>
                    </div>
                )}                {/* Action buttons moved to top */}
            </div>
        );
    }

    // ── Step 3: Carbon Results & Save ────────────────────────────────
    if (currentStep === 3) {
        const summaryTotalCo2 = carbonResults.reduce((sum, c) => sum + c.co2Now, 0);
        const summaryTotalCo2Ci = Math.sqrt(carbonResults.reduce((sumSq, c) => sumSq + (c.co2NowCi || 0) ** 2, 0));

        // Build aggregate bar points
        let aggregatePts: BarPoint[] = [];
        if (backendResponses && backendResponses.length > 0) {
            const avgStartAge = carbonResults.length > 0
                ? Math.round(carbonResults.reduce((s, c) => s + c.age, 0) / carbonResults.length)
                : 0;
            aggregatePts = aggregateProfiles(backendResponses, avgStartAge);
        } else if (carbonResults.length > 0) {
            const initialPlotCarbons = carbonResults.map(c => carbonCo2(c.age, c.trees, c.spacing));
            const plotStates = carbonResults.map(c => ({ continuousAge: c.age }));
            const N = plotStates.length;
            for (let i = 0; i < 35; i++) {
                const yearBE = CURRENT_BE + i;
                let totalCo2 = 0, totalContinuousAge = 0, sumSqMargin = 0;
                plotStates.forEach((state, idx) => {
                    const plotCo2 = carbonCo2(state.continuousAge, carbonResults[idx].trees, carbonResults[idx].spacing);
                    totalCo2 += plotCo2;
                    if (i > 0) {
                        const growth = plotCo2 - initialPlotCarbons[idx];
                        const factor = 0.05 + 0.002 * i;
                        sumSqMargin += Math.max(0, growth * factor) ** 2;
                    }
                    totalContinuousAge += state.continuousAge;
                    state.continuousAge++;
                });
                const avgAge = Math.round(totalContinuousAge / N);
                const errorMargin = Math.sqrt(sumSqMargin);
                aggregatePts.push({ age: avgAge, yearBE, year_at: i, co2: totalCo2, ci: errorMargin, gainValue: 0, gainCi: 0, cycle: Math.floor(i / 7), cycleAge: avgAge, errorMargin });
            }
        }

        const showAggregateAge = carbonResults.some((c, idx) => {
            const form = plotForms[idx];
            const resp = backendResponses?.find(r => r.polygon_id === `plot-${idx}`);
            return !!form?.plantYear || (resp?.carbon_profile?.some(p => p.age !== null) ?? false);
        });

        return (
            <div className="prp-shell">
                {/* ── Header ─────────────────────────────────────── */}
                <div style={{
                    display: "flex", alignItems: "center", gap: 10,
                    marginBottom: 12, paddingBottom: 12,
                    borderBottom: "1px solid rgba(16,185,129,0.1)"
                }}>
                    <div style={{
                        width: 38, height: 38, borderRadius: 12,
                        background: "linear-gradient(135deg,#10b981,#059669)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: "#fff", boxShadow: "0 3px 8px rgba(16,185,129,0.2)", fontSize: 18
                    }}>
                        <i className="bi bi-graph-up-arrow" />
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: isMobile ? 15 : 16, fontWeight: 800, color: "#0f172a", lineHeight: 1.2 }}>
                            ผลการประเมินผลคาร์บอนเครดิต
                        </div>
                        <div style={{ fontSize: 11, color: "#64748b", marginTop: 2, fontWeight: 500 }}>
                            แสดงผลรวมและรายแปลง
                        </div>
                    </div>
                </div>



                {/* ── Total Overview Accordion ────────────────────────────── */}
                <div style={{
                    background: "#fff",
                    borderRadius: 14,
                    border: "1px solid rgba(16,185,129,0.15)",
                    overflow: "hidden",
                    boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
                    marginBottom: 16
                }}>
                    <div
                        onClick={() => {
                            const willExpand = expandedResultIdx !== "total";
                            setExpandedResultIdx(willExpand ? "total" : null);
                            if (willExpand) {
                                onMapPlotSelected?.("total");
                            }
                        }}
                        style={{
                            background: "linear-gradient(135deg,rgba(16,185,129,0.08),rgba(5,150,105,0.04))",
                            padding: "10px 14px",
                            display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
                            borderBottom: expandedResultIdx === "total" ? "1px solid rgba(16,185,129,0.1)" : "none"
                        }}
                    >
                        <div style={{
                            width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                            background: "linear-gradient(135deg,#0ea5e9,#0284c7)",
                            color: "#fff", display: "flex", alignItems: "center",
                            justifyContent: "center", fontWeight: 800, fontSize: 14
                        }}>
                            <i className="bi bi-folder-fill" />
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a" }}>{projectName ? `โครงการ ${projectName}` : "โครงการ"}</div>
                            <div style={{ fontSize: 12, color: "#64748b" }}>
                                {carbonResults.length} แปลง · {totalArea.toFixed(2)} ไร่
                            </div>
                        </div>
                        <i className={`bi bi-chevron-${expandedResultIdx === "total" ? 'up' : 'down'}`} style={{ color: "#64748b", fontSize: 14 }} />
                    </div>

                    {expandedResultIdx === "total" && (
                        <div style={{ padding: "14px 14px 16px" }}>
                            <div style={{
                                background: "linear-gradient(to right, rgba(13,148,136,0.08), rgba(20,184,166,0.03))",
                                border: "1px solid rgba(13,148,136,0.2)",
                                borderRadius: 12,
                                padding: "16px",
                                marginBottom: 16,
                                display: "flex",
                                flexDirection: "column",
                                justifyContent: "center",
                                alignItems: "center"
                            }}>
                                <div style={{ fontSize: 13, color: "#0f766e", fontWeight: 700, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                                    <i className="bi bi-cloud-arrow-down-fill" /> ปริมาณคาร์บอนเครดิตรวม ณ ปีปัจจุบัน
                                </div>
                                <div style={{ fontWeight: 800, color: "#0d9488", fontSize: isMobile ? 24 : 28, lineHeight: 1.1 }}>
                                    {Math.floor(summaryTotalCo2).toLocaleString()} <span style={{ fontSize: isMobile ? 18 : 20, color: "#0f766e" }}>± {Math.round(summaryTotalCo2Ci).toLocaleString()}</span> <span style={{ fontSize: 16, fontWeight: 600, opacity: 0.8 }}>tCO₂eq</span>
                                </div>
                            </div>

                            {aggregatePts.length > 0 && (
                                <div>
                                    <CarbonBarChart pts={aggregatePts} isMobile={isMobile} narrowMode={!isMobile} showAge={showAggregateAge} />
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* ── Per-Plot Cards ────────────────────────────── */}
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {carbonResults.map((cr, i) => {
                        const form = plotForms[i];
                        const plot = plots[i];
                        const backendResp = backendResponses?.find(r => r.polygon_id === `plot-${i}`);
                        const ep = backendResp?.estimated_parameters;

                        const backendProfile = backendResp?.carbon_profile;
                        const startYearBE = cr.plantYearBE > 0 ? cr.plantYearBE + cr.age : CURRENT_BE;
                        const plotPts = backendProfile && backendProfile.length > 0
                            ? profileToBarPoints(backendProfile, cr.age)
                            : buildBarPoints(cr.age, startYearBE, cr.trees, cr.spacing || "2.5x8");

                        const showPlotAge = !!form?.plantYear || (backendResp?.carbon_profile?.some(p => p.age !== null) ?? false);

                        return (
                            <div
                                key={i}
                                style={{
                                    background: "#fff",
                                    borderRadius: 14,
                                    border: "1px solid rgba(16,185,129,0.15)",
                                    overflow: "hidden",
                                    boxShadow: "0 2px 10px rgba(0,0,0,0.04)"
                                }}
                            >
                                {/* Plot header */}
                                <div
                                    onClick={() => {
                                        const willExpand = expandedResultIdx !== i;
                                        setExpandedResultIdx(willExpand ? i : null);
                                        if (willExpand) {
                                            if (parcelFeatures[i]) onFlyTo(parcelFeatures[i]);
                                            onMapPlotSelected?.(i);
                                        } else {
                                            onMapPlotSelected?.("total");
                                        }
                                    }}
                                    style={{
                                        background: "linear-gradient(135deg,rgba(16,185,129,0.08),rgba(5,150,105,0.04))",
                                        padding: "10px 14px",
                                        display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
                                        borderBottom: expandedResultIdx === i ? "1px solid rgba(16,185,129,0.1)" : "none"
                                    }}
                                >
                                    <div style={{
                                        width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                                        background: "linear-gradient(135deg,#10b981,#059669)",
                                        color: "#fff", display: "flex", alignItems: "center",
                                        justifyContent: "center", fontWeight: 800, fontSize: 14
                                    }}>{i + 1}</div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a" }}>แปลงที่ {i + 1}</div>
                                            {form?.plantStatus === "replanting" && (
                                                <span style={{ fontSize: 10, background: "#dcfce7", color: "#166534", padding: "2px 6px", borderRadius: 10, fontWeight: 700 }}>เริ่มปลูกใหม่</span>
                                            )}
                                            {form?.plantStatus === "existing" && (
                                                <span style={{ fontSize: 10, background: "#e0f2fe", color: "#075985", padding: "2px 6px", borderRadius: 10, fontWeight: 700 }}>ปลูกมาแล้ว</span>
                                            )}
                                        </div>
                                        <div style={{ fontSize: 12, color: "#64748b" }}>
                                            {plot?.areaRai.toFixed(2)} ไร่
                                        </div>
                                    </div>
                                    <i className={`bi bi-chevron-${expandedResultIdx === i ? 'up' : 'down'}`} style={{ color: "#64748b", fontSize: 14 }} />
                                </div>

                                {expandedResultIdx === i && (
                                    <>
                                        {/* Current Carbon Overview Card */}
                                        <div style={{ padding: "14px 14px 0" }}>
                                            <div style={{
                                                background: "linear-gradient(to right, rgba(13,148,136,0.08), rgba(20,184,166,0.03))",
                                                border: "1px solid rgba(13,148,136,0.2)",
                                                borderRadius: 12,
                                                padding: "16px 16px",
                                                display: "flex",
                                                flexDirection: "column",
                                                justifyContent: "center",
                                                alignItems: "center"
                                            }}>
                                                <div style={{ fontSize: 13, color: "#0f766e", fontWeight: 700, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                                                    <i className="bi bi-cloud-arrow-down-fill" /> ปริมาณคาร์บอนเครดิต ณ ปีปัจจุบัน
                                                </div>
                                                <div style={{ fontWeight: 800, color: "#0d9488", fontSize: isMobile ? 24 : 28, lineHeight: 1.1 }}>
                                                    {Math.floor(cr.co2Now).toLocaleString()} <span style={{ fontSize: isMobile ? 16 : 18, color: "#0f766e" }}>± {Math.round(cr.co2NowCi || 0).toLocaleString()}</span> <span style={{ fontSize: 16, fontWeight: 600, opacity: 0.8 }}>tCO₂eq</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Plot chart */}
                                        <div style={{ padding: "12px 12px 4px" }}>
                                            <CarbonBarChart pts={plotPts} isMobile={isMobile} narrowMode={!isMobile} showAge={showPlotAge} />
                                        </div>

                                        {/* Plot details */}
                                        <div style={{ padding: "8px 14px 14px" }}>
                                            <PlotDetailCard form={form} cr={cr} ep={ep || null} />
                                        </div>
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }

    return null;
}
