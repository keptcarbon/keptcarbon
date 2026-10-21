"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Calculator, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { simulateCarbon, type SimulationYearlyPoint } from "@/lib/carbon-api";
import { carbon2, ciCarbon2, creditTonnes, formatArea, formatCarbon } from "@/lib/utils";
import { CURRENT_CE, OLD_YEAR_OPTIONS } from "@/app/components/organisms/ParcelResultsPanel/utils";
import { CarbonBarChart, type BarPoint } from "@/app/components/organisms/ParcelResultsPanel/CarbonBarChart";

/**
 * Landing-page preliminary carbon assessment: no map, just province + year of
 * planting + area (ไร่/งาน/ตร.วา) or tree count per plot. Each plot is
 * sent to /carbon/sim with the province's configured defaults. Carbon is
 * rounded to 2 decimals per plot, then summed (see carbon2); only block 4
 * rounds to whole tonnes (TGO): the 7-year gain down, its CI up.
 */

type ProvinceDefaults = {
  clone: string | null;
  spacing: string | null;
  growthModel: string | null;
  allometry: string | null;
  biomassProfileVersion: string | null;
  /** tbl_tree_density.tree_density_ha for `spacing` */
  treeDensityHa: number | null;
};

type ServiceProvince = { pCode: string; provinceTh: string; regionTh: string; defaults: ProvinceDefaults };

type PlotRow = { key: number; year: string; rai: string; ngan: string; wah: string; trees: string };

type PlotResult = {
  index: number; yearBE: number; areaM2: number; treeCount: number; carbon: number;
  /** ± half-width of the biomass 95% CI, 2 decimals rounded up */
  ci: number;
  /** The user's count, when it was replaced by the area-based count. */
  rejectedTrees: number | null;
  /** This year .. +PROJECTION_YEARS, already rounded per plot (see projectPlot). */
  projection: YearValue[];
  /** Planting year .. age 35, for the total-carbon chart (see plotProfile). */
  profile: BarPoint[];
};

type YearValue = { year: number; stock: number; stockCi: number; gain: number; gainCi: number };

/** Years after the base (current) year shown in the projection table. */
const PROJECTION_YEARS = 7;
/** Column shading for t1..t7 (index 1..7), light to dark green; the base year stays plain. */
const YEAR_SHADES = ["#e8f5e9", "#c8e6c9", "#a5d6a7", "#81c784", "#4caf50", "#388e3c", "#1b5e20"];
function yearShade(i: number): React.CSSProperties | undefined {
  if (i < 1) return undefined;
  return { backgroundColor: YEAR_SHADES[i - 1], color: i >= 5 ? "#fff" : undefined };
}

/** Block 4 inputs, in display order; the rest are still placeholders. */
const ESTIMATE_FIELDS: { label: string; unit?: string; defaultValue: string; note?: string; computed?: "gain7" | "revenue";
  /** Box background (default bg-secondary) and, for computed boxes, value color (default text-primary). */
  boxClass?: string; valueClass?: string }[] = [
  { label: "ราคาขายคาร์บอนเครดิตสมมติ", unit: "บาท/tCO₂eq", defaultValue: "300", note: "กำหนดราคาสำหรับจำลองรายได้ สามารถปรับเปลี่ยนได้",
    // Amber, as the economics panel's price badges: a value the user sets.
    boxClass: "border border-amber-200 bg-amber-50" },
  // Read-only: the all-plots gain at t7, as in table 2.
  { label: `ปริมาณคาร์บอนกักเก็บเพิ่มขึ้นในช่วง ${PROJECTION_YEARS} ปี`, unit: "tCO₂eq", defaultValue: "", computed: "gain7",
    // Brand dark green (--kc-green-dark) border on the default green tint.
    boxClass: "border border-primary bg-secondary" },
  // Read-only: price (box 1) x the 7-year gain (box 2).
  { label: "รายได้ประมาณการ", unit: "บาท", defaultValue: "", computed: "revenue",
    // Brand teal (--kc-teal), the second stop of --kc-grad.
    boxClass: "border border-[#0d9488]/25 bg-[#0d9488]/[0.08]", valueClass: "text-[#0d9488]" },
];

// Location is preset and its selects hidden for now (kept in the markup).
const DEFAULT_REGION = "ภาคตะวันออก";
const DEFAULT_PROVINCE_TH = "ระยอง";

const M2_PER_RAI = 1600;
const M2_PER_NGAN = 400;
const M2_PER_WAH = 4;

let nextKey = 0;
const emptyRow = (): PlotRow => ({ key: nextKey++, year: "", rai: "", ngan: "", wah: "", trees: "" });
/** Example plots the form opens with (planting year พ.ศ., area ไร่ or tree count). */
const DEFAULT_PLOTS: Partial<Omit<PlotRow, "key">>[] = [
  { year: "2567", rai: "50" },
  { year: "2557", trees: "2000" },
  { year: "2547", rai: "25" },
];

const fieldClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60";
const labelClass = "mb-1.5 block text-sm font-medium text-foreground";
const mobileLabelClass = "mb-1 block text-xs font-medium text-muted-foreground md:hidden";
// Red asterisk for required inputs.
const Req = () => <span className="ml-0.5 text-destructive" aria-hidden="true">*</span>;
const rowGrid = "md:grid-cols-[1.5rem_1.4fr_1fr_1fr_1fr_1.2fr_2.25rem]";

const num = (v: string) => (v.trim() === "" ? 0 : Number(v));
const isBlank = (r: PlotRow) => !r.year && !r.rai && !r.ngan && !r.wah && !r.trees;
const areaM2 = (r: PlotRow) => num(r.rai) * M2_PER_RAI + num(r.ngan) * M2_PER_NGAN + num(r.wah) * M2_PER_WAH;

// Same 5% as the backend's TREE_COUNT_VALIDATION_THRESHOLD (TreeService).
const TREE_COUNT_TOLERANCE = 0.05;

/**
 * The tree count to assess with, following TreeService.get_tree_count_user_input:
 * no user count -> derived from area (the backend does it, so null); no area
 * -> the user's count as-is; otherwise the user's count unless it differs
 * from area x density by more than 5% ABOVE it, in which case the area-based
 * count is used instead. Lower counts are always trusted -- conservative, as
 * TGO practice requires.
 */
function resolveTreeCount(r: PlotRow, densityHa: number): { treeCount: number | null; rejected: number | null } {
  if (r.trees.trim() === "") return { treeCount: null, rejected: null };
  const user = Number(r.trees);
  const calculated = Math.floor((areaM2(r) / 10000) * densityHa);
  if (calculated === 0) return { treeCount: user, rejected: null };
  if ((user - calculated) / calculated <= TREE_COUNT_TOLERANCE) return { treeCount: user, rejected: null };
  return { treeCount: calculated, rejected: user };
}

/**
 * One plot's stock and sequestration (gain over the current year) for this
 * year .. +PROJECTION_YEARS, to 2 decimals per plot before plots are summed
 * (CIs rounded up). Gain comes from the rounded stocks, so it always equals
 * stock(t) − stock(base) as shown. The gain CI subtracts the base year's
 * bounds bound by bound, as the backend's assessment does (carbon_service).
 */
function projectPlot(points: SimulationYearlyPoint[] | null | undefined): YearValue[] {
  const byYear = new Map((points ?? []).map((p) => [p.year, p]));
  const base = byYear.get(CURRENT_CE);
  return Array.from({ length: PROJECTION_YEARS + 1 }, (_, i) => {
    const year = CURRENT_CE + i;
    const p = byYear.get(year);
    if (!p || !base) return { year, stock: 0, stockCi: 0, gain: 0, gainCi: 0 };
    const lowerGain = p.carbon_stock_ci_lower_tCO2e - base.carbon_stock_ci_lower_tCO2e;
    const upperGain = p.carbon_stock_ci_upper_tCO2e - base.carbon_stock_ci_upper_tCO2e;
    const stock = carbon2(p.carbon_stock_tCO2e);
    return {
      year,
      stock,
      stockCi: ciCarbon2((p.carbon_stock_ci_upper_tCO2e - p.carbon_stock_ci_lower_tCO2e) / 2),
      gain: carbon2(stock - carbon2(base.carbon_stock_tCO2e)),
      gainCi: ciCarbon2(Math.abs(upperGain - lowerGain) / 2),
    };
  });
}

/** Chart rows stop at this age, like a saved plot's carbon profile. */
const PROFILE_MAX_AGE = 35;

/**
 * One plot's chart rows from its planting year to age 35, rounded per plot
 * like projectPlot (gain is over the current year).
 */
function plotProfile(points: SimulationYearlyPoint[] | null | undefined, plantYearCE: number): BarPoint[] {
  const base = (points ?? []).find((p) => p.year === CURRENT_CE);
  return (points ?? [])
    .filter((p) => p.year >= plantYearCE && p.year - plantYearCE <= PROFILE_MAX_AGE)
    .map((p) => {
      const age = p.year - plantYearCE;
      const yearAt = p.year - CURRENT_CE;
      const ci = ciCarbon2((p.carbon_stock_ci_upper_tCO2e - p.carbon_stock_ci_lower_tCO2e) / 2);
      const gainCi = base
        ? ciCarbon2(Math.abs((p.carbon_stock_ci_upper_tCO2e - base.carbon_stock_ci_upper_tCO2e) - (p.carbon_stock_ci_lower_tCO2e - base.carbon_stock_ci_lower_tCO2e)) / 2)
        : 0;
      return {
        age, yearBE: p.year + 543, year_at: yearAt,
        co2: carbon2(p.carbon_stock_tCO2e), ci,
        gainValue: base ? carbon2(carbon2(p.carbon_stock_tCO2e) - carbon2(base.carbon_stock_tCO2e)) : 0,
        gainCi,
        cycle: Math.floor(yearAt / 7), cycleAge: age, errorMargin: ci, isAgeValid: true,
      };
    });
}

