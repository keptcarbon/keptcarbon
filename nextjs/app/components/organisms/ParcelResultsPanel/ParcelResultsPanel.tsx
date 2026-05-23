"use client";
import { useState, useMemo, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { carbonForAge } from "@/lib/map-utils";
import { useAuth } from "@/lib/auth-context";
import { CarbonBarChart, buildBarPoints, carbonCo2, CUT_AGE, type BarPoint } from "./CarbonBarChart";
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
    isDrawing?: boolean;
    onFinishDraw?: () => void;
    onCancelDraw?: () => void;
    onLandUseChange?: (allPlotsChecked: Record<number, Record<string, boolean>>, focusedPlotIdx?: number | null) => void;
    onProjectTypeChange?: (type: "replanting" | "existing") => void;
};

type PlotTab = "analyze" | "forecast";
type ForecastYr = 3 | 5 | 7;
type SubStep = "form" | "carbon" | "save";

interface PlotFormData {
    plantStatus: "replanting" | "existing" | "";
    plantYear: string;
    treeCount: string;
    variety: string;
    spacing: string;
    luChecked: Record<string, boolean>;
    luMockData: Record<string, { rai: number, pct: number }>;
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

// ── Constants ─────────────────────────────────────────────────────────────

const THAI_PROVINCES = [
    "กระบี่", "กาญจนบุรี", "กาฬสินธุ์", "กำแพงเพชร", "ขอนแก่น", "จันทบุรี", "ฉะเชิงเทรา",
    "ชลบุรี", "ชัยนาท", "ชัยภูมิ", "ชุมพร", "เชียงราย", "เชียงใหม่", "ตรัง", "ตราด", "ตาก",
    "นครนายก", "นครปฐม", "นครพนม", "นครราชสีมา", "นครศรีธรรมราช", "นครสวรรค์", "นนทบุรี",
    "นราธิวาส", "น่าน", "บึงกาฬ", "บุรีรัมย์", "ปทุมธานี", "ประจวบคีรีขันธ์", "ปราจีนบุรี",
    "ปัตตานี", "พระนครศรีอยุธยา", "พะเยา", "พังงา", "พัทลุง", "พิจิตร", "พิษณุโลก",
    "เพชรบุรี", "เพชรบูรณ์", "แพร่", "ภูเก็ต", "มหาสารคาม", "มุกดาหาร", "แม่ฮ่องสอน",
    "ยโสธร", "ยะลา", "ร้อยเอ็ด", "ระนอง", "ระยอง", "ราชบุรี", "ลพบุรี", "ลำปาง", "ลำพูน",
    "เลย", "ศรีสะเกษ", "สกลนคร", "สงขลา", "สตูล", "สมุทรปราการ", "สมุทรสงคราม",
    "สมุทรสาคร", "สระแก้ว", "สระบุรี", "สิงห์บุรี", "สุโขทัย", "สุพรรณบุรี", "สุราษฎร์ธานี",
    "สุรินทร์", "หนองคาย", "หนองบัวลำภู", "อ่างทอง", "อำนาจเจริญ", "อุดรธานี", "อุตรดิตถ์",
    "อุทัยธานี", "อุบลราชธานี",
];

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

    // Backend 500 errors
    if (msg.includes("Backend API error: 500")) {
        // Check if any plot is "existing" with no planting data — likely cause
        const hasExistingNoData = plots.some((p, i) => {
            const form = plotForms[i];
            return form?.plantStatus === "existing" && !form.plantYear && !p.plantYearBE;
        });
        if (hasExistingNoData) {
            return "ไม่สามารถประมวลผลคาร์บอนได้ เนื่องจากไม่พบข้อมูลปีปลูกสำหรับแปลงที่ปลูกมาแล้ว กรุณากรอกปีที่ปลูก (พ.ศ.) ในขั้นตอนกรอกข้อมูล หรือตรวจสอบว่าพื้นที่อยู่ในเขตที่ระบบรองรับ";
        }
        return "ระบบไม่สามารถประมวลผลคาร์บอนได้ในขณะนี้ กรุณาตรวจสอบข้อมูลแปลงอีกครั้ง หรือลองใหม่ภายหลัง";
    }

    // Network / connection errors
    if (msg.includes("fetch") || msg.includes("NetworkError") || msg.includes("Failed to fetch")) {
        return "ไม่สามารถเชื่อมต่อกับระบบประมวลผลได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ตและลองอีกครั้ง";
    }

