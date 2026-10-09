"use client";

import { useEffect, useMemo, useState } from "react";
import DashboardMap, { type MapPlot } from "./DashboardMap";
import { simulateCarbon } from "@/lib/carbon-api";
import { Footer } from "@/app/components/organisms";
import { useCounter } from "@/lib/use-counter";
import { formatArea } from "@/lib/utils";

// Rubber age groups (years) shared by every chart on this page. "31+" has no
// upper bound; the 0–35 per-year chart caps it at 35.
const AGE_GROUPS = [
  { key: "0-5",   label: "0–5 ปี",   range: [0, 5]   as [number, number], stage: "ระยะก่อนเปิดกรีด",       color: "#bbf7d0", dark: "#166534", bg: "rgba(187,247,208,0.35)" },
  { key: "6-15",  label: "6–15 ปี",  range: [6, 15]  as [number, number], stage: "ระยะให้ผลผลิตสูง",       color: "#4ade80", dark: "#15803d", bg: "rgba(74,222,128,0.22)" },
  { key: "16-25", label: "16–25 ปี", range: [16, 25] as [number, number], stage: "ระยะให้ผลผลิตคงที่",        color: "#16a34a", dark: "#14532d", bg: "rgba(22,163,74,0.18)" },
  { key: "26-30", label: "26–30 ปี", range: [26, 30] as [number, number], stage: "ระยะปลายอายุการกรีด",    color: "#166534", dark: "#052e16", bg: "rgba(22,101,52,0.18)" },
  { key: "31+",   label: ">30 ปี",   range: [31, 35] as [number, number], stage: "ระยะโค่นล้มและปลูกทดแทน", color: "#052e16", dark: "#052e16", bg: "rgba(5,46,22,0.15)" },
];

// ── Rayong province system database ──────────────────────────────────────────

type AgeDist = { key: string; areaRai: number; carbon: number };
type District = {
  id: string; name: string;
  areaRai: number; carbon: number;
  ageDist: AgeDist[];
  /** Area (ไร่) per age 0–35, index = age. */
  perYearRai: number[];
  /** Carbon stock (tCO₂eq) per age 0–35, index = age. */
  perYearCarbon: number[];
  /** Carbon added over the next year by growth of ages 0–34 (tCO₂eq). */
  annualGain: number;
  /** Ages 26+ (near / past the end of tapping, due for felling and replanting). */
  matureRai: number; matureCarbon: number;
  /** Rubber area with no planting year (excluded from area/carbon above). */
  unclassifiedRai: number;
  /** District centre (geo_district); null when the name isn't found there. */
  lat: number | null; lng: number | null;
};

const M2_PER_RAI = 1600;
const BE_OFFSET = 543;
/** Keeps 2 decimals of an area for display (carbon stays whole). */
const round2 = (n: number) => Math.round(n * 100) / 100;
const fmtC = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 0 });


// ── District carbon comparison chart ─────────────────────────────────────────

