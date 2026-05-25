"use client";
import { useState } from "react";

// All-green theme: lime → mint → emerald → forest → teal
const GREEN_THEME_COLORS = [
  { top: "#bef264", bot: "#84cc16", label: "#3f6212" }, // Lime
  { top: "#4ade80", bot: "#16a34a", label: "#14532d" }, // Mint
  { top: "#10b981", bot: "#059669", label: "#064e3b" }, // Emerald
  { top: "#059669", bot: "#047857", label: "#064e3b" }, // Forest
  { top: "#0d9488", bot: "#0f766e", label: "#134e4a" }, // Teal
];

const getCycleColor = (cycle: number) =>
  GREEN_THEME_COLORS[Math.min(Math.max(0, cycle), GREEN_THEME_COLORS.length - 1)];

export const TOTAL_PROJ_YEARS = 35;

export function carbonCo2(age: number, trees: number, spacing: string): number {
  const spacingMap: Record<string, number> = {
    "2.5*8": 80, "3*7": 76, "2.5*7": 91, "3*6": 89,
  };
  const treesPerRai = spacingMap[spacing] || 80;
  const effectiveTrees = trees > 0 ? trees : treesPerRai;
  const H = Math.min(2.0 + 1.8 * age, 28);
  const D = Math.min(3 + 4.5 * age, 60);
  const AGB = 0.1284 * D * D * H * 0.001;
  return (AGB + AGB * 0.26) * 0.47 * 3.67 * effectiveTrees;
}

export type BarPoint = {
  age: number;
  yearBE: number;
  year_at: number;
  co2: number;
  ci: number;
  gainValue: number;
  gainCi: number;
  cycle: number;
  cycleAge: number;
  errorMargin: number;
};

export function buildBarPoints(
  startAge: number,
  startYearBE: number,
  trees: number,
  spacing: string
): BarPoint[] {
  const pts: BarPoint[] = [];
  let continuousAge = startAge;
  const v0 = carbonCo2(startAge, trees, spacing);

  for (let i = 0; i < TOTAL_PROJ_YEARS; i++) {
    const period = Math.floor(i / 7);
    const co2 = carbonCo2(continuousAge, trees, spacing);
    const prevCo2 = i > 0 ? carbonCo2(continuousAge - 1, trees, spacing) : co2;
    const gainValue = i > 0 ? co2 - prevCo2 : 0;

    let errorMargin = 0;
    if (i > 0) {
      const growth = co2 - v0;
      const factor = 0.05 + 0.002 * i;
      errorMargin = Math.max(0, growth * factor);
    }

    pts.push({
      age: continuousAge,
      yearBE: startYearBE + i,
      year_at: i,
      co2,
      ci: errorMargin,
      gainValue,
      gainCi: 0,
      cycle: period,
      cycleAge: continuousAge,
      errorMargin,
    });
    continuousAge++;
  }
  return pts;
}