/**
 * All plots summed per calendar year over the union of their years, as
 * ProjectCarbonSummary builds the project chart; age is the plots' average.
 */
function sumProfiles(profiles: BarPoint[][]): BarPoint[] {
  const byYear = new Map<number, { pt: BarPoint; ageSum: number; n: number }>();
  for (const pts of profiles) {
    for (const p of pts) {
      const e = byYear.get(p.yearBE);
      if (!e) { byYear.set(p.yearBE, { pt: { ...p }, ageSum: p.age, n: 1 }); continue; }
      e.pt.co2 += p.co2; e.pt.ci += p.ci; e.pt.errorMargin += p.ci;
      e.pt.gainValue += p.gainValue; e.pt.gainCi += p.gainCi;
      e.ageSum += p.age; e.n += 1;
    }
  }
  return [...byYear.values()]
    .map(({ pt, ageSum, n }) => ({
      ...pt, co2: carbon2(pt.co2), ci: carbon2(pt.ci), errorMargin: carbon2(pt.errorMargin),
      gainValue: carbon2(pt.gainValue), gainCi: carbon2(pt.gainCi),
      age: Math.round(ageSum / n), cycleAge: Math.round(ageSum / n),
    }))
    .sort((a, b) => a.yearBE - b.yearBE);
}

/** Returns an error message for a partly filled row, or null when it is valid. */
function rowError(r: PlotRow): string | null {
  if (!r.year) return "เลือกปีที่ปลูก";
  for (const v of [r.rai, r.ngan, r.wah, r.trees]) {
    if (v.trim() !== "" && (!Number.isFinite(Number(v)) || Number(v) < 0)) return "กรอกตัวเลขที่ไม่ติดลบ";
  }
  if (num(r.ngan) >= 4) return "งานต้องน้อยกว่า 4";
  if (num(r.wah) >= 100) return "ตารางวาต้องน้อยกว่า 100";
  const hasTrees = r.trees.trim() !== "";
  if (hasTrees && (!Number.isInteger(Number(r.trees)) || Number(r.trees) <= 0)) return "จำนวนต้นต้องเป็นจำนวนเต็มมากกว่า 0";
  // Either is enough: with a tree count the backend ignores area; without
  // one it derives the trees from area and the province's spacing.
  if (areaM2(r) <= 0 && !hasTrees) return "กรอกพื้นที่ หรือ จำนวนต้น";
  return null;
}

/** Years each plot's bar spans in the age chart, from its current age. */
const AGE_BAR_SPAN = 8;
const AGE_AXIS_MAX = 35;

/**
 * One horizontal bar per plot on a rubber-age axis (0..35): from the plot's
 * age this year to age + AGE_BAR_SPAN, clipped to the axis.
 */