function DistrictCarbonChart({
  selectedId,
  onSelect,
  isMobile,
  districts,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
  isMobile: boolean;
  districts: District[];
}) {
  const [hoverId, setHoverId] = useState<string | null>(null);

  const W = isMobile ? 460 : 800;
  const barH = isMobile ? 24 : 26;
  const gap = isMobile ? 7 : 7;
  const PL = isMobile ? 72 : 108;
  const PR = isMobile ? 78 : 98;
  // Legend: 5 groups in one row on desktop, 3 + 2 on mobile.
  const legendCols = isMobile ? 3 : 5;
  const legendColW = isMobile ? 128 : 136;
  const legendRowH = 30;
  const legendRows = Math.ceil(AGE_GROUPS.length / legendCols);
  const PT = (isMobile ? 16 : 17) + legendRows * legendRowH + 8;
  const PB = 10;

  const maxCarbon = Math.max(...districts.map(d => d.carbon));
  const iW = W - PL - PR;

  const rows = districts.map((d, i) => {
    const y = PT + i * (barH + gap);
    const bw = Math.max((d.carbon / maxCarbon) * iW, 4);
    let xOff = 0;
    const segs = AGE_GROUPS.map(s => {
      const carbon = d.ageDist.find(a => a.key === s.key)?.carbon ?? 0;
      const sw = (carbon / maxCarbon) * iW;
      const seg = { key: s.key, x: PL + xOff, w: sw, color: s.color, carbon };
      xOff += sw;
      return seg;
    });
    return { d, y, bw, segs };
  });

  const totalH = PT + districts.length * (barH + gap) - gap + PB;

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${totalH}`}
        style={{ width: "100%", height: "auto", display: "block", overflow: "visible" }}
      >
        <defs>
          {rows.map(({ d, y, bw }) => (
            <clipPath key={d.id} id={`dbClip-${d.id}`}>
              <rect x={PL} y={y} width={bw} height={barH} rx={8} />
            </clipPath>
          ))}
          <linearGradient id="trackGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(0,0,0,0.03)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.055)" />
          </linearGradient>
        </defs>

        {/* Legend */}
        <text x={PL} y={isMobile ? 10 : 11} fontSize={isMobile ? 10 : 11} fill="#059669" fontWeight={700}>
          อายุยางพารา (ปี)
        </text>
        <g>
          {AGE_GROUPS.map((s, i) => (
            <g key={s.key} transform={`translate(${PL + (i % legendCols) * legendColW}, ${(isMobile ? 16 : 17) + Math.floor(i / legendCols) * legendRowH})`}>
              <rect width={10} height={10} rx={2.5} fill={s.color} />
              <text x={14} y={9} fontSize={isMobile ? 12 : 12} fill="#334155" fontWeight={700}>{s.label}</text>
              <text x={14} y={isMobile ? 22 : 21} fontSize={isMobile ? 10 : 10} fill="#94a3b8" fontWeight={500}>{s.stage}</text>
            </g>
          ))}
        </g>

        {/* X grid lines */}
        {[0.25, 0.5, 0.75, 1].map(t => (
          <line key={t}
            x1={PL + t * iW} y1={PT - 6}
            x2={PL + t * iW} y2={PT + districts.length * (barH + gap) - gap}
            stroke="rgba(0,0,0,0.05)" strokeWidth={1}
            strokeDasharray={t < 1 ? "3,3" : undefined} />
        ))}

        {/* Rows */}
        {rows.map(({ d, y, bw, segs }) => {
          const isActive = d.id === selectedId;
          const isHov = hoverId === d.id;

          return (
            <g key={d.id}
              onClick={() => onSelect(d.id)}
              onMouseEnter={() => setHoverId(d.id)}
              onMouseLeave={() => setHoverId(null)}
              style={{ cursor: "pointer" }}>

              {/* Row highlight */}
              {(isActive || isHov) && (
                <rect x={4} y={y - 5} width={W - 8} height={barH + 10} rx={9}
                  fill={isActive ? "rgba(5,150,105,0.09)" : "rgba(5,150,105,0.04)"}
                  stroke={isActive ? "rgba(5,150,105,0.22)" : "none"}
                  strokeWidth={1.5} />
              )}

              {/* Active indicator */}
              {isActive && (
                <rect x={4} y={y + 6} width={3.5} height={barH - 12} rx={2} fill="#059669" />
              )}

              {/* District name */}
              <text x={PL - 10} y={y + barH / 2 + 5}
                textAnchor="end"
                fontSize={isMobile ? 13 : 14}
                fontWeight={isActive ? 800 : 600}
                fill={isActive ? "#059669" : isHov ? "#334155" : "#475569"}>
                {d.name}
              </text>

              {/* Track background */}
              <rect x={PL} y={y} width={iW} height={barH} rx={8}
                fill="url(#trackGrad)" />

              {/* Stacked segments clipped to rounded bar */}
              {segs.map(seg => (
                seg.w > 0 && (
                  <rect key={seg.key}
                    x={seg.x} y={y} width={seg.w} height={barH}
                    clipPath={`url(#dbClip-${d.id})`}
                    fill={seg.color}
                    opacity={isActive ? 1 : isHov ? 0.9 : 0.72}
                    style={{ transition: "opacity 0.2s" }} />
                )
              ))}

              {/* Value label */}
              <text x={PL + bw + 8} y={y + barH / 2 + 5}
                textAnchor="start"
                fontSize={isMobile ? 13 : 13}
                fontWeight={isActive ? 800 : 700}
                fill={isActive ? "#059669" : "#64748b"}>
                {fmtC(d.carbon)}
                <tspan fontSize={10} fill="#94a3b8" fontWeight={500} dx={3}>tCO₂eq</tspan>
              </text>
            </g>
          );
        })}

        {/* Tooltip */}
        {hoverId !== null && (() => {
          const row = rows.find(r => r.d.id === hoverId);
          if (!row) return null;
          const { d, y, bw } = row;
          const ttW = isMobile ? 236 : 270;
          const lineH = isMobile ? 19 : 21;
          const rowsTop = isMobile ? 36 : 42; // first age row, below the header + divider
          // Last row (≈10px tall) plus ~12px bottom padding.
          const ttH = rowsTop + (AGE_GROUPS.length - 1) * lineH + (isMobile ? 20 : 22);
          const midX = PL + bw / 2;
          const ttX = Math.min(Math.max(midX - ttW / 2, 4), W - ttW - 4);
          const ttY = y > totalH / 2 ? y - ttH - 10 : y + barH + 10;
          const pad = 14;

          return (
            <g pointerEvents="none">
              <rect x={ttX} y={ttY} width={ttW} height={ttH} rx={12}
                fill="#0f172a" style={{ filter: "drop-shadow(0 10px 28px rgba(0, 0, 0, 0.4))" }} />
              <rect x={ttX} y={ttY} width={ttW} height={4} rx={2} fill="#10b981" />

              {/* Header */}
              <text x={ttX + pad} y={ttY + 22}
                fontSize={isMobile ? 14 : 15} fontWeight={800} fill="#fff">{d.name}</text>
              <text x={ttX + ttW - pad} y={ttY + 22}
                textAnchor="end" fontSize={isMobile ? 14 : 15} fontWeight={800} fill="#4ade80">
                {fmtC(d.carbon)}
                <tspan fontSize={10} fill="#98a3b4" dx={3}>tCO₂eq</tspan>
              </text>

              {/* Divider */}
              <line x1={ttX + pad} y1={ttY + (isMobile ? 30 : 34)}
                x2={ttX + ttW - pad} y2={ttY + (isMobile ? 30 : 34)}
                stroke="rgba(255,255,255,0.08)" strokeWidth={2} />

              {/* Age breakdown */}
              {AGE_GROUPS.map((s, i) => {
                const carbon = d.ageDist.find(a => a.key === s.key)?.carbon ?? 0;
                const rowY = ttY + rowsTop + i * lineH;
                return (
                  <g key={s.key}>
                    <rect x={ttX + pad} y={rowY} width={10} height={10} rx={2} fill={s.color} />
                    <text x={ttX + pad + 14} y={rowY + 10}
                      fontSize={isMobile ? 11 : 12} fill="#98a3b4" fontWeight={600}>
                      {s.label}
                    </text>
                    <text x={ttX + ttW - pad} y={rowY + 8}
                      textAnchor="end" fontSize={isMobile ? 12 : 13} fill="#e2e8f0" fontWeight={700}>
                      {fmtC(carbon)}
                      <tspan fontSize={10} fill="#98a3b4" dx={2}>tCO₂eq</tspan>
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })()}
      </svg>
    </div>
  );
}

// ── Age distribution (per-year 0-35) ─────────────────────────────────────────


/** Smallest "round" number ≥ v, for the carbon axis top. */
function niceCeil(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return ([1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find(m => m * p >= v) ?? 10) * p;
}

/** 1.6M / 400k / 950 */
const compact = (n: number) =>
  n >= 1e6 ? `${+(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${Math.round(n)}`;

/** Carbon line + axis labels: blue stands apart from the green bars and reads on white. */
const CARBON_LINE = "#b36020";
const CARBON_TEXT = CARBON_LINE;
/** Lighter blue for carbon text on the dark-green tooltip. */
const CARBON_ON_DARK = "#f0924a";

function getAgeGroup(age: number) {
  return AGE_GROUPS.find(g => age >= g.range[0] && age <= g.range[1])!;
}

/** Rubber area (bars, left) and carbon stock (line, right axis) per age 0–35 for the selected scope; see summarize(). */
function AgeDistributionChart({ isMobile, perYearRai, perYearCarbon, scopeLabel, refYear }: {
  isMobile: boolean; perYearRai: number[]; perYearCarbon: number[]; scopeLabel: string; refYear: number;
}) {
  const [hoveredAge, setHoveredAge] = useState<number | null>(null);

  const W = isMobile ? 480 : 1060;
  const H = isMobile ? 260 : 295;
  const PL = 20, PR = isMobile ? 40 : 52; // right side holds the carbon axis labels
  const PT = isMobile ? 38 : 48;
  const PB = isMobile ? 48 : 54;
  const iW = W - PL - PR;
  const iH = H - PT - PB;

  const nBars = perYearRai.length;
  const gap = isMobile ? 2 : 3;
  const barW = (iW - gap * (nBars - 1)) / nBars;
  const yearData = perYearRai;
  const maxVal = Math.max(...yearData, 1);
  const maxCarbon = niceCeil(Math.max(...perYearCarbon, 0));
  const barCx = (age: number) => PL + age * (barW + gap) + barW / 2;
  const carbonY = (c: number) => PT + iH - (c / maxCarbon) * iH;
  const carbonPath = perYearCarbon.map((c, age) => `${age ? "L" : "M"}${barCx(age)},${carbonY(c)}`).join(" ");

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div style={{ width: 40, height: 40, borderRadius: 11, background: "rgba(16,185,129,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <i className="bi bi-bar-chart-fill" style={{ color: "#059669", fontSize: 20 }} />
        </div>
        <div>
          <div style={{ fontSize: isMobile ? 16 : 20, fontWeight: 900, color: "#064e3b" }}>การกระจายพื้นที่ปลูกยางและคาร์บอนสะสมตามอายุยาง (0–35 ปี)</div>
          <div style={{ fontSize: isMobile ? 13 : 14, color: "#94a3b8", fontWeight: 500, marginTop: 2 }}>พื้นที่ (ไร่) และคาร์บอนสะสม (tCO₂eq) · {scopeLabel} · อายุ ณ ปี พ.ศ. {refYear + BE_OFFSET}</div>
        </div>
      </div>

      {/* SVG chart */}
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block", overflow: "visible" }}>
        {/* Grid */}
        {[0.25, 0.5, 0.75, 1].map(t => (
          <line key={t} x1={PL} y1={PT + t * iH} x2={PL + iW} y2={PT + t * iH}
            stroke="rgba(0,0,0,0.05)" strokeWidth={1} strokeDasharray={t < 1 ? "3,3" : undefined} />
        ))}

        {/* Bars */}
        {yearData.map((val, idx) => {
          const age = idx;
          const g = getAgeGroup(age);
          const bh = Math.max((val / maxVal) * iH, 4);
          const x = PL + idx * (barW + gap);
          const y = PT + iH - bh;
          const cx = x + barW / 2;
          const isHov = hoveredAge === age;
          return (
            <g key={age} onMouseEnter={() => setHoveredAge(age)} onMouseLeave={() => setHoveredAge(null)} style={{ cursor: "pointer" }}>
              {isHov && <rect x={x - 1} y={PT} width={barW + 2} height={iH} rx={3} fill={g.color} opacity={0.12} />}
              <rect x={x} y={y} width={barW} height={bh} rx={isMobile ? 2 : 3}
                fill={g.color} opacity={isHov ? 1 : 0.88} style={{ transition: "opacity 0.12s" }} />
              <text x={cx} y={y - (isMobile ? 3 : 5)} textAnchor="middle"
                fontSize={isMobile ? 8 : 10} fontWeight={isHov ? 800 : 600}
                fill={isHov ? g.dark : "#374151"}>
                {val >= 1000 ? Math.round(val / 100) / 10 + "k" : val}
              </text>
            </g>
          );
        })}

        {/* X-axis baseline */}
        <line x1={PL} y1={PT + iH} x2={PL + iW} y2={PT + iH} stroke="rgba(0,0,0,0.1)" strokeWidth={1} />

        {/* Carbon axis (right), on the shared grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map(t => (
          <text key={t} x={PL + iW + 6} y={PT + (1 - t) * iH + 4} textAnchor="start"
            fontSize={isMobile ? 10 : 12} fill={CARBON_TEXT} fontWeight={700}>{compact(maxCarbon * t)}</text>
        ))}
        <text x={W - 2} y={PT - (isMobile ? 12 : 16)} textAnchor="end"
          fontSize={isMobile ? 10 : 12} fill={CARBON_TEXT} fontWeight={700}>tCO₂eq</text>

        {/* Carbon line */}
        <path d={carbonPath} fill="none" stroke={CARBON_LINE} strokeWidth={isMobile ? 2 : 2.5}
          strokeLinejoin="round" strokeLinecap="round" pointerEvents="none" />
        {perYearCarbon.map((c, age) => (
          <circle key={age} cx={barCx(age)} cy={carbonY(c)} pointerEvents="none"
            r={hoveredAge === age ? (isMobile ? 4 : 5) : (isMobile ? 1.8 : 2.5)}
            fill={hoveredAge === age ? "#fff" : CARBON_LINE} stroke={CARBON_LINE} strokeWidth={hoveredAge === age ? 2.5 : 0} />
        ))}

        {/* X-axis labels: 0,5,10,…,35 */}
        {[0, 5, 10, 15, 20, 25, 30, 35].map(age => {
          const x = PL + age * (barW + gap) + barW / 2;
          return (
            <text key={age} x={x} y={PT + iH + (isMobile ? 15 : 20)} textAnchor="middle"
              fontSize={isMobile ? 12 : 15} fill="#64748b" fontWeight={700}>{age}</text>
          );
        })}

        {/* X-axis title */}
        <text x={PL + iW / 2} y={H - (isMobile ? 4 : 5)} textAnchor="middle"
          fontSize={isMobile ? 12 : 15} fill="#94a3b8" fontWeight={600}>อายุต้นยาง (ปี)</text>

        {/* Hover tooltip */}
        {hoveredAge !== null && (() => {
          const idx = hoveredAge;
          const val = yearData[idx];
          const g = getAgeGroup(hoveredAge);
          const bh = Math.max((val / maxVal) * iH, 4);
          const cx = PL + idx * (barW + gap) + barW / 2;
          const y = PT + iH - bh;
          const carbon = perYearCarbon[idx] ?? 0;
          const ttW = isMobile ? 150 : 176, ttH = isMobile ? 72 : 82;
          const ttX = Math.min(Math.max(cx - ttW / 2, 4), W - ttW - 4);
          const ttY = Math.max(Math.min(y, carbonY(carbon)) - ttH - 10, 4);
          return (
            <g pointerEvents="none">
              <rect x={ttX} y={ttY} width={ttW} height={ttH} rx={9} fill="#064e3b" opacity={0.96}
                style={{ filter: "drop-shadow(0 4px 10px rgba(5,150,105,0.3))" }} />
              <rect x={ttX} y={ttY} width={ttW} height={3} rx={1.5} fill={g.color} />
              <text x={ttX + ttW / 2} y={ttY + 20} textAnchor="middle" fontSize={isMobile ? 13 : 14} fill="#6ee7b7" fontWeight={700}>
                {hoveredAge} ปี 
              </text>
              <text x={ttX + ttW / 2} y={ttY + (isMobile ? 40 : 44)} textAnchor="middle" fontSize={isMobile ? 13 : 16} fill="#fff" fontWeight={900}>
                {formatArea(val)} ไร่
              </text>
              <text x={ttX + ttW / 2} y={ttY + (isMobile ? 60 : 68)} textAnchor="middle" fontSize={isMobile ? 13 : 16} fill={CARBON_ON_DARK} fontWeight={800}>
                {carbon.toLocaleString("th-TH")} tCO₂eq
              </text>
            </g>
          );
        })()}
      </svg>

      {/* Legend: meaning of numbers */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: isMobile ? 8 : 18, padding: "9px 14px", background: "rgba(5,150,105,0.04)", borderRadius: 10, border: "1px solid rgba(16,185,129,0.1)" }}>
        <span style={{ fontSize: isMobile ? 13 : 14, color: "#374151", fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}>
          <i className="bi bi-palette2" style={{ color: "#059669" }} /> สีช่วงอายุต้นยาง:
        </span>
        {AGE_GROUPS.map(g => (
          <span key={g.key} style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <span style={{ width: 13, height: 13, borderRadius: "50%", background: g.color, flexShrink: 0, border: "1.5px solid rgba(0,0,0,0.1)", display: "inline-block" }} />
            <span style={{ fontSize: isMobile ? 13 : 14, fontWeight: 700, color: "#374151" }}>{g.label}</span>
          </span>
        ))}
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: isMobile ? 13 : 14, color: "#64748b" }}>
          <span style={{ display: "inline-block", width: 22, height: 4, background: "linear-gradient(90deg,#4ade80,#059669)", borderRadius: 2 }} />
          พื้นที่ (ไร่)
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: isMobile ? 13 : 14, color: "#64748b" }}>
          <span style={{ display: "inline-block", width: 22, height: 3, background: CARBON_LINE, borderRadius: 2 }} />
          คาร์บอนสะสม (tCO₂eq)
        </span>
      </div>

    </div>
  );
}

/** Running number that glides to `value` (see useCounter). */
function AnimatedNumber({ value, digits = 0 }: { value: number; digits?: number }) {
  const v = useCounter(value);
  return <>{digits ? v.toLocaleString("th-TH", { minimumFractionDigits: digits, maximumFractionDigits: digits }) : fmtC(v)}</>;
}

/** Four headline indicators for the selected scope (replaces per-age-group area cards). */
function InsightCards({ d }: { d: District }) {
  const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);
  const totalRubberRai = d.areaRai + d.unclassifiedRai;
  const cards = [
    {
      icon: "bi-speedometer2", color: "#0d9488", label: "ความหนาแน่นคาร์บอนเฉลี่ย",
      value: d.areaRai > 0 ? d.carbon / d.areaRai : 0, digits: 1, unit: "tCO₂eq/ไร่",
      note: `คาร์บอนสะสมเฉลี่ยต่อพื้นที่ยาง ${formatArea(d.areaRai)} ไร่`,
    },
    {
      icon: "bi-graph-up-arrow", color: "#16a34a", label: "อัตราการกักเก็บคาร์บอนต่อปี",
      value: d.annualGain, digits: 0, unit: "tCO₂eq/ปี",
      note: `เพิ่มขึ้น ${pct(d.annualGain, d.carbon).toFixed(1)}% ของคาร์บอนสะสม จากการเติบโตของต้นยางอายุ 0–34 ปีในปีถัดไป`,
    },
    {
      icon: "bi-arrow-repeat", color: "#b45309", label: "พื้นที่ใกล้ครบรอบโค่น (> 26 ปี)",
      value: d.matureRai, digits: 2, unit: "ไร่",
      note: `กักเก็บคาร์บอน ${fmtC(d.matureCarbon)} tCO₂eq (${pct(d.matureCarbon, d.carbon).toFixed(1)}% ของทั้งหมด) ที่จะลดลงเมื่อโค่นและปลูกทดแทน`,
    },
    {
      icon: "bi-check2-circle", color: "#475569", label: "ความครอบคลุมของข้อมูลปีปลูก",
      value: pct(d.areaRai, totalRubberRai), digits: 1, unit: "%",
      note: `พื้นที่ยางที่ไม่สามารถระบุปีปลูกจำนวน ${formatArea(d.unclassifiedRai)} ไร่ ซึ่งไม่ได้รวมในการคำนวณคาร์บอน`,
    },
  ];
  return (
    <div className="db2-kpi-row">
      {cards.map(c => (
        <div key={c.label} className="db2-kpi-card" style={{ borderTop: `3px solid ${c.color}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: `${c.color}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <i className={`bi ${c.icon}`} style={{ color: c.color, fontSize: 16 }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#475569", lineHeight: 1.3 }}>{c.label}</span>
          </div>
          <div style={{ fontSize: 30, fontWeight: 900, color: "#0f172a", letterSpacing: -1, lineHeight: 1 }}>
            <AnimatedNumber value={c.value} digits={c.digits} />
            <span style={{ fontSize: 15, fontWeight: 600, color: "#94a3b8", marginLeft: 6, letterSpacing: 0 }}>{c.unit}</span>
          </div>
          <div style={{ fontSize: 13, color: "#64748b", marginTop: 10, lineHeight: 1.5 }}>{c.note}</div>
        </div>
      ))}
    </div>
  );
}

function Select({ label, icon, value, onChange, children, disabled }: {
  label: string; icon: string; value: string; onChange: (v: string) => void;
  children: React.ReactNode; disabled?: boolean;
}) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", flex: 1, minWidth: 240 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 16, fontWeight: 700, color: "#374151", flexShrink: 0 }}>
        <i className={`bi ${icon}`} style={{ color: "#059669", fontSize: 16 }} />{label}
      </span>
      <span style={{ position: "relative", flex: 1, minWidth: 180, maxWidth: 320 }}>
        <select
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: "100%", appearance: "none", WebkitAppearance: "none", background: "#fff",
            border: "1.5px solid rgba(5,150,105,0.35)", borderRadius: 10, padding: "10px 40px 10px 14px",
            fontSize: 15, fontWeight: 700, color: "#0f172a", cursor: disabled ? "default" : "pointer", outline: "none",
            boxShadow: "0 1px 4px rgba(5,150,105,0.1)", fontFamily: "'Noto Sans Thai','Inter',sans-serif",
          }}
        >
          {children}
        </select>
        <i className="bi bi-chevron-down" style={{ position: "absolute", right: 13, top: "50%", transform: "translateY(-50%)", color: "#059669", fontSize: 14, pointerEvents: "none" }} />
      </span>
    </label>
  );
}

