"use client";
import { useState, useMemo, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { carbonForAge } from "@/lib/map-utils";
import { useAuth } from "@/lib/auth-context";
import { estimateCarbon, type PlantationPolygon } from "@/lib/carbon-api";
import { CarbonBarChart, buildBarPoints, carbonCo2 } from "./CarbonBarChart";


// ── Types ─────────────────────────────────────────────────────────────────
export interface CarbonResultForMap {
    plotIdx: number;
    co2Now: number;
}

type Props = {
    searchRunning: boolean;
    searchErr: string | null;
    searchCount: number | null;
    searchTruncated: boolean;
    parcelFeatures: GeoJSON.Feature[];
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
    onCarbonResults?: (results: CarbonResultForMap[]) => void;
};

type PlotTab = "analyze" | "forecast";
type ForecastYr = 3 | 5 | 7;
type SubStep = "form" | "carbon" | "save";

interface PlotFormData {
    plantYear: string;
    treeCount: string;
    variety: string;
    spacing: string;
}

const VARIETY_OPTIONS = [
    "RRIM 600", "GT1", "BPM 24", "PB 235", "PB 260",
    "RRIT 408", "RRIT 251", "สงขลา 36", "RRIM 712", "อื่นๆ",
];
const SPACING_OPTIONS = ["2.5*8", "3*7", "2.5*7", "3*6"];
const YEAR_OPTIONS = Array.from({ length: 50 }, (_, i) => String(new Date().getFullYear() + 543 - i));

interface CarbonResult {
    plotIdx: number;
    age: number;
    plantYearBE: number;
    trees: number;
    spacing: string;
    variety: string;
    co2Now: number;
    source: "user" | "backend";
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
const CURRENT_CE = new Date().getFullYear();
const CURRENT_BE = CURRENT_CE + 543;

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
function parseRai(v: unknown): number {
    if (!v) return 0;
    const s = String(v).trim();
    const m = s.match(/^(\d+)-(\d+)-(\d+)/);
    if (m) return +m[1] + +m[2] * 0.25 + +m[3] / 400;
    return parseFloat(s) || 0;
}

function computePlot(feat: GeoJSON.Feature): PlotInfo {
    const p = (feat.properties ?? {}) as Record<string, unknown>;
    const areaRai = parseRai(p.grow_area);

    // Determine backend plant year
    let bPlantYear = Number(p.gee_plant_year || p.grow_year || 0);
    // Determine backend age
    let bAge = Number(p.gee_age || p.rubber_age || 0);

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
        co2: Number(p.gee_carbon ?? 0),
        confidence: Number(p.gee_confidence ?? 0),
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

function forecastPts(age: number, trees: number, years: ForecastYr) {
    return Array.from({ length: years + 1 }, (_, i) => ({
        yearBE: CURRENT_BE + i,
        co2: trees > 0 ? carbonForAge(age + i, trees).co2 : 0,
    }));
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
                            {/* age label below */}
                            <text x={cx} y={BASE_Y + 22} textAnchor="middle" fontSize={isMobile ? 16 : 16}
                                fontWeight={isMain ? "800" : "500"}
                                fill={isMain ? "#059669" : isHov ? "#10b981" : "#94a3b8"}>
                                {a}
                            </text>
                            {/* age unit */}
                            <text x={cx} y={BASE_Y + 40} textAnchor="middle" fontSize={isMobile ? 13 : 12} fill="#cbd5e1" fontWeight="400">ปี</text>

                            {/* tooltip */}
                            {isHov && (
                                <g pointerEvents="none">
                                    <rect x={ttLeft} y={ttTop} width={ttW} height={ttH + 10} rx={9} fill="#064e3b" opacity={0.95} />
                                    <text x={ttLeft + ttW / 2} y={ttTop + 18} textAnchor="middle" fontSize={12} fill="#6ee7b7" fontWeight="600">
                                        อายุ {a} ปี · {pct}%
                                    </text>
                                    <text x={ttLeft + ttW / 2} y={ttTop + 38} textAnchor="middle" fontSize={15} fill="#fff" fontWeight="800">
                                        {co2Val > 0 ? `${co2Val.toLocaleString("th-TH", { maximumFractionDigits: 0 })} tCO₂` : "—"}
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
                {Math.round(maxV).toLocaleString()}
            </text>
            <text x={PL + iW + 8} y={PT + iH + 4} fontSize={isMobile ? 12 : 11} fill="#6b9e7e" textAnchor="start">
                {Math.round(minV).toLocaleString()}
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
                            {hp.co2.toLocaleString("th-TH", { maximumFractionDigits: 0 })} tCO₂
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

// ── Main component ─────────────────────────────────────────────────────────
export function ParcelResultsPanel({
    searchRunning,
    searchErr,
    searchCount,
    searchTruncated,
    parcelFeatures,
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
    onCarbonResults,
}: Props) {
    const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
    const [plotTabs, setPlotTabs] = useState<Record<number, PlotTab>>({});
    const [forecastYrs, setForecastYrs] = useState<Record<number, ForecastYr>>({});
    const [summaryFcYrs, setSummaryFcYrs] = useState<ForecastYr>(7);
    const { user } = useAuth();
    const router = useRouter();

    const plots = useMemo(() => parcelFeatures.map(computePlot), [parcelFeatures]);
    const totalArea = useMemo(() => plots.reduce((s, p) => s + p.areaRai, 0), [plots]);
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
    const [plotForms, setPlotForms] = useState<PlotFormData[]>([]);
    const [carbonResults, setCarbonResults] = useState<CarbonResult[]>([]);
    const [processingCarbon, setProcessingCarbon] = useState(false);

    // Initialize plotForms automatically when ready
    useEffect(() => {
        if (searchCount !== null && !searchRunning && !searchErr && plots.length > 0 && plotForms.length === 0) {
            setPlotForms(parcelFeatures.map((feat) => {
                const props = feat.properties as any || {};
                return {
                    plantYear: props.plantYearBE ? String(props.plantYearBE) : "",
                    treeCount: props.trees ? String(props.trees) : "",
                    variety: props.variety || "",
                    spacing: props.spacing || "",
                };
            }));
        }
    }, [searchCount, searchRunning, searchErr, plots, plotForms.length, parcelFeatures]);

    const handleProcessCarbon = async () => {
        setProcessingCarbon(true);
        const CURRENT_BE_NOW = new Date().getFullYear() + 543;

        // Build plantation polygons for API call
        const polygonsToEstimate: PlantationPolygon[] = plots.map((p, i) => {
            const form = plotForms[i];
            const feat = parcelFeatures[i];
            const userPlantYear = form?.plantYear ? parseInt(form.plantYear) : null;
            const userTrees = form?.treeCount ? parseInt(form.treeCount) : null;
            const userSpacing = form?.spacing || null;
            const userVariety = form?.variety || null;

            return {
                id: `plot_${i}`,
                geometry: feat.geometry,
                year_of_planting: userPlantYear || (p.plantYearBE > 0 ? p.plantYearBE : null),
                rubber_clone: userVariety || "RRIM 600",
                tree_count: userTrees || (p.areaRai > 0 ? Math.round(p.areaRai * 76) : null),
                spacing_system: userSpacing || "3*7",
            };
        });

        try {
            // Call the real backend API
            const apiResults = await estimateCarbon(polygonsToEstimate);

            // Convert API results to CarbonResult format
            const results: CarbonResult[] = plots.map((p, i) => {
                const form = plotForms[i];
                const apiResult = apiResults[i];
                const userPlantYear = form?.plantYear ? parseInt(form.plantYear) : 0;
                const userTrees = form?.treeCount ? parseInt(form.treeCount) : 0;

                const userAge = userPlantYear > 0 ? CURRENT_BE_NOW - userPlantYear : 0;
                const finalAge = userAge > 0 ? userAge : (p.age > 0 ? p.age : 5);
                const finalPlantYear = userPlantYear > 0 ? userPlantYear : (p.plantYearBE > 0 ? p.plantYearBE : CURRENT_BE_NOW - finalAge);

                const estimatedTrees = Math.round(p.areaRai * 76);
                const finalTrees = userTrees > 0 ? userTrees : estimatedTrees;

                const finalSpacing = form?.spacing || "3*7";
                const finalVariety = form?.variety || "RRIM 600";

                // Get CO2 from API if available, fall back to mockup calculation
                let co2Now = 0;
                if (apiResult?.carbon_profile && apiResult.carbon_profile.length > 0) {
                    // Use the current year CO2 from API (first entry or matching age)
                    const currentYearData = apiResult.carbon_profile[0];
                    co2Now = currentYearData?.total_carbon_tCO2e || 0;
                } else {
                    // Fall back to mockup calculation
                    co2Now = (finalAge > 0 && finalTrees > 0) ? carbonCo2(finalAge, finalTrees, finalSpacing) : 0;
                }

                return {
                    plotIdx: i,
                    age: finalAge,
                    plantYearBE: finalPlantYear,
                    trees: finalTrees,
                    spacing: finalSpacing,
                    variety: finalVariety,
                    co2Now,
                    source: (userPlantYear > 0 || userTrees > 0) ? "user" : "backend",
                };
            });

            setCarbonResults(results);
            onCarbonResults?.(results.map(r => ({ plotIdx: r.plotIdx, co2Now: r.co2Now })));
            if (onMapPlotSelected) onMapPlotSelected("total");
            setSubStep("carbon");
            onStepChange(3);
        } catch (error) {
            console.error("Failed to estimate carbon:", error);
            // Fall back to mockup calculation on error
            const results: CarbonResult[] = plots.map((p, i) => {
                const form = plotForms[i];
                const userPlantYear = form?.plantYear ? parseInt(form.plantYear) : 0;
                const userTrees = form?.treeCount ? parseInt(form.treeCount) : 0;
                const userSpacing = form?.spacing || "";
                const userVariety = form?.variety || "";

                const userAge = userPlantYear > 0 ? CURRENT_BE_NOW - userPlantYear : 0;
                const finalAge = userAge > 0 ? userAge : (p.age > 0 ? p.age : 5);
                const finalPlantYear = userPlantYear > 0 ? userPlantYear : (p.plantYearBE > 0 ? p.plantYearBE : CURRENT_BE_NOW - finalAge);
                const estimatedTrees = Math.round(p.areaRai * 76);
                const finalTrees = userTrees > 0 ? userTrees : estimatedTrees;
                const finalSpacing = userSpacing || "3*7";
                const finalVariety = userVariety || "RRIM 600";
                const co2Now = (finalAge > 0 && finalTrees > 0) ? carbonCo2(finalAge, finalTrees, finalSpacing) : 0;

                return {
                    plotIdx: i,
                    age: finalAge,
                    plantYearBE: finalPlantYear,
                    trees: finalTrees,
                    spacing: finalSpacing,
                    variety: finalVariety,
                    co2Now,
                    source: (userPlantYear > 0 || userTrees > 0) ? "user" : "backend",
                };
            });
            setCarbonResults(results);
            onCarbonResults?.(results.map(r => ({ plotIdx: r.plotIdx, co2Now: r.co2Now })));
            if (onMapPlotSelected) onMapPlotSelected("total");
            setSubStep("carbon");
            onStepChange(3);
        } finally {
            setProcessingCarbon(false);
        }
    };


    if (!(searchRunning || searchErr || searchCount !== null)) return null;

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
            const newPlotIds = new Set(newPlots.map(p => p.id));
            const filteredExisting = existing.filter((p: any) => !newPlotIds.has(p.id));
            localStorage.setItem(key, JSON.stringify([...newPlots, ...filteredExisting]));
            const globalKey = "global_saved_plots";
            const globalExisting = JSON.parse(localStorage.getItem(globalKey) || "[]");
            const filteredGlobalExisting = globalExisting.filter((p: any) => !newPlotIds.has(p.id));
            localStorage.setItem(globalKey, JSON.stringify([...newPlots, ...filteredGlobalExisting]));
        } catch (e) { console.error(e); }
        setSaveState("done");
        setTimeout(() => router.push("/my-plots"), 1500);
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
                {onBack && (
                    <button className="mds-btn mds-btn-soft" style={{ marginTop: 12 }} onClick={onBack}>
                        <i className="bi bi-arrow-left me-1" /> กลับขั้นตอนที่ 1
                    </button>
                )}
            </div>
        );
    }

    if (searchCount === null) return null;

    // ── Step 2: Data entry form ────────────────────────────────
    if (currentStep === 2) {
        const updateForm = (idx: number, field: keyof PlotFormData, val: string) => {
            setPlotForms(prev => prev.map((f, i) => i === idx ? { ...f, [field]: val } : f));
        };
        return (
            <div className="prp-shell">
                <div className="prp-header-block">
                    <div className="prp-main-title" style={{ fontSize: isMobile ? 16 : 18 }}>
                        <i className="bi bi-pencil-square me-2" style={{ color: "#10b981" }} />กรอกข้อมูลแปลง
                    </div>
                    <div className="prp-subtitle">กรอกหรือข้ามได้ — ข้อมูลจะนำไปประมวลผลคาร์บอน</div>
                </div>

                {/* Project name — shared */}
                <div style={{ background: "linear-gradient(135deg,#f0fdf4,#ecfdf5)", borderRadius: 14, padding: isMobile ? "14px 14px" : "16px 20px", marginBottom: 16, border: "1px solid rgba(16,185,129,0.18)" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#059669", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                        <i className="bi bi-folder2-open" /> ชื่อโครงการ  <span style={{ color: "#ef4444" }}>*</span>
                    </div>
                    <input className="prp-input" style={{ marginBottom: 0 }} placeholder="เช่น โครงการที่1" value={projectName} onChange={e => setProjectName(e.target.value)} />
                </div>

                {/* Per-plot fields */}
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {plots.map((p, i) => {
                        const form = plotForms[i] || { plantYear: "", treeCount: "", variety: "", spacing: "2.5*8" };
                        return (
                            <div key={i} style={{ background: "#fff", borderRadius: 14, border: "1px solid rgba(16,185,129,0.15)", overflow: "hidden", boxShadow: "0 2px 10px rgba(0,0,0,0.04)" }}>
                                {/* Plot header */}
                                <div style={{ background: "linear-gradient(135deg,rgba(16,185,129,0.08),rgba(5,150,105,0.04))", padding: "10px 14px", borderBottom: "1px solid rgba(16,185,129,0.1)", display: "flex", alignItems: "center", gap: 10 }}>
                                    <div style={{ width: 28, height: 28, borderRadius: 8, background: "#10b981", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13 }}>{i + 1}</div>
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a" }}>แปลงที่ {i + 1}</div>
                                        <div style={{ fontSize: 11, color: "#64748b" }}>{p.areaRai > 0 ? `${p.areaRai.toFixed(2)} ไร่` : "—"}</div>
                                    </div>
                                </div>
                                {/* Fields grid */}
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
                                        >
                                            <option value="">— เลือกปีที่เริ่มปลูก —</option>
                                            {YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
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
                                        />
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
                                        >
                                            <option value="">— เลือกสายพันธุ์ยาง —</option>
                                            {VARIETY_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                                        </select>
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
                                        >
                                            <option value="">— เลือกระยะปลูก —</option>
                                            {SPACING_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Action buttons */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>
                    <button
                        className="prp-btn-primary"
                        onClick={handleProcessCarbon}
                        disabled={!projectName.trim() || processingCarbon}
                        style={{
                            background: projectName.trim() && !processingCarbon ? "linear-gradient(135deg,#10b981,#059669)" : "#cbd5e1",
                            cursor: projectName.trim() && !processingCarbon ? "pointer" : "not-allowed",
                            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                        }}
                    >
                        {processingCarbon ? (
                            <>
                                <span style={{
                                    width: 16, height: 16, border: "2.5px solid rgba(255,255,255,0.4)",
                                    borderTopColor: "#fff", borderRadius: "50%",
                                    display: "inline-block",
                                    animation: "prp-spin 0.7s linear infinite",
                                }} />
                                กำลังวิเคราะห์คาร์บอน...
                            </>
                        ) : (
                            <><i className="bi bi-graph-up-arrow" />ประมวลผลคาร์บอน</>
                        )}
                    </button>
                    <button
                        className="prp-btn-primary"
                        onClick={() => handleSave([])}
                        disabled={!projectName.trim() || saveState === "saving"}
                        style={{
                            background: projectName.trim() ? "linear-gradient(135deg,#0369a1,#0284c7)" : "#cbd5e1",
                            cursor: projectName.trim() ? "pointer" : "not-allowed"
                        }}
                    >
                        {saveState === "saving" ? (
                            <><span className="s1-spin" style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", marginRight: 8 }} /> กำลังบันทึก...</>
                        ) : (
                            <><i className="bi bi-floppy-disk me-2" />บันทึกลงฐานข้อมูล</>
                        )}
                    </button>
                    <button className="prp-btn-ghost" onClick={onReset}>
                        <i className="bi bi-x-circle me-1" />ยกเลิก
                    </button>
                </div>
            </div>
        );
    }

    // ── Step 3: Carbon Results & Save ────────────────────────────────
    if (currentStep === 3) {
        // ── sub: carbon results ──
        if (subStep === "carbon") {
            const isTotal = selectedMapPlotIndex === "total";
            const cr = typeof selectedMapPlotIndex === "number" ? carbonResults[selectedMapPlotIndex] : null;

            let pts: any[] = [];
            let summaryTotalCo2 = 0;
            let summaryTotalTrees = 0;

            if (isTotal && carbonResults.length > 0) {
                const CURRENT_BE = new Date().getFullYear() + 543;
                summaryTotalTrees = carbonResults.reduce((sum, c) => sum + c.trees, 0);
                summaryTotalCo2 = carbonResults.reduce((sum, c) => sum + c.co2Now, 0);

                // Track each plot independently through 35-year simulation
                const plotStates = carbonResults.map(c => ({ continuousAge: c.age }));
                const N = plotStates.length;

                for (let i = 0; i < 35; i++) {
                    const yearBE = CURRENT_BE + i;
                    let totalCo2 = 0, totalContinuousAge = 0;
                    plotStates.forEach((state, idx) => {
                        totalCo2 += carbonCo2(state.continuousAge, carbonResults[idx].trees, carbonResults[idx].spacing);
                        totalContinuousAge += state.continuousAge;
                        state.continuousAge++;
                    });
                    const avgContinuousAge = Math.round(totalContinuousAge / N);
                    if (avgContinuousAge > 35) break;

                    pts.push({
                        age: avgContinuousAge,
                        yearBE,
                        co2: totalCo2,
                        cycle: Math.floor(i / 7),
                        cycleAge: avgContinuousAge,
                    });
                }
            } else if (cr) {
                pts = buildBarPoints(cr.age, cr.plantYearBE, cr.trees, cr.spacing);
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
                                    fontSize: 11,
                                    fontWeight: 700,
                                    color: "#059669",
                                    cursor: "pointer",
                                    padding: "6px 12px",
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

                    {isTotal ? (
                        <>
                            {/* Total CO₂ */}
                            <div style={{ background: "#fff", borderRadius: 10, padding: "12px 8px", textAlign: "center", border: "1px solid rgba(0,0,0,0.06)", marginBottom: 10 }}>
                                <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>คาร์บอนรวมปัจจุบัน</div>
                                <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 800, color: "#0d9488" }}>{summaryTotalCo2.toFixed(1)} tCO₂</div>
                            </div>

                            {/* Per-parcel breakdown */}
                            {carbonResults.length > 0 && (
                                <div style={{ marginBottom: 10, borderRadius: 10, border: "1px solid rgba(0,0,0,0.06)", overflow: "hidden", background: "#fff" }}>
                                    {carbonResults.map((cr, i) => (
                                        <div
                                            key={i}
                                            onClick={() => {
                                                onMapPlotSelected?.(i);
                                                if (parcelFeatures[i]) onFlyTo(parcelFeatures[i]);
                                            }}
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 10,
                                                padding: "9px 12px",
                                                borderBottom: i < carbonResults.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none",
                                                cursor: "pointer",
                                                transition: "background 0.15s",
                                            }}
                                            onMouseEnter={e => (e.currentTarget.style.background = "#f0fdf4")}
                                            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                                        >
                                            <div style={{
                                                width: 26, height: 26, borderRadius: 8,
                                                background: "linear-gradient(135deg, #34d399, #059669)",
                                                color: "#fff", fontSize: 12, fontWeight: 800,
                                                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                                            }}>
                                                {i + 1}
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: 12, color: "#374151", fontWeight: 600 }}>แปลงที่ {i + 1}</div>
                                                <div style={{ fontSize: 10, color: "#94a3b8" }}>อายุ {cr.age} ปี · {cr.trees.toLocaleString()} ต้น</div>
                                            </div>
                                            <div style={{ textAlign: "right", flexShrink: 0 }}>
                                                <div style={{ fontSize: 13, fontWeight: 800, color: "#0d9488" }}>{cr.co2Now.toFixed(1)}</div>
                                                <div style={{ fontSize: 10, color: "#94a3b8" }}>tCO₂e</div>
                                            </div>
                                            <i className="bi bi-chevron-right" style={{ fontSize: 11, color: "#cbd5e1" }} />
                                        </div>
                                    ))}
                                </div>
                            )}

                            <CarbonBarChart pts={pts} isMobile={isMobile} narrowMode={!isMobile} />
                            <div style={{ fontSize: 10, color: "#94a3b8", textAlign: "center", marginTop: 4 }}>
                                hover บนแท่งเพื่อดูรายละเอียด
                            </div>
                        </>
                    ) : cr ? (
                        <>
                            {/* Plot info summary */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 6, marginBottom: 10 }}>
                                {[
                                    { label: "คาร์บอนปัจจุบัน", val: `${cr.co2Now.toFixed(1)} tCO₂`, color: "#0d9488" },
                                ].map(({ label, val, color }) => (
                                    <div key={label} style={{ background: "#fff", borderRadius: 10, padding: "8px 8px", textAlign: "center", border: "1px solid rgba(0,0,0,0.06)", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                                        <div style={{ fontSize: isMobile ? 16 : 17, fontWeight: 800, color }}>{val}</div>
                                        <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500 }}>{label}</div>
                                    </div>
                                ))}
                            </div>


                            {/* Bar chart */}
                            <CarbonBarChart pts={pts} isMobile={isMobile} narrowMode={!isMobile} />

                            <div style={{ fontSize: 10, color: "#94a3b8", textAlign: "center", marginTop: 4 }}>
                                hover บนแท่งเพื่อดูรายละเอียด · แนวโน้มคาร์บอนรายแปลง
                            </div>
                        </>
                    ) : null}

                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
                        <button
                            className="prp-btn-primary"
                            onClick={() => handleSave()}
                            disabled={!projectName.trim() || saveState === "saving"}
                            style={{ background: "linear-gradient(135deg,#0369a1,#0284c7)" }}
                        >
                            {saveState === "saving" ? (
                                <><span className="s1-spin" style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", marginRight: 8 }} /> กำลังบันทึก...</>
                            ) : saveState === "done" ? (
                                <><i className="bi bi-check-circle-fill me-2" />บันทึกสำเร็จ!</>
                            ) : (
                                <><i className="bi bi-floppy-disk me-2" />บันทึกผลลงฐานข้อมูล</>
                            )}
                        </button>
                        <button className="prp-btn-ghost" onClick={() => onStepChange(2)}>← กลับแก้ไขข้อมูล</button>
                        <button className="prp-btn-text" onClick={onReset}><i className="bi bi-x-circle me-1" />ไม่บันทึก</button>
                    </div>
                </div>
            );
        }
    }

    return null;
}