    // Other errors
    return "เกิดข้อผิดพลาดในการประมวลผลคาร์บอน กรุณาตรวจสอบข้อมูลแปลงและลองอีกครั้ง";
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

function ageDistribution(age: number, conf: number) {
    const c = Math.min(Math.max(conf || 0.65, 0.1), 0.9);
    const rest = 1 - c;
    const raw = [rest * 0.18, rest * 0.32, c, rest * 0.35, rest * 0.15];
    const total = raw.reduce((a, b) => a + b, 0);
    return [age - 2, age - 1, age, age + 1, age + 2]
        .map((a, i) => ({ a, pct: Math.round((raw[i] / total) * 1000) / 10 }))
        .filter(({ a }) => a > 0);
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

function forecastPts(age: number, trees: number, years: ForecastYr) {
    return Array.from({ length: years + 1 }, (_, i) => ({
        yearBE: CURRENT_BE + i,
        co2: trees > 0 ? carbonForAge(age + i, trees).co2 : 0,
    }));
}

function generateMockLU(totalRai: number, checked: Record<string, boolean>) {
    const keys = Object.keys(checked).filter(k => checked[k] && !['U', 'W'].includes(k)); // Exclude disabled ones
    if (keys.length === 0) return {};
    const res: Record<string, { rai: number, pct: number }> = {};
    if (keys.length === 1) {
        res[keys[0]] = { rai: totalRai, pct: 100 };
        return res;
    }
    const basePct = Math.floor(100 / keys.length);
    let remaining = 100;
    keys.forEach((k, i) => {
        if (i === keys.length - 1) {
            res[k] = { rai: (remaining / 100) * totalRai, pct: remaining };
        } else {
            const pct = Math.max(1, basePct + Math.floor(Math.random() * 10 - 5));
            res[k] = { rai: (pct / 100) * totalRai, pct };
            remaining -= pct;
        }
    });
    return res;
}

function summaryForecast(plots: PlotInfo[], years: ForecastYr) {
    return Array.from({ length: years + 1 }, (_, i) => ({
        yearBE: CURRENT_BE + i,
        co2: plots.reduce((s, pl) => s + (pl.trees > 0 ? carbonForAge(pl.age + i, pl.trees).co2 : 0), 0),
    }));
}

// ── SVG: Age distribution bar chart with hover tooltip ────────────────────
function AgeBarChart({ age, conf, trees, isMobile }: { age: number; conf: number; trees: number; isMobile?: boolean }) {
    const [hoverIdx, setHoverIdx] = useState<number | null>(null);
    const dist = ageDistribution(age, conf);
    const maxPct = Math.max(...dist.map(d => d.pct));

    const W = isMobile ? 400 : 550, BAR_W = isMobile ? 58 : 64, GAP = isMobile ? 10 : 22;
    const totalW = dist.length * BAR_W + (dist.length - 1) * GAP;
    const sx = (W - totalW) / 2;
    const BASE_Y = isMobile ? 180 : 200, MAX_BH = isMobile ? 120 : 140, H = isMobile ? 240 : 260;

    return (
        <div style={{ background: "linear-gradient(135deg,#f0fdf4,#ecfdf5)", borderRadius: 14, padding: "12px 8px 8px", marginBottom: 12 }}>
            <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H, display: "block", overflow: "visible" }}>
                <defs>
                    <linearGradient id="barGradMain" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" />
                        <stop offset="100%" stopColor="#059669" />
                    </linearGradient>
                    <filter id="barShadow">
                        <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#059669" floodOpacity="0.3" />
                    </filter>
                </defs>

                {/* background grid */}
                {[0.25, 0.5, 0.75, 1].map(t => (
                    <line key={t}
                        x1={sx} y1={BASE_Y - t * MAX_BH} x2={sx + totalW} y2={BASE_Y - t * MAX_BH}
                        stroke="rgba(16,185,129,0.1)" strokeWidth={t === 1 ? 1.2 : 0.6}
                        strokeDasharray={t < 1 ? "4,4" : undefined} />
                ))}

                {dist.map(({ a, pct }, i) => {
                    const bh = Math.max((pct / maxPct) * MAX_BH, 5);
                    const x = sx + i * (BAR_W + GAP);
                    const cx = x + BAR_W / 2;
                    const isMain = a === age;
                    const isHov = hoverIdx === i;
                    const co2Val = trees > 0 ? carbonForAge(a, trees).co2 : 0;

                    const ttW = 102, ttH = 46;
                    const ttLeft = Math.min(Math.max(cx - ttW / 2, 2), W - ttW - 2);
                    const ttTop = BASE_Y - bh - ttH - 16;

                    return (
                        <g key={i} onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(null)} style={{ cursor: "pointer" }}>
                            {/* hover glow bg */}
                            {(isMain || isHov) && (
                                <rect x={x - 4} y={BASE_Y - bh - 4} width={BAR_W + 8} height={bh + 4}
                                    rx={10} fill={isHov ? "rgba(16,185,129,0.12)" : "rgba(45,158,95,0.07)"} />
                            )}
                            {/* bar */}
                            <rect x={x} y={BASE_Y - bh} width={BAR_W} height={bh} rx={8}
                                fill={isMain ? "url(#barGradMain)" : isHov ? "rgba(16,185,129,0.45)" : "rgba(16,185,129,0.18)"}
                                filter={isMain ? "url(#barShadow)" : undefined}
                                style={{ transition: "fill 0.15s" }} />
                            {/* % label above bar */}
                            <text x={cx} y={BASE_Y - bh - 8} textAnchor="middle"
                                fontSize={isMain ? (isMobile ? 22 : 21) : (isMobile ? 18 : 16)}
                                fontWeight={isMain ? "900" : isHov ? "700" : "500"}
                                fill={isMain ? "#065f46" : isHov ? "#059669" : "#94a3b8"}>
                                {pct}%
                            </text>
                            {/* age labels removed per user request */}

                            {/* tooltip */}
                            {isHov && (
                                <g pointerEvents="none">
                                    <rect x={ttLeft} y={ttTop} width={ttW} height={ttH + 10} rx={9} fill="#064e3b" opacity={0.95} />
                                    <text x={ttLeft + ttW / 2} y={ttTop + 18} textAnchor="middle" fontSize={12} fill="#6ee7b7" fontWeight="600">
                                        อายุ {a} ปี · {pct}%
                                    </text>
                                    <text x={ttLeft + ttW / 2} y={ttTop + 38} textAnchor="middle" fontSize={15} fill="#fff" fontWeight="800">
                                        {co2Val > 0 ? `${Math.floor(co2Val).toLocaleString("th-TH")} tCO₂` : "—"}
                                    </text>
                                    <polygon points={`${cx - 5},${ttTop + ttH} ${cx + 5},${ttTop + ttH} ${cx},${ttTop + ttH + 6}`} fill="#064e3b" opacity={0.95} />
                                </g>
                            )}
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}

// ── SVG: Carbon forecast line chart with hover ────────────────────────────
function ForecastChart({ pts, isMobile }: { pts: Array<{ yearBE: number; co2: number }>; isMobile?: boolean }) {
    const [hoverIdx, setHoverIdx] = useState<number | null>(null);
    const W = isMobile ? 360 : 550, H = isMobile ? 230 : 250, PL = 12, PR = isMobile ? 55 : 75, PT = isMobile ? 24 : 30, PB = isMobile ? 38 : 42;
    const iW = W - PL - PR, iH = H - PT - PB;
    const vals = pts.map(p => p.co2);
    const minV = Math.min(...vals), maxV = Math.max(...vals);
    const rng = maxV - minV || 1;

    const svgPts = pts.map((d, i) => ({
        x: PL + (i / Math.max(pts.length - 1, 1)) * iW,
        y: PT + (1 - (d.co2 - minV) / rng) * iH,
        ...d,
    }));
    const line = svgPts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    const fillPath = `${PL},${PT + iH} ${line} ${(PL + iW).toFixed(1)},${PT + iH}`;
    const hp = hoverIdx !== null ? svgPts[hoverIdx] : null;

    return (
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H, display: "block", overflow: "visible" }}>
            <defs>
                <linearGradient id="fcAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0d9488" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="#0d9488" stopOpacity="0.02" />
                </linearGradient>
                <filter id="ptShadow">
                    <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#059669" floodOpacity="0.4" />
                </filter>
            </defs>

            {/* Grid */}
            {[0, 0.5, 1].map(t => (
                <line key={t} x1={PL} y1={PT + t * iH} x2={PL + iW} y2={PT + t * iH}
                    stroke="rgba(45,158,95,0.1)" strokeWidth={t === 0 || t === 1 ? 1 : 0.5}
                    strokeDasharray={t === 0.5 ? "4,4" : undefined} />
            ))}

            {/* Hover vertical guide */}
            {hp && (
                <line x1={hp.x} y1={PT} x2={hp.x} y2={PT + iH}
                    stroke="rgba(16,185,129,0.35)" strokeWidth={1.5} strokeDasharray="3,3" />
            )}

            {/* Area */}
            <polygon points={fillPath} fill="url(#fcAreaGrad)" />

            {/* Line */}
            <polyline points={line} fill="none" stroke="#0d9488" strokeWidth={2.2}
                strokeLinejoin="round" strokeLinecap="round" />

            {/* Invisible wide hit targets per segment */}
            {svgPts.map((p, i) => (
                <rect key={i}
                    x={i === 0 ? PL : (svgPts[i - 1].x + p.x) / 2}
                    y={PT}
                    width={i === 0
                        ? (svgPts[1] ? (svgPts[1].x + p.x) / 2 - PL : iW)
                        : i === svgPts.length - 1
                            ? (PL + iW) - (svgPts[i - 1].x + p.x) / 2
                            : (p.x - svgPts[i - 1].x)}
                    height={iH}
                    fill="transparent"
                    onMouseEnter={() => setHoverIdx(i)}
                    onMouseLeave={() => setHoverIdx(null)}
                    style={{ cursor: "crosshair" }}
                />
            ))}

            {/* Data points */}
            {svgPts.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={hoverIdx === i ? 5.5 : 3.5}
                    fill={hoverIdx === i ? "#10b981" : "#ffffff"}
                    stroke="#059669" strokeWidth={2}
                    filter={hoverIdx === i ? "url(#ptShadow)" : undefined}
                    style={{ transition: "r 0.15s ease" }} />
            ))}

            {/* Year labels */}
            {svgPts.map(p => (
                <text key={p.yearBE} x={p.x} y={H - 12} textAnchor="middle" fontSize={isMobile ? 14 : 13} fill="#94a3b8">
                    {p.yearBE}
                </text>
            ))}

            {/* Y axis labels */}
            <text x={PL + iW + 8} y={PT + 4} fontSize={isMobile ? 12 : 11} fill="#6b9e7e" textAnchor="start">
                {Math.floor(maxV).toLocaleString()}
            </text>
            <text x={PL + iW + 8} y={PT + iH + 4} fontSize={isMobile ? 12 : 11} fill="#6b9e7e" textAnchor="start">
                {Math.floor(minV).toLocaleString()}
            </text>

            {/* Hover tooltip */}
            {hp && (() => {
                const ttW = 96, ttH = 42;
                const ttX = Math.min(Math.max(hp.x - ttW / 2, PL), PL + iW - ttW);
                const ttY = hp.y - ttH - 10;
                return (
                    <g pointerEvents="none">
                        <rect x={ttX} y={ttY} width={ttW + 10} height={ttH + 10} rx={7} fill="#0f1f17" opacity={0.93} />
                        <text x={ttX + (ttW + 10) / 2} y={ttY + 16} textAnchor="middle" fontSize={11} fill="#6ee7b7" fontWeight="600">
                            พ.ศ. {hp.yearBE}
                        </text>
                        <text x={ttX + (ttW + 10) / 2} y={ttY + 34} textAnchor="middle" fontSize={13} fill="#ffffff" fontWeight="700">
                            {Math.floor(hp.co2).toLocaleString("th-TH")} tCO₂
                        </text>
                        <polygon
                            points={`${hp.x - 5},${ttY + ttH} ${hp.x + 5},${ttY + ttH} ${hp.x},${ttY + ttH + 6}`}
                            fill="#0f1f17" opacity={0.93}
                        />
                    </g>
                );
            })()}
        </svg>
    );
}