type ProvinceOption = { pCode: string; nameEn: string; nameTh: string; regionTh: string };

/** GET /api/dashboard/carbon-stock?pCode=… */
type CarbonStockData = {
  province: { pCode: string; nameEn: string; nameTh: string };
  config: {
    luVersion: number; plantingYearVersion: number; spacing: string; clone: string;
    growthModel: string; allometry: string; biomassProfileVersion: string;
  };
  districts: {
    id: string; nameTh: string; lng: number | null; lat: number | null;
    /** Rubber area by planting year (CE); unclassified (year 0) excluded. */
    cohorts: { year: number; areaM2: number }[];
    /** Rubber area with no planting year (year = 0). */
    unclassifiedAreaM2: number;
  }[];
};

/**
 * Carbon (tCO₂eq) per m² at each age 0–35, from one /carbon/sim call.
 * Carbon scales with tree count, so a single 1 ha cohort planted 35 years
 * before "now" walks through every age in the 71-year profile
 * (age = profile year − planting year); any cohort's carbon stock is then
 * area × perM2[age]. Matches a direct all-cohort /carbon/sim call at
 * year_at = 0 (Rayong: 18,124,006 vs 18,124,003 tCO₂eq).
 */
async function carbonPerM2ByAge(d: CarbonStockData, signal: AbortSignal): Promise<number[]> {
  const plantedYear = new Date().getFullYear() - 35;
  const sim = await simulateCarbon([{
    p_code: d.province.pCode,
    clone: d.config.clone,
    growth_model: d.config.growthModel,
    allometry: d.config.allometry,
    biomass_profile_version: d.config.biomassProfileVersion,
    spacing_system: d.config.spacing,
    year_of_planting: plantedYear,
    area_m2: 10000,
    tree_count: null,
    rotation_year: 35,
    replanting_rate: 1,
  }], signal);
  const perM2 = new Array(36).fill(0);
  for (const pt of sim.carbon_stock_tCO2e_simulation ?? []) {
    const age = pt.year - plantedYear;
    if (age >= 0 && age <= 35) perM2[age] = pt.carbon_stock_tCO2e / 10000;
  }
  return perM2;
}