function PlotAgeChart({ results }: { results: PlotResult[] }) {
  const [hover, setHover] = useState<number | null>(null);
  // useId output has colons, which break url(#…) references.
  const gradId = `age${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const currentBE = CURRENT_CE + 543;
  const bars = results.map((r) => {
    // Clamped so a plot older than the axis still draws at its right edge.
    const age = Math.min(Math.max(0, currentBE - r.yearBE), AGE_AXIS_MAX);
    return { index: r.index, age, end: Math.min(age + AGE_BAR_SPAN, AGE_AXIS_MAX), rawAge: currentBE - r.yearBE, projection: r.projection, areaM2: r.areaM2 };
  });

  // Left margin = widest "แปลง X (… ไร่)" label, measured after render, so the axis starts right after it.
  const svgRef = useRef<SVGSVGElement>(null);
  const [labelW, setLabelW] = useState(150);
  useLayoutEffect(() => {
    const texts = svgRef.current?.querySelectorAll<SVGTextElement>("text[data-plot-label]") ?? [];
    const widest = Math.max(0, ...Array.from(texts, (t) => t.getComputedTextLength()));
    if (widest > 0) setLabelW(Math.ceil(widest));
  }, [results]);

  const W = 1000, ROW = 30, BAR = 14, PL = labelW + 12, PR = 16, PT = 8, PB = 40;
  const iW = W - PL - PR;
  const H = PT + bars.length * ROW + PB;
  const x = (age: number) => PL + (age / AGE_AXIS_MAX) * iW;
  const ticks = Array.from({ length: AGE_AXIS_MAX / 5 + 1 }, (_, i) => i * 5);

  const hb = hover !== null ? bars[hover] : null;
  // Tooltip anchored over the hovered bar, flipped to its right end past mid-axis.
  const tipRight = hb !== null && x(hb.age) > W / 2;

  return (
    <div className="relative">
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={`ช่วงอายุยางของแต่ละแปลง จากอายุปัจจุบันถึง ${AGE_BAR_SPAN} ปีข้างหน้า`}>
      <defs>
        {/* Table 2's t1..t7 shades along each bar's full span, so a bar cut off at the axis keeps its colors in place. */}
        {bars.map((b) => (
          <linearGradient key={b.index} id={`${gradId}-${b.index}`} gradientUnits="userSpaceOnUse" x1={x(b.age)} x2={x(b.age + AGE_BAR_SPAN)} y1={0} y2={0}>
            {YEAR_SHADES.map((c, i) => <stop key={c} offset={i / (YEAR_SHADES.length - 1)} stopColor={c} />)}
          </linearGradient>
        ))}
      </defs>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x(t)} y1={PT} x2={x(t)} y2={PT + bars.length * ROW} stroke="rgba(0,0,0,0.08)" strokeDasharray={t === 0 ? undefined : "4,4"} />
          <text x={x(t)} y={PT + bars.length * ROW + 18} textAnchor="middle" fontSize={13} fill="#64748b">{t}</text>
        </g>
      ))}
      <text x={PL + iW / 2} y={H - 4} textAnchor="middle" fontSize={13} fill="#475569" fontWeight={600}>อายุยาง (ปี)</text>
      {bars.map((b, i) => {
        const cy = PT + i * ROW + ROW / 2;
        const isHov = hover === i;
        return (
          <g key={b.index} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: "default" }}>
            <rect x={0} y={cy - ROW / 2} width={W} height={ROW} fill={isHov ? "rgba(30,122,71,0.06)" : "transparent"} />
            <text data-plot-label x={0} y={cy + 4} fontSize={13} fill="#334155" fontWeight={600}>
              แปลง {b.index}
              {/* Plots entered by tree count only have no area. */}
              {b.areaM2 > 0 && <tspan fontWeight={400} fill="#64748b"> ({formatArea(b.areaM2 / M2_PER_RAI)} ไร่)</tspan>}
            </text>
            <rect x={x(b.age)} y={cy - BAR / 2} width={Math.max(x(b.end) - x(b.age), 2)} height={BAR} rx={4} fill={`url(#${gradId}-${b.index})`} stroke={isHov ? "#1b5e20" : "#81c784"} strokeWidth={isHov ? 2 : 1} />
            {/* Range label after the bar, or before it when the bar reaches the right edge. */}
            <text x={b.end > AGE_AXIS_MAX - 5 ? x(b.age) - 6 : x(b.end) + 6} y={cy + 4} textAnchor={b.end > AGE_AXIS_MAX - 5 ? "end" : "start"} fontSize={12} fill="#64748b">{b.age}–{b.end} ปี</text>
          </g>
        );
      })}
    </svg>
      {hb && hover !== null && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg bg-[#082f20] px-3 py-2 text-white shadow-lg"
          style={{
            top: `${((PT + hover * ROW + ROW / 2 - BAR / 2) / H) * 100}%`,
            ...(tipRight ? { right: `${(1 - x(hb.end) / W) * 100}%` } : { left: `${(x(hb.age) / W) * 100}%` }),
            transform: "translateY(calc(-100% - 6px))",
          }}
        >
          <div className="mb-1 text-xs font-semibold">แปลง {hb.index} · คาร์บอนกักเก็บ (tCO₂eq)</div>
          <table className="text-xs">
            <tbody>
              <tr className="text-white/60">
                <th className="pr-2 text-left font-normal">พ.ศ.</th>
                {hb.projection.map((y) => <td key={y.year} className="px-1.5 text-right">{y.year + 543}</td>)}
              </tr>
              <tr className="text-white/60">
                <th className="pr-2 text-left font-normal">อายุ</th>
                {hb.projection.map((y, i) => <td key={y.year} className="px-1.5 text-right">{Math.max(0, hb.rawAge + i)}</td>)}
              </tr>
              <tr>
                <th className="pr-2 text-left font-normal text-white/60">กักเก็บ</th>
                {hb.projection.map((y) => <td key={y.year} className="px-1.5 text-right font-semibold">{formatCarbon(y.gain)}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function PreliminaryAssessment() {
  const [provinces, setProvinces] = useState<ServiceProvince[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [region, setRegion] = useState(DEFAULT_REGION);
  const [pCode, setPCode] = useState("");
  const [rows, setRows] = useState<PlotRow[]>(() => DEFAULT_PLOTS.map((p) => ({ ...emptyRow(), ...p })));
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<PlotResult[] | null>(null);
  // Block 4 inputs; labels and use still to be decided.
  const [estimateInputs, setEstimateInputs] = useState<string[]>(() => ESTIMATE_FIELDS.map((f) => f.defaultValue));

  useEffect(() => {
    fetch("/api/service-provinces/")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: { provinces: ServiceProvince[] }) => {
        setProvinces(data.provinces);
        const preset = data.provinces.find((p) => p.regionTh === DEFAULT_REGION && p.provinceTh === DEFAULT_PROVINCE_TH);
        if (preset) setPCode(preset.pCode);
      })
      .catch(() => setLoadError(true));
  }, []);

  const regions = useMemo(() => [...new Set(provinces.map((p) => p.regionTh))], [provinces]);
  const regionProvinces = provinces.filter((p) => p.regionTh === region);

  // Any input change makes the shown result stale.
  const touch = () => {
    setResults(null);
    setError("");
  };

  const updateRow = (key: number, field: keyof Omit<PlotRow, "key">, value: string) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
    setRowErrors((prev) => {
      const { [key]: _, ...rest } = prev;
      return rest;
    });
    touch();
  };

  const removeRow = (key: number) => {
    setRows((prev) => prev.filter((r) => r.key !== key));
    touch();
  };

  async function assess() {
    setResults(null);
    const province = provinces.find((p) => p.pCode === pCode);
    if (!province) {
      setError("กรุณาเลือกภาคและจังหวัด");
      return;
    }

    const filled = rows.filter((r) => !isBlank(r));
    const errors: Record<number, string> = {};
    for (const r of filled) {
      const e = rowError(r);
      if (e) errors[r.key] = e;
    }
    setRowErrors(errors);
    if (filled.length === 0) {
      setError("กรุณากรอกข้อมูลอย่างน้อย 1 แปลง");
      return;
    }
    if (Object.keys(errors).length > 0) {
      setError("กรุณาตรวจสอบข้อมูลแปลงที่ไม่ถูกต้อง");
      return;
    }

    const d = province.defaults;
    if (!d.clone || !d.spacing || !d.growthModel || !d.allometry || !d.biomassProfileVersion || !d.treeDensityHa) {
      setError("จังหวัดนี้ยังไม่พร้อมสำหรับการประเมินเบื้องต้น");
      return;
    }

    setError("");
    setRunning(true);
    const treeCounts = filled.map((r) => resolveTreeCount(r, d.treeDensityHa!));
    try {
      // One request per plot, so each plot's carbon can be rounded on its own.
      const responses = await Promise.all(
        filled.map((r, i) =>
          simulateCarbon([{
            p_code: province.pCode,
            clone: d.clone!,
            growth_model: d.growthModel!,
            allometry: d.allometry!,
            biomass_profile_version: d.biomassProfileVersion!,
            spacing_system: d.spacing!,
            year_of_planting: Number(r.year) - 543,
            area_m2: areaM2(r),
            tree_count: treeCounts[i].treeCount,
            rotation_year: 35,
            replanting_rate: 1,
          }])
        )
      );
      setResults(
        filled.map((r, i) => {
          const res = responses[i];
          const projection = projectPlot(res.carbon_stock_tCO2e_simulation);
          return {
            index: rows.indexOf(r) + 1,
            yearBE: Number(r.year),
            areaM2: areaM2(r),
            treeCount: res.total_tree_count,
            rejectedTrees: treeCounts[i].rejected,
            carbon: projection[0].stock,
            ci: projection[0].stockCi,
            projection,
            profile: plotProfile(res.carbon_stock_tCO2e_simulation, Number(r.year) - 543),
          };
        })
      );
    } catch (err) {
      setError(err instanceof Error ? `ประเมินไม่สำเร็จ: ${err.message}` : "ประเมินไม่สำเร็จ");
    } finally {
      setRunning(false);
    }
  }

  // Assess the example plots once the preset province is in, so a result shows on load.
  const autoAssessed = useRef(false);
  useEffect(() => {
    if (!pCode || autoAssessed.current) return;
    autoAssessed.current = true;
    void assess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pCode]);

  // Sums of each plot's 2-decimal values (CIs: each rounded up), as in the project summaries.
  const sumOf = (f: (r: PlotResult) => number) => carbon2(results?.reduce((sum, r) => sum + f(r), 0) ?? 0);
  const totalCarbon = sumOf((r) => r.carbon);
  const totalCi = sumOf((r) => r.ci);
  // All plots summed per year.
  const projection: YearValue[] = Array.from({ length: PROJECTION_YEARS + 1 }, (_, i) => ({
    year: CURRENT_CE + i,
    stock: sumOf((r) => r.projection[i].stock),
    stockCi: sumOf((r) => r.projection[i].stockCi),
    gain: sumOf((r) => r.projection[i].gain),
    gainCi: sumOf((r) => r.projection[i].gainCi),
  }));
  const gain7 = projection[PROJECTION_YEARS].gain;
  const price = Number(estimateInputs[0]);
  const validPrice = Number.isFinite(price) && price > 0 ? price : 0;
  // TGO: box 2 shows whole tonnes, the gain rounded down and its CI rounded up
  // (never overstate credits nor understate uncertainty); box 3 prices those.
  const credits7 = creditTonnes(gain7);
  const credits7Ci = Math.ceil(projection[PROJECTION_YEARS].gainCi - 1e-9);
  const revenue = credits7 * validPrice;
  const revenueCi = credits7Ci * validPrice;
  const totalPts = useMemo(() => sumProfiles(results?.map((r) => r.profile) ?? []), [results]);
  const totalArea = results?.reduce((sum, r) => sum + r.areaM2, 0) ?? 0;
  // A total area would understate plots entered by tree count only.
  const allHaveArea = results?.every((r) => r.areaM2 > 0) ?? false;

  return (
    <div className="mx-auto mb-8 w-full rounded-2xl border border-border bg-card p-4 text-left shadow-sm sm:p-6">
      {/* Location: hidden, preset to DEFAULT_REGION / DEFAULT_PROVINCE_TH. Drop `hidden` to show it again. */}
      <div className="hidden grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="pa-region" className={labelClass}>ภาค<Req /></label>
          <select
            id="pa-region"
            className={fieldClass}
            value={region}
            disabled={provinces.length === 0}
            onChange={(e) => {
              setRegion(e.target.value);
              setPCode("");
              touch();
            }}
          >
            <option value="">— เลือกภาค —</option>
            {regions.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="pa-province" className={labelClass}>จังหวัด<Req /></label>
          <select
            id="pa-province"
            className={fieldClass}
            value={pCode}
            disabled={!region}
            onChange={(e) => {
              setPCode(e.target.value);
              touch();
            }}
          >
            <option value="">— เลือกจังหวัด —</option>
            {regionProvinces.map((p) => <option key={p.pCode} value={p.pCode}>{p.provinceTh}</option>)}
          </select>
        </div>
      </div>
      {loadError && (
        <p className="mt-2 mb-0 text-sm text-destructive">โหลดรายชื่อจังหวัดไม่สำเร็จ กรุณาลองใหม่อีกครั้ง</p>
      )}

      {/* Plots (mt-6 below the location selects; none while they are hidden) */}
      <div>
        <div className={`hidden gap-3 px-1 pb-2 text-sm font-medium text-foreground md:grid ${rowGrid}`}>
          <span />
          <span>ปีที่ปลูก (พ.ศ.)<Req /></span>
          <span className="col-span-3">พื้นที่ (ไร่ / งาน / ตารางวา)<Req /></span>
          <span>หรือ จำนวนต้น (รวมในพื้นที่)</span>
          <span />
        </div>

        <div className="flex flex-col gap-3">
          {rows.map((r, i) => (
            <div key={r.key}>
              <div
                className={`grid grid-cols-3 gap-x-2 gap-y-3 rounded-xl border border-border p-3 md:items-center md:gap-3 md:rounded-none md:border-0 md:p-1 ${rowGrid}`}
              >
                <div className="col-span-2 flex items-center text-sm font-semibold text-foreground md:col-span-1 md:justify-center md:font-medium md:text-muted-foreground">
                  <span className="md:hidden">แปลงที่&nbsp;</span>{i + 1}
                </div>
                <div className="col-span-1 flex justify-end md:hidden">
                  {rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRow(r.key)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-destructive"
                      aria-label={`ลบแปลงที่ ${i + 1}`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
                <div className="col-span-3 md:col-span-1">
                  <span className={mobileLabelClass}>ปีที่ปลูก (พ.ศ.)<Req /></span>
                  <select
                    className={fieldClass}
                    value={r.year}
                    onChange={(e) => updateRow(r.key, "year", e.target.value)}
                    aria-label={`ปีที่ปลูก แปลงที่ ${i + 1}`}
                  >
                    <option value="">— เลือก —</option>
                    {OLD_YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <span className={`${mobileLabelClass} col-span-3 -mb-2`}>พื้นที่<Req /></span>
                {([
                  ["rai", "ไร่", "ไร่"],
                  ["ngan", "งาน", "งาน"],
                  ["wah", "ตารางวา", "ตร.วา"],
                ] as const).map(([field, label, placeholder]) => (
                  <div key={field}>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={field === "ngan" ? 3 : field === "wah" ? 99.99 : undefined}
                      step="any"
                      className={fieldClass}
                      placeholder={placeholder}
                      value={r[field]}
                      onChange={(e) => updateRow(r.key, field, e.target.value)}
                      aria-label={`${label} แปลงที่ ${i + 1}`}
                    />
                  </div>
                ))}
                <div className="col-span-3 md:col-span-1">
                  <span className={mobileLabelClass}>หรือ จำนวนต้น<Req /></span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    className={fieldClass}
                    placeholder="ต้น"
                    value={r.trees}
                    onChange={(e) => updateRow(r.key, "trees", e.target.value)}
                    aria-label={`จำนวนต้น แปลงที่ ${i + 1}`}
                  />
                </div>
                <div className="hidden justify-center md:flex">
                  {rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRow(r.key)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-destructive"
                      aria-label={`ลบแปลงที่ ${i + 1}`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              </div>
              {rowErrors[r.key] && (
                <p className="mt-1 mb-0 flex items-center gap-1 px-1 text-xs text-destructive md:pl-9">
                  <AlertCircle className="size-3.5" aria-hidden="true" />
                  {rowErrors[r.key]}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      <p className="mt-3 mb-0 px-1 text-xs text-muted-foreground">
        <span className="text-destructive">*</span> จำเป็นต้องกรอก — ระบุพื้นที่ หรือ จำนวนต้น อย่างน้อยหนึ่งอย่าง
      </p>

      {/* Actions */}
      <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setRows((prev) => [...prev, emptyRow()]);
            touch();
          }}
          className="h-11 rounded-xl border-primary px-5 text-sm font-medium"
        >
          <Plus className="mr-1 size-4" aria-hidden="true" />
          เพิ่มแปลง
        </Button>
        <Button
          type="button"
          onClick={assess}
          disabled={running}
          className="h-11 rounded-xl px-6 text-sm font-semibold shadow-sm"
        >
          {running
            ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
            : <Calculator className="mr-2 size-4" aria-hidden="true" />}
          ประเมินคาร์บอน
        </Button>
      </div>

      {error && (
        <p className="mt-3 mb-0 flex items-center gap-1.5 text-sm text-destructive" role="alert">
          <AlertCircle className="size-4" aria-hidden="true" />
          {error}
        </p>
      )}

      {/* Results */}
      {results && (
        <div className="mt-6 border-t border-border pt-5" aria-live="polite">
          <div className="rounded-xl border border-border bg-background p-4">
            <h3 className="mt-0 mb-2 text-sm font-semibold text-foreground">1. ปริมาณคาร์บอนสะสม ณ ปีที่ประเมิน: รวมทุกแปลงและแยกรายแปลง</h3>
            <div className="mb-3 rounded-lg bg-secondary px-4 py-4 text-center">
              <div className="text-sm text-muted-foreground">
                คาร์บอนสะสมรวม ณ ปีฐาน
                {allHaveArea && ` (พื้นที่รวม ${formatArea(totalArea / M2_PER_RAI)} ไร่)`}
              </div>
              <div className="mt-1 text-3xl font-bold text-primary">
                {formatCarbon(totalCarbon)}
                <span className="ml-1.5 text-lg font-semibold text-muted-foreground">± {formatCarbon(totalCi)}</span>{" "}
                <span className="text-base font-medium text-foreground">tCO₂eq</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="py-2 pr-3 text-left font-medium">แปลง</th>
                    <th className="py-2 pr-3 text-right font-medium">ปีที่ปลูก</th>
                    <th className="py-2 pr-3 text-right font-medium">พื้นที่ (ไร่)</th>
                    <th className="py-2 pr-3 text-right font-medium">จำนวนต้น</th>
                    <th className="py-2 pr-3 text-right font-medium">อายุยาง (ปี)</th>
                    <th className="py-2 pr-3 text-right font-medium">คาร์บอนสะสม (tCO₂eq)</th>
                    <th className="py-2 text-right font-medium">95% CI</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr key={r.index} className="border-b border-border/60">
                      <td className="py-2 pr-3">{r.index}</td>
                      <td className="py-2 pr-3 text-right">{r.yearBE}</td>
                      <td className="py-2 pr-3 text-right">{r.areaM2 > 0 ? formatArea(r.areaM2 / M2_PER_RAI) : "—"}</td>
                      <td className="py-2 pr-3 text-right">
                        {r.treeCount.toLocaleString("th-TH")}
                        {r.rejectedTrees !== null && <span className="text-amber-600">*</span>}
                      </td>
                      <td className="py-2 pr-3 text-right">{Math.max(0, CURRENT_CE + 543 - r.yearBE)}</td>
                      <td className="py-2 pr-3 text-right font-semibold">{formatCarbon(r.carbon)}</td>
                      <td className="py-2 text-right text-muted-foreground">± {formatCarbon(r.ci)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {results.some((r) => r.rejectedTrees !== null) && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <span className="font-semibold">*</span> จำนวนต้นที่กรอกมากกว่าค่าที่คำนวณจากพื้นที่และระยะปลูกเกิน{" "}
                {TREE_COUNT_TOLERANCE * 100}% จึงใช้ค่าที่คำนวณแทน
              </div>
            )}
          </div>
          <div className="mt-4 rounded-xl border border-border bg-background p-4">
            <h3 className="mt-0 mb-2 text-sm font-semibold text-foreground">2. คาดการณ์ปริมาณการกักเก็บคาร์บอนทั้งหมด ตลอดระยะเวลา {PROJECTION_YEARS} ปี</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="py-2 pr-3 text-left font-medium whitespace-nowrap">ปี พ.ศ. (tCO₂eq)</th>
                    {projection.map((y, i) => (
                      // Equal widths, so the longer "ปีฐาน: …" header doesn't widen its column.
                      <th key={y.year} className="w-[11%] px-2 py-2 text-right font-medium whitespace-nowrap" style={yearShade(i)}>
                        {i === 0 ? `ปีฐาน: ${y.year + 543}` : y.year + 543}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {([
                    ["คาร์บอนสะสม", "stock"],
                    ["คาร์บอนกักเก็บ", "gain"],
                  ] as const).map(([label, value]) => (
                    <tr key={value} className="border-b border-border/60">
                      <th scope="row" className="py-2 pr-3 text-left font-medium whitespace-nowrap">{label}</th>
                      {projection.map((y, i) => (
                        <td key={y.year} className="px-2 py-2 text-right font-semibold whitespace-nowrap" style={yearShade(i)}>
                          {formatCarbon(y[value])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {totalPts.length > 0 && (
            <div className="mt-4 rounded-xl border border-border bg-background p-4">
              <h3 className="mt-0 mb-2 text-sm font-semibold text-foreground">3. คาร์บอนสะสมและการกักเก็บคาร์บอนตามอายุยาง ตั้งแต่ปลูกจนถึง 35 ปี</h3>
              <CarbonBarChart pts={totalPts} compact showAge={false} title="ปริมาณคาร์บอนสะสมรวมทุกแปลง (tCO₂eq)" baseline={{ value: totalCarbon, ci: totalCi }} />
            </div>
          )}
          {/* Hidden for now; drop `hidden` to show it again. */}
          <p className="hidden mt-3 mb-0 text-xs text-muted-foreground">
            ผลประเมินเบื้องต้นใช้ค่าตั้งต้นของจังหวัด (พันธุ์ยาง ระยะปลูก และแบบจำลองการเติบโต) และคำนวณจำนวนต้นจากพื้นที่และระยะปลูกเมื่อไม่ระบุจำนวนต้น
          </p>
          <div className="mt-4 rounded-xl border border-border bg-background p-4">
            <h3 className="mt-0 mb-2 text-sm font-semibold text-foreground">4. ประมาณการรายได้จากการกักเก็บคาร์บอนในช่วง 7 ปี</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {estimateInputs.map((value, i) => ESTIMATE_FIELDS[i].computed ? (
                <div key={i} className={`rounded-lg px-3 py-2.5 ${ESTIMATE_FIELDS[i].boxClass ?? "bg-secondary"}`}>
                  <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{ESTIMATE_FIELDS[i].label}</span>
                  <span className="flex items-baseline gap-2 py-1.5">
                    <span className={`text-2xl font-bold ${ESTIMATE_FIELDS[i].valueClass ?? "text-primary"}`}>
                      {(ESTIMATE_FIELDS[i].computed === "gain7" ? credits7 : revenue).toLocaleString("th-TH", { maximumFractionDigits: 2 })}
                    </span>
                    <span className="text-base font-semibold text-muted-foreground">
                      ± {(ESTIMATE_FIELDS[i].computed === "gain7" ? credits7Ci : revenueCi).toLocaleString("th-TH", { maximumFractionDigits: 2 })}
                    </span>
                    <span className="text-sm text-foreground">{ESTIMATE_FIELDS[i].unit}</span>
                  </span>
                </div>
              ) : (
                <label key={i} className={`block rounded-lg px-3 py-2.5 ${ESTIMATE_FIELDS[i].boxClass ?? "bg-secondary"}`}>
                  <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{ESTIMATE_FIELDS[i].label}</span>
                  <span className="flex items-center gap-2">
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      value={value}
                      onChange={(e) => setEstimateInputs((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
                      className={fieldClass}
                    />
                    {ESTIMATE_FIELDS[i].unit && (
                      <span className="shrink-0 text-sm text-foreground">{ESTIMATE_FIELDS[i].unit}</span>
                    )}
                  </span>
                  {ESTIMATE_FIELDS[i].note && (
                    <span className="mt-1.5 block text-xs text-muted-foreground">{ESTIMATE_FIELDS[i].note}</span>
                  )}
                </label>
              ))}
            </div>
            <div className="mt-4">
              <PlotAgeChart results={results} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