export function CarbonBarChart({
  pts,
  isMobile,
  title = "ปริมาณการกักเก็บคาร์บอนสะสม (tCO₂)",
  narrowMode = false,
}: {
  pts: BarPoint[];
  isMobile?: boolean;
  title?: string;
  narrowMode?: boolean;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  if (!pts.length) return null;

  const W = isMobile ? 560 : (narrowMode ? 760 : 1120);
  const H = isMobile ? 520 : (narrowMode ? 600 : 640);
  const PL = isMobile ? 46 : (narrowMode ? 62 : 78);
  const PT = isMobile ? 50 : 64;
  const PB = isMobile ? 130 : (narrowMode ? 132 : 136);
  const PR = isMobile ? 30 : (narrowMode ? 32 : 40);
  const iW = W - PL - PR;
  const iH = H - PT - PB;

  const maxValueWithMargin = Math.max(...pts.map((p) => (p.co2 || 0) + (p.ci || 0)), 1);
  const maxCo2 = maxValueWithMargin * 1.15;
  const barW = iW / pts.length - (isMobile ? 2 : 5);
  const gap = isMobile ? 2 : 5;

  const linePoints = pts.map((p, i) => {
    const bh = Math.max(((p.co2 || 0) / maxCo2) * iH, 2);
    const x = PL + i * (barW + gap) + barW / 2;
    const y = PT + iH - bh;
    return { x, y };
  });

  const linePath = linePoints
    .map((p, i) => (i === 0 ? `M ${p.x},${p.y}` : `L ${p.x},${p.y}`))
    .join(" ");

  return (
    <div style={{ background: "linear-gradient(135deg,#f0fdf4,#dcfce7)", borderRadius: 16, padding: isMobile ? "14px 10px 10px" : "24px 20px 14px", boxShadow: "0 10px 30px -5px rgba(5,150,105,0.12)", border: "1px solid rgba(16,185,129,0.15)" }}>
      {title && (
        <div style={{ textAlign: "center", fontSize: isMobile ? 16 : (narrowMode ? 22 : 26), fontWeight: 800, color: "#064e3b", marginBottom: 12 }}>
          {title}
        </div>
      )}

      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", display: "block", overflow: "visible" }}
      >
        <defs>
          {GREEN_THEME_COLORS.map((c, i) => (
            <linearGradient key={i} id={`cycleGradGreen${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c.top} stopOpacity="0.97" />
              <stop offset="100%" stopColor={c.bot} stopOpacity="0.80" />
            </linearGradient>
          ))}
          <filter id="barShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.18" />
          </filter>
          <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="#a3e635" />
            <stop offset="25%"  stopColor="#4ade80" />
            <stop offset="50%"  stopColor="#10b981" />
            <stop offset="75%"  stopColor="#059669" />
            <stop offset="100%" stopColor="#0d9488" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <line key={t} x1={PL} y1={PT + t * iH} x2={PL + iW} y2={PT + t * iH}
            stroke="rgba(0,0,0,0.06)" strokeWidth={1}
            strokeDasharray={t > 0 && t < 1 ? "4,4" : undefined} />
        ))}

        {/* Bars */}
        {pts.map((p, i) => {
          const bh = Math.max(((p.co2 || 0) / maxCo2) * iH, 4);
          const x = PL + i * (barW + gap);
          const y = PT + iH - bh;
          const isYearZero = p.year_at === 0;
          const displayCycle = isYearZero ? 0 : Math.floor((p.year_at - 1) / 7);
          const cycleClamp = Math.min(Math.max(0, displayCycle), GREEN_THEME_COLORS.length - 1);
          const col = getCycleColor(displayCycle);
          const isHov = hoverIdx === i;
          const errorSize = ((p.ci || 0) / maxCo2) * iH;
          const lineX = x + barW / 2;

          return (
            <g key={i} onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(null)} style={{ cursor: "pointer" }}>
              {isHov && !isYearZero && <rect x={x - 2} y={PT} width={barW + 4} height={iH} rx={4} fill={col.top} opacity={0.10} />}
              <rect
                x={x} y={y} width={barW} height={bh}
                rx={isMobile ? 2 : 3}
                fill={isYearZero ? "#ffffff" : `url(#cycleGradGreen${cycleClamp})`}
                stroke={isYearZero ? "#cbd5e1" : undefined}
                strokeWidth={isYearZero ? 1 : undefined}
                filter={isHov && !isYearZero ? "url(#barShadow)" : undefined}
                style={{ transition: "all 0.15s" }}
              />
              {(p.ci || 0) > 0 && (
                <>
                  <line x1={lineX} y1={y - errorSize} x2={lineX} y2={y + errorSize} stroke="#1e293b" strokeWidth={1.2} opacity={0.65} />
                  <line x1={lineX - 2.5} y1={y - errorSize} x2={lineX + 2.5} y2={y - errorSize} stroke="#1e293b" strokeWidth={1.2} opacity={0.65} />
                  <line x1={lineX - 2.5} y1={y + errorSize} x2={lineX + 2.5} y2={y + errorSize} stroke="#1e293b" strokeWidth={1.2} opacity={0.65} />
                </>
              )}
            </g>
          );
        })}

        {/* Baseline from year-0 bar — rendered above bars so it stays visible */}
        {linePoints[0] && (
          <line
            x1={PL} y1={linePoints[0].y} x2={PL + iW} y2={linePoints[0].y}
            stroke="#15803d" strokeWidth={2.5} strokeDasharray="8,4" opacity={0.95}
            style={{ pointerEvents: "none" }}
          />
        )}

        {/* Trend Line */}
        <path d={linePath} fill="none" stroke="url(#lineGrad)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} style={{ pointerEvents: "none" }} />

        {/* Trend Line Dots */}
        {linePoints.map((lp, i) => {
          const dotCycle = pts[i].year_at === 0 ? 0 : Math.floor((pts[i].year_at - 1) / 7);
          const col = getCycleColor(dotCycle);
          return (
            <circle key={i} cx={lp.x} cy={lp.y} r={2.5} fill="#fff" stroke={col.bot} strokeWidth={1.5} opacity={0.9} style={{ pointerEvents: "none" }} />
          );
        })}

        {/* X-axis labels every 7th bar: year_at above BE year */}
        {pts.map((p, i) => {
          if (i % 7 !== 0) return null;
          const x = PL + i * (barW + gap) + barW / 2;
          return (
            <g key={i}>
              <text x={x} y={PT + iH + (isMobile ? 30 : 40)} textAnchor="middle" fontSize={isMobile ? 15 : 18} fill="#475569" fontWeight={700}>
                {p.year_at}
              </text>
              <text x={x} y={PT + iH + (isMobile ? 56 : 72)} textAnchor="middle" fontSize={isMobile ? 15 : 18} fill="#94a3b8" fontWeight={500}>
                {p.yearBE}
              </text>
            </g>
          );
        })}

        {/* Y-axis label */}
        <text x={isMobile ? 2 : PL - 8} y={PT + 6} textAnchor={isMobile ? "start" : "end"} fontSize={isMobile ? 17 : 22} fill="#94a3b8" fontWeight={600}>tCO₂</text>

        {/* X-axis row labels */}
        <text x={isMobile ? 4 : PL - 14} y={PT + iH + (isMobile ? 30 : 40)} textAnchor={isMobile ? "start" : "end"} fontSize={isMobile ? 15 : 18} fill="#64748b" fontWeight={600}>ปีที่</text>
        <text x={isMobile ? 4 : PL - 14} y={PT + iH + (isMobile ? 56 : 72)} textAnchor={isMobile ? "start" : "end"} fontSize={isMobile ? 15 : 18} fill="#64748b" fontWeight={600}>พ.ศ.</text>

        {/* Tooltip */}
        {hoverIdx !== null && (() => {
          const p = pts[hoverIdx];
          const hoverDisplayCycle = p.year_at === 0 ? 0 : Math.floor((p.year_at - 1) / 7);
          const col = getCycleColor(hoverDisplayCycle);
          const bh = Math.max(((p.co2 || 0) / maxCo2) * iH, 4);
          const x = PL + hoverIdx * (barW + gap) + barW / 2;
          const y = PT + iH - bh;
          const ttW = isMobile ? 196 : 248;
          const ttH = isMobile ? 196 : 214;
          const ttX = Math.min(Math.max(x - ttW / 2, 4), W - ttW - 4);
          const ttY = Math.max(y - ttH - 14, 4);
          const divY = ttY + (isMobile ? 108 : 118);
          return (
            <g pointerEvents="none">
              <rect x={ttX} y={ttY} width={ttW} height={ttH} rx={10} fill="#022c22" style={{ filter: "drop-shadow(0 4px 14px rgba(5,150,105,0.35))" }} />
              <rect x={ttX} y={ttY} width={ttW} height={4} rx={2} fill={col.top} />
              {/* Header: age — 20px */}
              <text x={ttX + ttW / 2} y={ttY + (isMobile ? 46 : 50)} textAnchor="middle" fontSize={20} fill={col.top} fontWeight={700}>
                อายุ {p.age} ปี
              </text>
              {/* Stocks */}
              <text x={ttX + ttW / 2} y={ttY + (isMobile ? 84 : 92)} textAnchor="middle" fontSize={isMobile ? 22 : 26} fill="rgba(255,255,255,0.82)" fontWeight={700}>
                {Math.floor(p.co2 || 0).toLocaleString("th-TH")} ±{(Math.floor((p.ci || 0) * 10) / 10).toLocaleString("th-TH", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
              </text>
              <line x1={ttX + 12} y1={divY} x2={ttX + ttW - 12} y2={divY} stroke="rgba(255,255,255,0.10)" strokeWidth={1} />
              {/* Gain — HERO */}
              <text x={ttX + ttW / 2} y={divY + (isMobile ? 36 : 40)} textAnchor="middle" fontSize={isMobile ? 26 : 30} fill="#7dd3fc" fontWeight={900}>
                {Math.floor(p.gainValue || 0).toLocaleString("th-TH")} ±{(Math.floor((p.gainCi || 0) * 10) / 10).toLocaleString("th-TH", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
              </text>
              <text x={ttX + ttW / 2} y={divY + (isMobile ? 60 : 66)} textAnchor="middle" fontSize={isMobile ? 16 : 18} fill="rgba(125,211,252,0.9)" fontWeight={600}>
                เกณฑ์คาร์บอน (tCO₂/ปี)
              </text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}