/** Rolls planting-year cohorts up into area/carbon totals, age groups and per-age area. */
function summarize(
  id: string, name: string, cohorts: { year: number; areaM2: number }[],
  refYear: number, perM2: number[], lat: number | null, lng: number | null, unclassifiedM2: number,
): District {
  const perYear = new Array(36).fill(0);
  const perYearCo2 = new Array(36).fill(0);
  const groups = AGE_GROUPS.map(g => ({ key: g.key, areaRai: 0, carbon: 0 }));
  let areaRai = 0, carbon = 0, annualGain = 0, matureRai = 0, matureCarbon = 0;
  for (const c of cohorts) {
    // Age as of the planting-year map; age 0 = planted in the map year.
    const age = refYear - c.year;
    if (age < 0 || age > 35) continue;
    const rai = c.areaM2 / M2_PER_RAI;
    const co2 = c.areaM2 * perM2[age];
    perYear[age] += rai;
    perYearCo2[age] += co2;
    const g = groups[AGE_GROUPS.indexOf(getAgeGroup(age))];
    g.areaRai += rai;
    g.carbon += co2;
    areaRai += rai;
    carbon += co2;
    // Next year's growth; the profile ends at 35, so the oldest cohort adds nothing.
    if (age < 35) annualGain += c.areaM2 * (perM2[age + 1] - perM2[age]);
    if (age >= 26) { matureRai += rai; matureCarbon += co2; }
  }
  return {
    id, name, lat, lng,
    areaRai: round2(areaRai),
    carbon: Math.round(carbon),
    ageDist: groups.map(g => ({ key: g.key, areaRai: round2(g.areaRai), carbon: Math.round(g.carbon) })),
    perYearRai: perYear.map(round2),
    perYearCarbon: perYearCo2.map(Math.round),
    annualGain: Math.round(annualGain),
    matureRai: round2(matureRai),
    matureCarbon: Math.round(matureCarbon),
    unclassifiedRai: round2(unclassifiedM2 / M2_PER_RAI),
  };
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  // Province list: provinces with planting-year data (same source as /dashboard/simulation).
  const [provinces, setProvinces] = useState<ProvinceOption[] | null>(null);
  const [region, setRegion] = useState("");
  const [pCode, setPCode] = useState("");
  const [selectedId, setSelectedId] = useState("all");
  const regions = useMemo(() => [...new Set(provinces?.map((p) => p.regionTh))], [provinces]);
  const regionProvinces = useMemo(() => provinces?.filter((p) => p.regionTh === region) ?? [], [provinces, region]);
  const [isMobile, setIsMobile] = useState(false);
  const [mapPlots, setMapPlots] = useState<MapPlot[]>([]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsMobile(window.innerWidth < 768);
    const h = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  useEffect(() => {
    fetch("/api/carbon-sim/province")
      .then(r => r.ok ? r.json() : { provinces: [] })
      .then(({ provinces }: { provinces: ProvinceOption[] }) => {
        setProvinces(provinces);
        if (provinces.length) {
          const initial = provinces.find(p => p.pCode === "RAY") ?? provinces[0];
          setRegion(initial.regionTh);
          setPCode(initial.pCode);
        }
      })
      .catch(() => setProvinces([]));
  }, []);

  useEffect(() => {
    fetch("/api/dashboard/stats")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        setMapPlots(data.mapPlots ?? []);
      })
      .catch(console.error);
  }, []);

  // ── Carbon stock: rubber area by district × planting year from the DB,
  // times carbon per area by age from /carbon/sim (see carbonPerM2ByAge).
  const [stock, setStock] = useState<{ data: CarbonStockData; perM2: number[] } | null>(null);
  const [stockError, setStockError] = useState<string | null>(null);

  useEffect(() => {
    if (!pCode) return;
    const ctrl = new AbortController();
    setStock(null);
    setStockError(null);
    fetch(`/api/dashboard/carbon-stock?pCode=${encodeURIComponent(pCode)}`, { signal: ctrl.signal })
      .then(async r => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(typeof body?.error === "string" ? body.error : `HTTP ${r.status}`);
        const data = body as CarbonStockData;
        return { data, perM2: await carbonPerM2ByAge(data, ctrl.signal) };
      })
      .then(setStock)
      .catch(e => { if (!ctrl.signal.aborted) setStockError(e instanceof Error ? e.message : String(e)); });
    return () => ctrl.abort();
  }, [pCode]);

  const districts = useMemo<District[]>(() => {
    if (!stock) return [];
    const { data, perM2 } = stock;
    return data.districts.map(d =>
      summarize(d.id, d.nameTh, d.cohorts, data.config.plantingYearVersion, perM2, d.lat, d.lng, d.unclassifiedAreaM2));
  }, [stock]);

  const provinceTotal = useMemo<District>(() => {
    const allCohorts = stock?.data.districts.flatMap(d => d.cohorts) ?? [];
    const unclassifiedM2 = stock?.data.districts.reduce((sum, d) => sum + d.unclassifiedAreaM2, 0) ?? 0;
    return summarize("all", "ทุกอำเภอ", allCohorts, stock?.data.config.plantingYearVersion ?? 0,
      stock?.perM2 ?? [], null, null, unclassifiedM2);
  }, [stock]);

  // The map only gets districts it can place.
  const mapDistricts = useMemo(
    () => districts.flatMap(d => (d.lat != null && d.lng != null ? [{ ...d, lat: d.lat, lng: d.lng }] : [])),
    [districts],
  );

  const selected = useMemo(
    () => (selectedId === "all" ? provinceTotal : districts.find(d => d.id === selectedId) ?? provinceTotal),
    [selectedId, provinceTotal, districts],
  );
  const selectedDistrictName = selected.id === "all" ? null : selected.name;

  const maxAgeCarbon = useMemo(() => Math.max(...selected.ageDist.map(a => a.carbon), 1), [selected]);
  // Follows the เลือกจังหวัด dropdown; Rayong until the province list loads.
  const provinceName = provinces?.find(p => p.pCode === pCode)?.nameTh ?? "ระยอง";
  const yearBadgeStyle: React.CSSProperties = {
    background: "rgba(5,150,105,0.1)", border: "1px solid rgba(5,150,105,0.2)", borderRadius: 6, padding: "2px 8px",
    fontSize: isMobile ? 13 : 14, fontWeight: 700, color: "#059669", whiteSpace: "nowrap",
  };
  const provinceLabel = `จังหวัด${provinceName}`;

  return (
    <>
      <div className="db2-page" style={{ minHeight: "100vh", background: "linear-gradient(180deg,#ecfdf5 0%,#f8fafc 60%)", paddingTop: 110, paddingBottom: 60, fontFamily: "'Noto Sans Thai','Inter',sans-serif" }}>
      <div className="db2-wrap">

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <div className="db2-hero" style={{
          background: "radial-gradient(900px 340px at -5% -10%, rgba(16,185,129,0.13) 0%, transparent 65%), radial-gradient(700px 300px at 110% 0%, rgba(16,185,129,0.09) 0%, transparent 60%), linear-gradient(135deg,#ffffff 0%,#f0fdf4 100%)",
          border: "1px solid rgba(16,185,129,0.14)",
          boxShadow: "0 4px 24px rgba(16,185,129,0.08)",
        }}>
          {/* decorative blobs */}
          <div style={{ position: "absolute", right: -60, top: -60, width: 320, height: 320, borderRadius: "50%", background: "rgba(16,185,129,0.05)" }} />
          <div style={{ position: "absolute", right: 100, bottom: -80, width: 200, height: 200, borderRadius: "50%", background: "rgba(16,185,129,0.04)" }} />

          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ background: "rgba(5,150,105,0.08)", border: "1px solid rgba(5,150,105,0.18)", borderRadius: 8, padding: "5px 14px", fontSize: 15, fontWeight: 700, color: "#047857" }}>
                  <i className="bi bi-geo-alt-fill" style={{ marginRight: 5 }} />ศักยภาพคาร์บอนระดับพื้นที่
                </span>
                <span style={{ background: "rgba(5,150,105,0.1)", border: "1px solid rgba(5,150,105,0.2)", borderRadius: 8, padding: "5px 14px", fontSize: 15, fontWeight: 700, color: "#059669" }}>
                  <i className="bi bi-geo-alt-fill" style={{ marginRight: 5 }} />{provinceLabel}
                </span>
              </div>
              <h1 style={{ fontSize: isMobile ? 24 : 34, fontWeight: 900, color: "#064e3b", margin: "0 0 8px", letterSpacing: -0.8, lineHeight: 1.15 }}>
                ปริมาณคาร์บอนสะสม
              </h1>
              <div style={{ fontSize: isMobile ? 15 : 17, color: "#64748b", margin: 0, fontWeight: 500, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                <span>คำนวนจากฐานข้อมูลอายุแปลงปลูก</span>
                <span style={yearBadgeStyle}>
                  {/* plantingYearVersion is a CE year (e.g. 2026) */}
                  ปี พ.ศ. {stock?.data.config.plantingYearVersion != null ? stock.data.config.plantingYearVersion + BE_OFFSET : "–"}
                </span>
                <span>และข้อมูลการใช้ประโยชน์ที่ดิน (LU) กรมพัฒนาที่ดิน</span>
                <span style={yearBadgeStyle}>
                  ปี พ.ศ. {stock?.data.config.luVersion ?? "–"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Scope selectors ──────────────────────────────────────────────── */}
        <div className="db2-card" style={{ padding: "14px 20px" }}>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <Select label="เลือกภูมิภาค" icon="bi-globe-asia-australia" value={region} disabled={!provinces?.length}
              onChange={(v) => {
                setRegion(v);
                setPCode(provinces?.find(p => p.regionTh === v)?.pCode ?? "");
                setSelectedId("all");
              }}>
              {!provinces?.length && <option value="">{provinces ? "ไม่มีข้อมูลภูมิภาค" : "กำลังโหลด..."}</option>}
              {regions.map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
            <Select label="เลือกจังหวัด" icon="bi-map" value={pCode} disabled={!regionProvinces.length}
              onChange={(v) => { setPCode(v); setSelectedId("all"); }}>
              {!regionProvinces.length && <option value="">{provinces ? "ไม่มีข้อมูลจังหวัด" : "กำลังโหลด..."}</option>}
              {regionProvinces.map((p) => <option key={p.pCode} value={p.pCode}>{p.nameTh}</option>)}
            </Select>
            <Select label="เลือกอำเภอ" icon="bi-geo-alt-fill" value={selectedId} onChange={setSelectedId}>
              <option value="all">
                {provinceTotal.name}{stock ? ` — ${formatArea(provinceTotal.areaRai)} ไร่` : ""}
              </option>
              {districts.map(d => (
                <option key={d.id} value={d.id}>{d.name} — {formatArea(d.areaRai)} ไร่</option>
              ))}
            </Select>
          </div>
        </div>

        {stockError && (
          <div role="alert" className="db2-card" style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 10, color: "#b91c1c", fontWeight: 600 }}>
            <i className="bi bi-exclamation-triangle" />{stockError}
          </div>
        )}

        {/* ── Map + District panel ─────────────────────────────────────────── */}
        <div className="db2-main-row">

          {/* Map */}
          <div className="db2-card db2-map-card">
            <div className="db2-card-header">
              <i className="bi bi-map-fill" style={{ color: "#059669" }} />
              <span>แผนที่ปริมาณคาร์บอนสะสมรายอำเภอ {provinceLabel}</span>
              <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700, color: "#059669", background: "rgba(5,150,105,0.1)", padding: "3px 10px", borderRadius: 50, border: "1px solid rgba(5,150,105,0.18)" }}>
                {formatArea(provinceTotal.areaRai)} ไร่
              </span>
            </div>
            <div className="db2-map-body">
              <DashboardMap
                plots={mapPlots}
                provinceName={provinceName}
                districts={mapDistricts}
                selectedDistrictId={selectedId}
                onSelectDistrict={setSelectedId}
              />
            </div>
          </div>

          {/* District info */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Summary card */}
            <div style={{ background: "linear-gradient(135deg,#f0fdf4,#ecfdf5)", borderRadius: 16, padding: 20, border: "1px solid rgba(16,185,129,0.18)", boxShadow: "0 2px 10px rgba(16,185,129,0.08)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <div style={{ width: 44, height: 44, borderRadius: 13, background: "linear-gradient(135deg,#059669,#047857)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(5,150,105,0.3)", flexShrink: 0 }}>
                  <i className="bi bi-geo-alt-fill" style={{ color: "#fff", fontSize: 22 }} />
                </div>
                <div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: "#064e3b", lineHeight: 1 }}>{selected.name}</div>
                  <div style={{ fontSize: 16, color: "#64748b", fontWeight: 500, marginTop: 3 }}>{provinceLabel} · ข้อมูลระบบ</div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
                  { label: "พื้นที่ปลูกยางพารา", value: selected.areaRai, unit: "ไร่", color: "#052e16", digits: 2 },
                  { label: "คาร์บอนสะสมรวม", value: selected.carbon, unit: "tCO₂eq", color: "#065f46", digits: 0 },
                ].map(m => (
                  <div key={m.label} style={{ background: "#fff", borderRadius: 11, padding: "12px 14px", border: "1px solid rgba(16,185,129,0.12)" }}>
                    <div style={{ fontSize: 14, color: "#64748b", fontWeight: 600, marginBottom: 4 }}>{m.label} <span>({m.unit})</span></div>
                    <div style={{ fontSize: 26, fontWeight: 900, color: m.color, letterSpacing: -0.8, lineHeight: 1 }}><AnimatedNumber value={m.value} digits={m.digits} /></div>
                  </div>
                ))}
              </div>
            </div>

            {/* Age distribution */}
            <div className="db2-card" style={{ padding: "16px 18px", flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a", marginBottom: 16 }}>
                <i className="bi bi-bar-chart-steps" style={{ marginRight: 7, color: "#059669" }} />การกระจายตามช่วงอายุยาง
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {selected.ageDist.map(a => {
                  const cfg = AGE_GROUPS.find(c => c.key === a.key)!;
                  // Bar length is relative to the group with the most carbon.
                  const barPct = Math.round((a.carbon / maxAgeCarbon) * 100);
                  const carbonPct = selected.carbon > 0 ? ((a.carbon / selected.carbon) * 100).toFixed(1) : "0";
                  const areaPct = selected.areaRai > 0 ? ((a.areaRai / selected.areaRai) * 100).toFixed(1) : "0";
                  const badge = { fontSize: 13, fontWeight: 700, background: cfg.bg, color: cfg.dark, borderRadius: 5, padding: "1px 6px" };
                  return (
                    <div key={a.key}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <span style={{ width: 11, height: 11, borderRadius: 3, background: cfg.color, flexShrink: 0 }} />
                          <span style={{ fontSize: 15, fontWeight: 700, color: "#374151" }}>{cfg.label}</span>
                          <span style={{ fontSize: 14, fontWeight: 500, color: "#94a3b8", fontStyle: "bold" }}>{cfg.stage}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 15, fontWeight: 800, color: cfg.dark }}>{fmtC(a.carbon)}<span style={{ fontSize: 13, fontWeight: 600, marginLeft: 3, opacity: 0.7 }}>tCO₂eq</span></span>
                          <span title="สัดส่วนคาร์บอน" style={badge}>{carbonPct}%</span>
                        </div>
                      </div>
                      <div style={{ height: 7, background: "#f1f5f9", borderRadius: 4, overflow: "hidden", marginBottom: 4 }}>
                        <div style={{ height: "100%", width: `${barPct}%`, background: `linear-gradient(90deg,${cfg.color}88,${cfg.color})`, borderRadius: 4, transition: "width 0.7s cubic-bezier(.16,1,.3,1)", minWidth: 4 }} />
                      </div>
                      {/* Indented past the colour swatch (11px + 7px gap) to line up with the age label. */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 18, fontSize: 14, color: "#94a3b8", fontWeight: 700 }}>
                        <span title="สัดส่วนพื้นที่" style={{ ...badge, background: "#f1f5f9", color: "#64748b" }}>{areaPct}%</span>
                        {formatArea(a.areaRai)} ไร่
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* ── District carbon chart ────────────────────────────────────────── */}
        <div className="db2-card" style={{ overflow: "hidden", marginBottom: 20 }}>
          <div className="db2-card-header">
            <i className="bi bi-bar-chart-steps" style={{ color: "#059669" }} />
            <span>เปรียบเทียบคาร์บอนสะสมรายอำเภอ</span>
            <span style={{ marginLeft: 6, fontWeight: 500, color: "#94a3b8", fontSize: 15 }}>{provinceLabel} · คลิกเพื่อเลือกอำเภอ</span>
          </div>
          <div style={{ padding: "16px 20px 12px" }}>
            {districts.length ? (
              <DistrictCarbonChart selectedId={selectedId} onSelect={setSelectedId} isMobile={isMobile} districts={districts} />
            ) : (
              <div style={{ padding: 32, textAlign: "center", color: "#64748b", fontWeight: 600 }}>
                {stockError ? "ไม่สามารถโหลดข้อมูลได้" : "กำลังคำนวณคาร์บอนสะสม..."}
              </div>
            )}
          </div>
        </div>

        {/* ── Age distribution chart ───────────────────────────────────────── */}
        <div className="db2-card" style={{ padding: isMobile ? "16px 14px 20px" : "24px 28px 28px" }}>
          {stock ? (
            <AgeDistributionChart
              isMobile={isMobile}
              perYearRai={selected.perYearRai}
              perYearCarbon={selected.perYearCarbon}
              scopeLabel={selectedDistrictName ? `อำเภอ${selectedDistrictName}` : provinceLabel}
              refYear={stock.data.config.plantingYearVersion}
            />
          ) : (
            <div style={{ padding: 32, textAlign: "center", color: "#64748b", fontWeight: 600 }}>
              {stockError ? "ไม่สามารถโหลดข้อมูลได้" : "กำลังโหลดข้อมูลการกระจายอายุยาง..."}
            </div>
          )}
        </div>

        {/* ── Key indicators ───────────────────────────────────────────────── */}
        {stock && (
          <div className="db2-card" style={{ padding: isMobile ? "16px 14px" : "20px 24px" }}>
            <div style={{ fontSize: isMobile ? 16 : 20, fontWeight: 900, color: "#064e3b", marginBottom: 14 }}>
              <i className="bi bi-clipboard-data" style={{ marginRight: 8, color: "#059669" }} />
              ตัวชี้วัดสำคัญ
              <span style={{ marginLeft: 8, fontSize: isMobile ? 13 : 15, fontWeight: 500, color: "#94a3b8" }}>
                {selectedDistrictName ? `อำเภอ${selectedDistrictName}` : provinceLabel}
              </span>
            </div>
            <InsightCards d={selected} />
          </div>
        )}

      </div>

      <style>{`
        .db2-wrap { max-width: 1300px; margin: 0 auto; padding: 0 28px; }
        .db2-hero { position: relative; border-radius: 20px; padding: 36px 44px; margin-bottom: 22px; overflow: hidden; background: #fff; }
        .db2-main-row { display: grid; grid-template-columns: 1.65fr 1fr; gap: 16px; margin-bottom: 18px; }
        .db2-map-card { display: flex; flex-direction: column; }
        /* Desktop: stretch to the district panel beside it (grid row height), never below 520px. */
        .db2-map-body { flex: 1; min-height: 520px; }
        .db2-card { background: #fff; border-radius: 16px; border: 1px solid rgba(16,185,129,0.1); box-shadow: 0 2px 12px rgba(16,185,129,0.06); margin-bottom: 18px; }
        .db2-kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
        .db2-kpi-card { background: #fff; border-radius: 14px; padding: 18px; border: 1px solid rgba(16,185,129,0.12); box-shadow: 0 2px 10px rgba(16,185,129,0.06); }
        .db2-card-header { display: flex; align-items: center; gap: 9px; padding: 13px 18px; border-bottom: 1px solid rgba(16,185,129,0.08); font-size: 15px; font-weight: 800; color: #0f172a; }
        select:focus { border-color: #059669 !important; box-shadow: 0 0 0 3px rgba(5,150,105,0.15) !important; }

        @media (max-width: 1024px) {
          .db2-main-row { grid-template-columns: 1fr; }
          .db2-map-body { flex: none; height: 400px; min-height: 0; }
          .db2-kpi-row { grid-template-columns: repeat(2, 1fr); }
        }

        /* ── Mobile (≤ 640px) ── */
        @media (max-width: 640px) {
          .db2-page { padding-top: 100px !important; padding-bottom: 36px !important; }
          .db2-wrap { padding: 0 12px; }
          .db2-hero { padding: 18px 16px; border-radius: 14px; margin-bottom: 14px; }
          .db2-hero h1 { font-size: 18px !important; }
          .db2-hero p  { font-size: 14px !important; }
          .db2-main-row { gap: 12px; margin-bottom: 12px; }
          .db2-map-body { height: 260px; }
          .db2-card { border-radius: 12px; margin-bottom: 12px; }
          .db2-card-header { padding: 10px 14px; font-size: 14px; gap: 7px; }
          .db2-kpi-row { grid-template-columns: 1fr; gap: 10px; }
          .db2-kpi-card { padding: 14px; }
        }
      `}</style>
      </div>
      <Footer />
    </>
  );
}