function convertYearNoteToBE(note: string): string {
    return note.replace(/^(\d{4})/, (_, y) => String(parseInt(y) + 543));
}

function EstimatedParamsCard({ params }: { params: EstimatedParameters }) {
    const yearParam = params.year_of_planting;
    const yearNotes = (yearParam.note ?? []).slice(0, 5);

    let usedYearBE: number | null = null;
    if (typeof yearParam.value === "number") {
        usedYearBE = yearParam.value + 543;
    } else if (Array.isArray(yearParam.value) && yearParam.value.length > 0) {
        const m = yearParam.value[0].match(/^(\d{4})/);
        if (m) usedYearBE = parseInt(m[1]) + 543;
    }

    return (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed rgba(14,165,233,0.2)", fontSize: 13 }}>
            <div style={{ fontWeight: 700, color: "#0284c7", marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
                <i className="bi bi-cpu" /> พารามิเตอร์จากระบบ
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {/* Year used */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#475569" }}>
                    <span>• ปีที่ปลูก (ใช้คำนวณ)</span>
                    <span style={{ color: "#0f172a", fontWeight: 700 }}>
                        {usedYearBE ? `พ.ศ. ${usedYearBE}` : "—"}
                    </span>
                </div>
                {/* Year distribution from raster — top 5 */}
                {yearNotes.length > 0 && (
                    <div style={{ marginLeft: 8, marginTop: 2, padding: "6px 10px", background: "rgba(14,165,233,0.04)", borderRadius: 6, border: "1px solid rgba(14,165,233,0.12)" }}>
                        <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700, marginBottom: 4 }}>
                            <i className="bi bi-satellite" style={{ marginRight: 4 }} />การกระจายปีที่ตรวจพบ:
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            {yearNotes.map((note, ni) => (
                                <span key={ni} style={{ fontSize: 12, color: ni === 0 ? "#0369a1" : "#94a3b8", fontWeight: ni === 0 ? 700 : 400 }}>
                                    {ni === 0 ? "▶ " : "  "}{convertYearNoteToBE(note)}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
                {/* Clone, tree count, spacing */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "4px 8px", marginTop: 2, color: "#475569" }}>
                    <div>• พันธุ์ยาง: <strong style={{ color: "#0f172a" }}>{String(params.rubber_clone.value)}</strong></div>
                    <div>• ระยะปลูก: <strong style={{ color: "#0f172a" }}>{String(params.spacing_system.value)}</strong></div>
                    <div>• จำนวนต้น: <strong style={{ color: "#0f172a" }}>{Number(params.tree_count.value).toLocaleString("th-TH")}</strong> ต้น</div>
                </div>
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
    isDrawing,
    onFinishDraw,
    onCancelDraw,
    onLandUseChange,
    onProjectTypeChange,
}: Props) {
    const [expandedIdx, setExpandedIdx] = useState<number | null>(0);
    const [plotTabs, setPlotTabs] = useState<Record<number, PlotTab>>({});
    const [forecastYrs, setForecastYrs] = useState<Record<number, ForecastYr>>({});
    const [summaryFcYrs, setSummaryFcYrs] = useState<ForecastYr>(7);
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
    const totalCO2 = useMemo(() => plots.reduce((s, p) => s + p.co2, 0), [plots]);
    const summaryPts = useMemo(() => summaryForecast(plots, summaryFcYrs), [plots, summaryFcYrs]);
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


    // Step 3 form
    // Sub-step tracking for Step 3 results view
    // (Formerly used for a separate save form, now removed for direct saving)
    const [subStep, setSubStep] = useState<SubStep>("carbon");

    const searchParams = useSearchParams();
    const initialProjectName = searchParams.get("project") || "";
    const [projectName, setProjectName] = useState(initialProjectName);
    const [ownerName, setOwnerName] = useState(userDisplayName);
    const [province, setProvince] = useState("");
    const [saveState, setSaveState] = useState<"idle" | "saving" | "done">("idle");
    const [showInputDetails, setShowInputDetails] = useState(false);
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

                        let initialStatus: "replanting" | "existing" | "" = "";
                        if (props.plantYearBE) {
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
                            luMockData: generateMockLU(plots[i].areaRai, { ...initialLU })
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
                        const oldestYearCE = Math.min(...allYearsCE);
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
                const finalTrees = userTrees > 0 ? userTrees : Math.round(totalAreaRai * 76);
                const co2Now = profile[0]?.stocks?.value ?? 0;

                results.push({
                    plotIdx: idx,
                    age: startAge,
                    plantYearBE: finalPlantYearBE,
                    trees: finalTrees,
                    spacing: form.spacing,
                    variety: form.variety,
                    co2Now,
                    source: "backend" as const,
                    yearUsedDetails,
                    selectedAreaRai: totalPlotSelectedRai,
                    luBreakdown
                });
            }

            setCarbonResults(results);
            if (onMapPlotSelected) onMapPlotSelected("total");
            setSubStep("carbon");
            onStepChange(3);
        } catch (err) {
            setCarbonErr(getFriendlyErrorMessage(err, plots, plotForms));
        } finally {
            setProcessingCarbon(false);
        }
    };


    // Removed: if (!(searchRunning || searchErr || searchCount !== null)) return null;

    const handleSave = async (overrideResults?: CarbonResult[]) => {
        const resultsToSave = overrideResults || carbonResults;
        const hasCarbonResults = resultsToSave.length > 0;

        setSaveState("saving");

        await new Promise(r => setTimeout(r, 900));
        try {
            if (!user) return;
            const key = `user_saved_plots_${user.id}`;
            const existing = JSON.parse(localStorage.getItem(key) || "[]");
            const CURRENT_BE_NOW = new Date().getFullYear() + 543;
            const newPlots = plots.map((p, i) => {
                const feat = parcelFeatures[i];
                const props = (feat?.properties || {}) as any;
                const cr = resultsToSave[i];
                const form = plotForms[i];

                const userPlantYear = form?.plantYear ? parseInt(form.plantYear) : 0;
                const userTrees = form?.treeCount ? parseInt(form.treeCount) : 0;

                const age = cr?.age ?? (userPlantYear > 0 ? (CURRENT_BE_NOW - userPlantYear) : 0);
                const trees = cr?.trees ?? (userTrees > 0 ? userTrees : 0);
                const spacing = cr?.spacing || form?.spacing || "";
                const finalPlantYear = cr?.plantYearBE ?? (userPlantYear > 0 ? userPlantYear : 0);

                // If saved directly without processing, set carbon to 0
                const co2 = hasCarbonResults ? (cr?.co2Now ?? 0) : 0;

                return {
                    id: props.id || Math.random().toString(36).substring(7),
                    userId: user.id,
                    name: projectName || props.farm_name || "แปลงยางใหม่",
                    areaRai: p.areaRai,
                    carbonTotal: co2,
                    rubberAge: age,
                    plantYearBE: finalPlantYear,
                    trees,
                    variety: form?.variety || cr?.variety || "",
                    spacing,
                    luChecked: form?.luChecked || { A: true, A302: true },
                    plantStatus: form?.plantStatus || "",
                    confidence: p.confidence,
                    ownerName: ownerName || props.owner_name || "",
                    province: province || dominantProvince,
                    date: new Date().toISOString(),
                    geojson: feat?.geometry || null,
                    boundaryGeojson: drawnGeometry || null,
                    forecast: hasCarbonResults ? {
                        yr3: carbonCo2(age + 3, trees, spacing),
                        yr5: carbonCo2(age + 5, trees, spacing),
                        yr7: carbonCo2(age + 7, trees, spacing),
                    } : { yr3: 0, yr5: 0, yr7: 0 },
                };
            });
            const newPlotsWithStatus = newPlots.filter(p => p.plantStatus);
            if (newPlotsWithStatus.length === 0) {
                setCarbonErr("กรุณาเลือกสถานะแปลงอย่างน้อย 1 แปลงก่อนบันทึก");
                setSaveState("idle");
                return;
            }
            const newPlotIds = new Set(newPlotsWithStatus.map(p => p.id));
            const filteredExisting = existing.filter((p: any) => !newPlotIds.has(p.id));
            localStorage.setItem(key, JSON.stringify([...newPlotsWithStatus, ...filteredExisting]));
            const globalKey = "global_saved_plots";
            const globalExisting = JSON.parse(localStorage.getItem(globalKey) || "[]");
            const filteredGlobalExisting = globalExisting.filter((p: any) => !newPlotIds.has(p.id));
            localStorage.setItem(globalKey, JSON.stringify([...newPlotsWithStatus, ...filteredGlobalExisting]));
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
                            <i className="bi bi-pencil-square me-2" style={{ color: "#10b981" }} />กรอกข้อมูลแปลง
                        </div>
                        <div className="prp-subtitle">กรอกหรือข้ามได้ — ข้อมูลจะนำไปประมวลผลคาร์บอน</div>
                    </div>
                    {onBack && (
                        <button
                            onClick={onBack}
                            style={{
                                fontSize: isMobile ? 10 : 11,
                                fontWeight: 700,
                                color: "#0f766e",
                                cursor: "pointer",
                                background: "#f0fdfa",
                                border: "1px solid rgba(13,148,136,0.3)",
                                padding: isMobile ? "4px 8px" : "6px 12px",
                                borderRadius: isMobile ? 6 : 8,
                                display: "flex",
                                alignItems: "center",
                                gap: isMobile ? 4 : 6,
                                transition: "all 0.2s",
                                outline: "none",
                                boxShadow: "0 2px 5px rgba(13,148,136,0.05)"
                            }}
                            onMouseOver={(e) => {
                                e.currentTarget.style.background = "#ccfbf1";
                                e.currentTarget.style.borderColor = "rgba(13,148,136,0.5)";
                            }}
                            onMouseOut={(e) => {
                                e.currentTarget.style.background = "#f0fdfa";
                                e.currentTarget.style.borderColor = "rgba(13,148,136,0.3)";
                            }}
                        >
                            <i className="bi bi-arrow-left-circle" /> ย้อนกลับ
                        </button>
                    )}
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
                {(!projectName.trim() || hasEmptyStatus) && (
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
                            {!projectName.trim() && hasEmptyStatus
                                ? 'กรุณากรอก "ชื่อโครงการ" และเลือก "สถานะแปลง" ให้ครบทุกแปลง เพื่อประมวลผลหรือบันทึกข้อมูล'
                                : !projectName.trim()
                                    ? 'กรุณากรอก "ชื่อโครงการ" เพื่อประมวลผลหรือบันทึกข้อมูล'
                                    : 'กรุณาเลือก "สถานะแปลง" ให้ครบทุกแปลง เพื่อประมวลผลหรือบันทึกข้อมูล'
                            }
                        </span>
                    </div>
                )}
                <div style={{ display: "flex", gap: isMobile ? 6 : 8, marginBottom: 16, flexWrap: "nowrap" }}>
                    {onDrawMore && !isDrawing && (
                        <button className="prp-btn-ghost" style={{ flex: 1, padding: isMobile ? "8px 2px" : "10px 4px", fontSize: isMobile ? 11 : 12, display: "flex", flexDirection: "column", alignItems: "center", gap: isMobile ? 4 : 6, background: "rgba(16,185,129,0.1)", color: "#059669", border: "1px solid rgba(16,185,129,0.2)", borderRadius: isMobile ? 10 : 12 }} onClick={onDrawMore}>
                            <i className="bi bi-pencil-square" style={{ fontSize: isMobile ? 16 : 18 }} /> <span style={{ fontWeight: 600, textAlign: "center", lineHeight: 1.2 }}>วาดแปลงเพิ่ม</span>
                        </button>
                    )}
                    <button
                        className="prp-btn-primary"
                        onClick={() => handleSave([])}
                        disabled={!projectName.trim() || saveState === "saving"}
                        style={{
                            flex: 1, padding: isMobile ? "8px 2px" : "10px 4px", fontSize: isMobile ? 11 : 12, display: "flex", flexDirection: "column", alignItems: "center", gap: isMobile ? 4 : 6,
                            background: saveState === "done" ? "#94a3b8" : ((projectName.trim() && !hasEmptyStatus) ? "linear-gradient(135deg,#0ea5e9,#0284c7)" : "#cbd5e1"),
                            color: "#fff", border: "none", borderRadius: isMobile ? 10 : 12,
                            cursor: saveState !== "idle" ? "not-allowed" : ((projectName.trim() && !hasEmptyStatus) ? "pointer" : "not-allowed"),
                            boxShadow: saveState === "done" ? "none" : ((projectName.trim() && !hasEmptyStatus) ? "0 4px 10px rgba(2,132,199,0.2)" : "none"),
                            opacity: saveState === "done" ? 0.6 : 1,
                            transition: "all 0.3s"
                        }}
                    >
                        {saveState === "saving" ? (
                            <><span className="s1-spin" style={{ width: isMobile ? 16 : 18, height: isMobile ? 16 : 18, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff" }} /> <span style={{ fontWeight: 600, textAlign: "center", lineHeight: 1.2 }}>กำลังบันทึก</span></>
                        ) : saveState === "done" ? (
                            <><i className="bi bi-check-circle-fill" style={{ fontSize: isMobile ? 16 : 18 }} /> <span style={{ fontWeight: 600, textAlign: "center", lineHeight: 1.2 }}>บันทึกแล้ว ✓</span></>
                        ) : (
                            <><i className="bi bi-save" style={{ fontSize: isMobile ? 16 : 18 }} /> <span style={{ fontWeight: 600, textAlign: "center", lineHeight: 1.2 }}>บันทึกข้อมูลแปลง</span></>
                        )}
                    </button>
                    <button
                        className="prp-btn-primary"
                        onClick={() => { void handleProcessCarbon(); }}
                        disabled={!projectName.trim() || hasEmptyStatus || processingCarbon}
                        style={{
                            flex: 1, padding: isMobile ? "8px 2px" : "10px 4px", fontSize: isMobile ? 11 : 12, display: "flex", flexDirection: "column", alignItems: "center", gap: isMobile ? 4 : 6,
                            background: (projectName.trim() && !hasEmptyStatus && !processingCarbon) ? "linear-gradient(135deg,#10b981,#059669)" : "#cbd5e1",
                            color: "#fff", border: "none", borderRadius: isMobile ? 10 : 12,
                            cursor: (projectName.trim() && !hasEmptyStatus && !processingCarbon) ? "pointer" : "not-allowed",
                            boxShadow: (projectName.trim() && !hasEmptyStatus && !processingCarbon) ? "0 4px 10px rgba(16,185,129,0.2)" : "none"
                        }}
                    >
                        {processingCarbon ? (
                            <><span className="s1-spin" style={{ width: isMobile ? 16 : 18, height: isMobile ? 16 : 18, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff" }} /> <span style={{ fontWeight: 600, textAlign: "center", lineHeight: 1.2 }}>ประมวลผล</span></>
                        ) : (
                            <><i className="bi bi-graph-up-arrow" style={{ fontSize: isMobile ? 16 : 18 }} /> <span style={{ fontWeight: 600, textAlign: "center", lineHeight: 1.2 }}>ประมวลผล</span></>
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

                {/* Project name — shared */}
                <div style={{ background: "linear-gradient(135deg,#f0fdf4,#ecfdf5)", borderRadius: 14, padding: isMobile ? "14px 14px" : "16px 20px", marginBottom: 16, border: "1px solid rgba(16,185,129,0.18)" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#059669", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                        <i className="bi bi-folder2-open" /> ชื่อโครงการ  <span style={{ color: "#ef4444" }}>*</span>
                    </div>
                    <input className="prp-input" style={{ marginBottom: 0 }} placeholder="เช่น โครงการที่1" value={projectName} onChange={e => setProjectName(e.target.value)} />
                </div>

                {/* Summary of drawn parcels */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, padding: "0 4px" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#475569" }}>
                        แปลงที่วาดแล้ว ({plots.length})
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#10b981" }}>
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
                                        <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a" }}>แปลงที่ {i + 1}</div>
                                        {p.areaRai > 0 && (
                                            <div style={{ fontSize: 11, color: "#64748b" }}>{p.areaRai.toFixed(2)} ไร่</div>
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
                                            <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
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
                                                }} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer", userSelect: "none" }}>
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
                                                }} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer", userSelect: "none" }}>
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
                                                <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
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
                                                <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
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
                                                <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
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
                                                <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
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
                                            <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                                                <i className="bi bi-layers" style={{ color: "#10b981" }} /> ชั้นข้อมูลการใช้ประโยชน์ที่ดิน (กรมพัฒนาที่ดิน)
                                            </div>
                                            <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
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
                                                                <span style={{ color: isChecked ? lu.color : "#64748b", fontSize: 12, fontWeight: 700 }}>
                                                                    {hasArea ? `${realData.rai.toFixed(2)} ไร่` : "0.00 ไร่"}
                                                                    {hasArea && (
                                                                        <span style={{ opacity: 0.7, fontSize: 11 }}> ({realData.pct}%)</span>
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
                                                        <span style={{ fontSize: 12, color: "#92400e", fontWeight: 600 }}>
                                                            <i className="bi bi-check2-square me-1" /> พื้นที่ที่เลือก
                                                        </span>
                                                        <span style={{ fontSize: 13, color: "#c2410c", fontWeight: 700 }}>
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
                                    <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>ลบแปลงที่ {deleteConfirmIdx + 1}</div>
                                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>
                                        {plots[deleteConfirmIdx]?.areaRai ? `${plots[deleteConfirmIdx].areaRai.toFixed(2)} ไร่` : ""}
                                    </div>
                                </div>
                            </div>
                            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 20, lineHeight: 1.6, padding: "10px 12px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                                ต้องการลบแปลงนี้ออกจากโครงการใช่หรือไม่?<br />
                                <span style={{ color: "#ef4444", fontWeight: 600 }}>การลบจะไม่สามารถกู้คืนได้</span>
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
        // ── sub: carbon results ──
        if (subStep === "carbon") {
            const isTotal = selectedMapPlotIndex === "total";
            const cr = typeof selectedMapPlotIndex === "number" ? carbonResults[selectedMapPlotIndex] : null;

            let pts: BarPoint[] = [];
            let summaryTotalCo2 = 0;

            if (isTotal && carbonResults.length > 0) {
                summaryTotalCo2 = carbonResults.reduce((sum, c) => sum + c.co2Now, 0);

                if (backendResponses && backendResponses.length > 0) {
                    const avgStartAge = carbonResults.length > 0
                        ? Math.round(carbonResults.reduce((s, c) => s + c.age, 0) / carbonResults.length)
                        : 0;
                    pts = aggregateProfiles(backendResponses, avgStartAge);
                } else {
                    const CURRENT_BE = new Date().getFullYear() + 543;
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
                                const m = Math.max(0, growth * factor);
                                sumSqMargin += m * m;
                            }
                            totalContinuousAge += state.continuousAge;
                            state.continuousAge++;
                        });
                        const avgAge = Math.round(totalContinuousAge / N);
                        const errorMargin = Math.sqrt(sumSqMargin);
                        pts.push({ age: avgAge, yearBE, year_at: i, co2: totalCo2, ci: errorMargin, gainValue: 0, gainCi: 0, cycle: Math.floor(i / 7), cycleAge: avgAge, errorMargin });
                    }
                }
            } else if (cr) {
                const plotIdx = selectedMapPlotIndex as number;
                const backendProfile = backendResponses?.find(r => r.polygon_id === `plot-${plotIdx}`)?.carbon_profile;
                const startYearBE = cr.plantYearBE > 0 ? cr.plantYearBE + cr.age : CURRENT_BE;
                pts = backendProfile && backendProfile.length > 0
                    ? profileToBarPoints(backendProfile, cr.age)
                    : buildBarPoints(cr.age, startYearBE, cr.trees, cr.spacing || "2.5x8");
            }

            return (
                <div className="prp-shell">
                    {/* New Integrated Header Design */}
                    <div style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        marginBottom: 12,
                        paddingBottom: 12,
                        borderBottom: "1px solid rgba(16,185,129,0.1)"
                    }}>
                        <div style={{
                            width: 38,
                            height: 38,
                            borderRadius: 12,
                            background: "linear-gradient(135deg,#10b981,#059669)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#fff",
                            boxShadow: "0 3px 8px rgba(16,185,129,0.2)",
                            fontSize: 18
                        }}>
                            <i className={`bi bi-${isTotal ? "pie-chart-fill" : "geo-fill"}`} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: isMobile ? 15 : 16, fontWeight: 800, color: "#0f172a", lineHeight: 1.2 }}>
                                {isTotal ? "สรุปผลคาร์บอนรวม" : `ผลคาร์บอน: แปลงที่ ${(selectedMapPlotIndex as number) + 1}`}
                            </div>
                            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2, fontWeight: 500 }}>
                                {isTotal ? "ภาพรวมการคำนวณจากทุกแปลง" : "แสดงข้อมูลเฉพาะแปลงที่เลือก"}
                            </div>
                        </div>
                        {!isTotal && (
                            <div
                                onClick={() => onMapPlotSelected?.("total")}
                                style={{
                                    fontSize: isMobile ? 10 : 11,
                                    fontWeight: 700,
                                    color: "#059669",
                                    cursor: "pointer",
                                    padding: isMobile ? "4px 8px" : "6px 12px",
                                    borderRadius: 20,
                                    background: "rgba(16,185,129,0.08)",
                                    border: "1px solid rgba(16,185,129,0.2)",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 4,
                                    transition: "all 0.2s"
                                }}
                            >
                                <i className="bi bi-arrow-left-circle-fill" />
                                กลับหน้ารวม
                            </div>
                        )}
                    </div>



                    <div style={{ display: "flex", gap: 8, width: "100%", marginBottom: 16, alignItems: "center" }}>
                        <button
                            className="prp-btn-primary"
                            onClick={() => handleSave()}
                            disabled={!projectName.trim() || saveState === "saving"}
                            style={{
                                flex: 1.2,
                                height: "42px",
                                padding: 0,
                                margin: 0,
                                boxSizing: "border-box",
                                fontSize: "12.5px",
                                fontWeight: 700,
                                background: "linear-gradient(135deg,#0369a1,#0284c7)",
                                border: "1.5px solid transparent",
                                borderRadius: "14px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: "4px",
                                cursor: !projectName.trim() || saveState === "saving" ? "not-allowed" : "pointer",
                                opacity: !projectName.trim() || saveState === "saving" ? 0.6 : 1,
                                color: "#fff",
                                transition: "all 0.2s",
                                boxShadow: "0 4px 10px rgba(2,132,199,0.2)"
                            }}
                        >
                            {saveState === "saving" ? (
                                <><span className="s1-spin" style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff" }} /> บันทึก...</>
                            ) : saveState === "done" ? (
                                <><i className="bi bi-check-circle-fill" /> บันทึกแล้ว</>
                            ) : (
                                <><i className="bi bi-save" /> บันทึกข้อมูลประมวลผล</>
                            )}
                        </button>
                        <button
                            className="prp-btn-ghost"
                            onClick={() => onStepChange(2)}
                            style={{
                                flex: 1,
                                height: "42px",
                                padding: 0,
                                margin: 0,
                                boxSizing: "border-box",
                                fontSize: "12.5px",
                                fontWeight: 700,
                                color: "#047857",
                                cursor: "pointer",
                                background: "rgba(16, 185, 129, 0.08)",
                                border: "1.5px solid rgba(16, 185, 129, 0.25)",
                                borderRadius: "14px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: "4px",
                                transition: "all 0.2s",
                                outline: "none",
                                boxShadow: "0 2px 5px rgba(16, 185, 129, 0.05)"
                            }}
                            onMouseOver={(e) => {
                                e.currentTarget.style.background = "rgba(16, 185, 129, 0.16)";
                                e.currentTarget.style.borderColor = "rgba(16, 185, 129, 0.45)";
                            }}
                            onMouseOut={(e) => {
                                e.currentTarget.style.background = "rgba(16, 185, 129, 0.08)";
                                e.currentTarget.style.borderColor = "rgba(16, 185, 129, 0.25)";
                            }}
                        >
                            <i className="bi bi-arrow-left-short" style={{ fontSize: "16px", fontWeight: "bold" }} /> ย้อนกลับ
                        </button>
                    </div>
                    {isTotal ? (
                        <>
                            {/* Total summary */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 6, marginBottom: 10 }}>
                                {[
                                    { label: "คาร์บอนรวมปัจจุบัน", val: `${Math.floor(summaryTotalCo2).toLocaleString()} tCO₂`, color: "#0d9488" },
                                ].map(({ label, val, color }) => (
                                    <div key={label} style={{ background: "#fff", borderRadius: 10, padding: "12px 8px", textAlign: "center", border: "1px solid rgba(0,0,0,0.06)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
                                        <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>{label}</div>
                                        <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 800, color }}>{val}</div>
                                    </div>
                                ))}
                            </div>
                            <CarbonBarChart pts={pts} isMobile={isMobile} narrowMode={!isMobile} />
                        </>
                    ) : cr ? (
                        <>
                            {/* Plot info summary */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 6, marginBottom: 10 }}>
                                {[
                                    { label: "คาร์บอนปัจจุบัน", val: `${Math.floor(cr.co2Now).toLocaleString()} tCO₂`, color: "#0d9488" },
                                ].map(({ label, val, color }) => (
                                    <div key={label} style={{ background: "#fff", borderRadius: 10, padding: "12px 8px", textAlign: "center", border: "1px solid rgba(0,0,0,0.06)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
                                        <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>{label}</div>
                                        <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 800, color }}>{val}</div>
                                    </div>
                                ))}
                            </div>

                            <CarbonBarChart pts={pts} isMobile={isMobile} narrowMode={!isMobile} />
                        </>
                    ) : null}

                    {/* Input Details Summary (Collapsible) */}
                    <div style={{ marginTop: 16, background: "#f8fafc", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" }}>
                        <div
                            onClick={() => setShowInputDetails(!showInputDetails)}
                            style={{
                                padding: "12px 14px",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                background: showInputDetails ? "rgba(14,165,233,0.04)" : "transparent"
                            }}
                        >
                            <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", display: "flex", alignItems: "center", gap: 8 }}>
                                <i className="bi bi-file-text" style={{ color: "#0ea5e9" }} /> ข้อมูลที่ใช้ประมวลผล
                            </div>
                            <i className={`bi bi-chevron-${showInputDetails ? "up" : "down"}`} style={{ fontSize: 12, color: "#64748b" }} />
                        </div>

                        {showInputDetails && (
                            <div style={{ padding: "0 14px 14px", fontSize: 12, color: "#475569", borderTop: "1px solid rgba(226,232,240,0.6)" }}>
                                <div style={{ paddingTop: 10 }}>
                                    <div><strong>ชื่อโครงการ:</strong> {projectName || "-"}</div>
                                    <div><strong>พื้นที่รวม:</strong> {totalArea.toFixed(2)} ไร่</div>
                                    <div style={{ marginTop: 8 }}><strong>รายละเอียดแปลง:</strong></div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
                                        {plots.length > 1 && (
                                            <div
                                                onClick={() => onMapPlotSelected?.("total")}
                                                style={{
                                                    padding: "10px 12px",
                                                    background: isTotal ? "rgba(16,185,129,0.06)" : "#fff",
                                                    borderRadius: 8,
                                                    border: isTotal ? "2px solid #10b981" : "1px solid rgba(0,0,0,0.06)",
                                                    cursor: "pointer",
                                                    transition: "all 0.2s",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: 10
                                                }}
                                            >
                                                <div style={{
                                                    width: 24,
                                                    height: 24,
                                                    borderRadius: 6,
                                                    background: isTotal ? "#10b981" : "#f1f5f9",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    color: isTotal ? "#fff" : "#64748b"
                                                }}>
                                                    <i className="bi bi-pie-chart-fill" style={{ fontSize: 12 }} />
                                                </div>
                                                <div style={{ fontWeight: 700, color: isTotal ? "#047857" : "#334155", fontSize: 12 }}>
                                                    ภาพรวมคาร์บอนรวมทุกแปลง ({totalArea.toFixed(2)} ไร่)
                                                </div>
                                            </div>
                                        )}

                                        {plots.map((p, i) => {
                                            const f = plotForms[i];
                                            const crInfo = carbonResults[i];
                                            if (!f || !crInfo) return null;
                                            const isSel = selectedMapPlotIndex === i;
                                            return (
                                                <div
                                                    key={i}
                                                    onClick={() => {
                                                        onMapPlotSelected?.(i);
                                                    }}
                                                    style={{
                                                        padding: "10px 12px",
                                                        background: isSel ? "rgba(16,185,129,0.06)" : "#fff",
                                                        borderRadius: 8,
                                                        border: isSel ? "2px solid #10b981" : "1px solid rgba(0,0,0,0.06)",
                                                        cursor: "pointer",
                                                        transition: "all 0.2s"
                                                    }}
                                                >
                                                    <div style={{ fontWeight: 700, color: isSel ? "#047857" : "#0f172a", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                                                        <i className="bi bi-geo-alt-fill" style={{ color: isSel ? "#10b981" : "#64748b" }} />
                                                        แปลงที่ {i + 1} ({p.areaRai.toFixed(2)} ไร่)
                                                    </div>
                                                    <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 13, color: "#64748b" }}>
                                                        {(f.plantYear || f.variety || f.treeCount || f.spacing) && (
                                                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                                            {f.plantYear && <div>• กรอกข้อมูลเอง: <strong>พ.ศ. {crInfo.plantYearBE}</strong></div>}
                                                        </div>
                                                        )}
                                                        {(f.variety || f.treeCount || f.spacing) && (
                                                        <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 2 }}>
                                                            {f.variety && <div>• พันธุ์ยาง: {crInfo.variety}</div>}
                                                            {f.treeCount && <div>• จำนวนต้น: {crInfo.trees.toLocaleString("th-TH")} ต้น</div>}
                                                            {f.spacing && <div>• ระยะปลูก: {crInfo.spacing} ม.</div>}
                                                        </div>
                                                        )}
                                                    </div>
                                                    {/* Estimated Parameters from backend */}
                                                    {(() => {
                                                        const backendResp = backendResponses?.find(r => r.polygon_id === `plot-${i}`);
                                                        return backendResp?.estimated_parameters
                                                            ? <EstimatedParamsCard params={backendResp.estimated_parameters} />
                                                            : null;
                                                    })()}
                                                    {crInfo.selectedAreaRai !== undefined && (
                                                        <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px dashed rgba(16,185,129,0.15)", fontSize: 13 }}>
                                                            <div style={{ display: "flex", justifyContent: "space-between", color: "#0284c7", fontWeight: 700, marginBottom: 5 }}>
                                                                <span>• พื้นที่ที่เลือกทั้งหมด:</span>
                                                                <span>{crInfo.selectedAreaRai.toFixed(2)} ไร่</span>
                                                            </div>
                                                            {crInfo.luBreakdown && Object.keys(crInfo.luBreakdown).length > 0 && (
                                                                <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingLeft: 8 }}>
                                                                    {Object.entries(crInfo.luBreakdown).map(([cls, info]) => (
                                                                        <div key={cls} style={{ display: "flex", justifyContent: "space-between", color: "#059669", fontWeight: 600 }}>
                                                                            <span>↳ {cls}{info.desc ? ` ${info.desc}` : ""}:</span>
                                                                            <span>{info.rai.toFixed(2)} ไร่ ({info.pct}%)</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                </div>
            );
        }
    }

    return null;
}
