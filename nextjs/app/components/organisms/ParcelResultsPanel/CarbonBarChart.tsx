"use client";
import { useState } from "react";

// All-green theme: lime → mint → emerald → forest → teal
const GREEN_THEME_COLORS = [
  { bar: "#a3e635", bg: "rgba(163,230,53,0.15)", label: "#3f6212", name: "รอบที่ 1" }, // Lime
  { bar: "#4ade80", bg: "rgba(74,222,128,0.15)", label: "#14532d", name: "รอบที่ 2" }, // Mint
  { bar: "#10b981", bg: "rgba(16,185,129,0.15)", label: "#064e3b", name: "รอบที่ 3" }, // Emerald
  { bar: "#059669", bg: "rgba(5,150,105,0.15)", label: "#064e3b", name: "รอบที่ 4" }, // Forest
  { bar: "#0d9488", bg: "rgba(13,148,136,0.15)", label: "#134e4a", name: "รอบที่ 5" }, // Teal
];

export const CUT_AGE = 27;   // โค่นและปลูกใหม่ที่ 27 ปี
export const TOTAL_PROJ_YEARS = 35; // จำลองไปข้างหน้า 35 ปี

const getCycleColor = (cycle: number) =>
  GREEN_THEME_COLORS[Math.min(Math.max(0, cycle), GREEN_THEME_COLORS.length - 1)];

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
  title = "ปริมาณการกักเก็บคาร์บอนสะสม",
  narrowMode = false,
}: {
  pts: BarPoint[];
  isMobile?: boolean;
  title?: string;
  narrowMode?: boolean;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  if (!pts.length) return null;

  const W = isMobile ? 500 : (narrowMode ? 640 : 960);
  const H = isMobile ? 340 : (narrowMode ? 440 : 400);
  const PL = isMobile ? 36 : (narrowMode ? 52 : 60);
  const PT = isMobile ? 40 : 50;
  const PB = isMobile ? 85 : (narrowMode ? 85 : 80);
  const PR = isMobile ? 25 : (narrowMode ? 24 : 30);
  const iW = W - PL - PR;
  const iH = H - PT - PB;

  const maxValueWithMargin = Math.max(...pts.map((p) => p.co2 + p.ci), 1);
  const maxCo2 = maxValueWithMargin * 1.15;
  const barW = iW / pts.length - (isMobile ? 1.5 : 4);
  const gap = isMobile ? 1.5 : 4;

  // Calculate line path points
  const linePoints = pts.map((p, i) => {
    const bh = Math.max((p.co2 / maxCo2) * iH, 2);
    const x = PL + i * (barW + gap) + barW / 2;
    const y = PT + iH - bh;
    return { x, y };
  });

  const linePath = linePoints
    .map((p, i) => (i === 0 ? `M ${p.x},${p.y}` : `L ${p.x},${p.y}`))
    .join(" ");

  return (
    <div style={{ background: "linear-gradient(135deg,#f0fdf4,#dcfce7)", borderRadius: 16, padding: isMobile ? "12px 10px 8px" : "20px 16px 12px", boxShadow: "0 10px 30px -5px rgba(5,150,105,0.12)", maxWidth: (isMobile || narrowMode) ? undefined : 860, margin: (isMobile || narrowMode) ? undefined : "0 auto", border: "1px solid rgba(16,185,129,0.15)" }}>
      {title && (
        <div style={{ textAlign: "center", fontSize: isMobile ? 12 : (narrowMode ? 17 : 20), fontWeight: 800, color: "#064e3b", marginBottom: 8 }}>
          {title}
        </div>
      )}

      <div>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: "100%", height: "auto", display: "block", overflow: "visible" }}
        >
          <defs>
            {GREEN_THEME_COLORS.map((c, i) => (
              <linearGradient key={i} id={`cycleGradGreen${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={c.bar} stopOpacity="0.95" />
                <stop offset="100%" stopColor={c.bar} stopOpacity="0.65" />
              </linearGradient>
            ))}
            <filter id="barShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.15" />
            </filter>
            <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#a3e635" />
              <stop offset="25%" stopColor="#4ade80" />
              <stop offset="50%" stopColor="#10b981" />
              <stop offset="75%" stopColor="#059669" />
              <stop offset="100%" stopColor="#0d9488" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <line key={t} x1={PL} y1={PT + t * iH} x2={PL + iW} y2={PT + t * iH} stroke="rgba(0,0,0,0.05)" strokeWidth={1} strokeDasharray={t < 1 && t > 0 ? "4,4" : undefined} />
          ))}

          {/* Baseline from first bar (Current Level) */}
          {linePoints[0] && (
            <line
              x1={PL} y1={linePoints[0].y} x2={PL + iW} y2={linePoints[0].y}
              stroke="#059669" strokeWidth={1.5} strokeDasharray="6,4" opacity={0.4}
            />
          )}

          {/* Bars */}
          {pts.map((p, i) => {
            const bh = Math.max((p.co2 / maxCo2) * iH, 2);
            const x = PL + i * (barW + gap);
            const y = PT + iH - bh;
            const col = getCycleColor(p.cycle);
            const isHov = hoverIdx === i;
            const cycleClamp = Math.min(Math.max(0, p.cycle), GREEN_THEME_COLORS.length - 1);
            const errorSize = (p.ci / maxCo2) * iH;
            const lineX = x + barW / 2;

            return (
              <g key={i} onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(null)} style={{ cursor: "pointer" }}>
                {isHov && <rect x={x - 2} y={PT} width={barW + 4} height={iH} rx={4} fill={col.bar} opacity={0.06} />}
                <rect x={x} y={y} width={barW} height={bh} rx={isMobile ? 2 : 4} fill={`url(#cycleGradGreen${cycleClamp})`} filter={isHov ? "url(#barShadow)" : undefined} style={{ transition: "all 0.2s" }} />

                {/* Error bars using p.ci from backend */}
                <line x1={lineX} y1={y - errorSize} x2={lineX} y2={y + errorSize} stroke="#000000" strokeWidth={1} opacity={0.8} />
                <line x1={lineX - 2} y1={y - errorSize} x2={lineX + 2} y2={y - errorSize} stroke="#000000" strokeWidth={1} opacity={0.8} />
                <line x1={lineX - 2} y1={y + errorSize} x2={lineX + 2} y2={y + errorSize} stroke="#000000" strokeWidth={1} opacity={0.8} />
              </g>
            );
          })}

          {/* Trend Line */}
          <path d={linePath} fill="none" stroke="url(#lineGrad)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.8} style={{ pointerEvents: "none" }} />

          {/* Trend Line Points */}
          {linePoints.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={2.5} fill="#fff" stroke={getCycleColor(pts[i].cycle).label} strokeWidth={1.5} opacity={0.9} style={{ pointerEvents: "none" }} />
          ))}

          {/* X-axis labels every 7th bar: year_at above BE year */}
          {pts.map((p, i) => {
            if (i % 7 !== 0) return null;
            const x = PL + i * (barW + gap) + barW / 2;
            return (
              <g key={i}>
                <text x={x} y={PT + iH + (isMobile ? 20 : 26)} textAnchor="middle" fontSize={isMobile ? 9 : 11} fill="#475569" fontWeight={700}>
                  {p.year_at}
                </text>
                <text x={x} y={PT + iH + (isMobile ? 34 : 44)} textAnchor="middle" fontSize={isMobile ? 9 : 12} fill="#94a3b8" fontWeight={500}>
                  {p.yearBE}
                </text>
              </g>
            );
          })}

          {/* Y-axis label */}
          <text x={isMobile ? 2 : PL - 6} y={PT + 5} textAnchor={isMobile ? "start" : "end"} fontSize={isMobile ? 12 : 16} fill="#94a3b8" fontWeight={600}>tCO₂</text>

          {/* X-axis row labels */}
          <text x={isMobile ? 4 : PL - 12} y={PT + iH + (isMobile ? 20 : 26)} textAnchor={isMobile ? "start" : "end"} fontSize={isMobile ? 9 : 11} fill="#64748b" fontWeight={600}>ปีที่</text>
          <text x={isMobile ? 4 : PL - 12} y={PT + iH + (isMobile ? 34 : 44)} textAnchor={isMobile ? "start" : "end"} fontSize={isMobile ? 9 : 12} fill="#64748b" fontWeight={600}>พ.ศ.</text>

          {/* Tooltip */}
          {hoverIdx !== null && (() => {
            const p = pts[hoverIdx];
            const col = getCycleColor(p.cycle);
            const bh = Math.max((p.co2 / maxCo2) * iH, 2);
            const x = PL + hoverIdx * (barW + gap) + barW / 2;
            const y = PT + iH - bh;
            const ttW = isMobile ? 140 : 180;
            const ttH = isMobile ? 108 : 124;
            const ttX = Math.min(Math.max(x - ttW / 2, 4), W - ttW - 4);
            const ttY = Math.max(y - ttH - 12, 4);
            const divY = ttY + (isMobile ? 72 : 84);
            return (
              <g pointerEvents="none">
                <rect x={ttX} y={ttY} width={ttW} height={ttH} rx={10} fill="#022c22" style={{ filter: "drop-shadow(0 4px 12px rgba(5,150,105,0.35))" }} />
                <text x={ttX + ttW / 2} y={ttY + (isMobile ? 18 : 20)} textAnchor="middle" fontSize={isMobile ? 10 : 11} fill={col.bar} fontWeight={800}>
                  อายุยางพารา · {p.age} ปี · พ.ศ. {p.yearBE}
                </text>
                <text x={ttX + ttW / 2} y={ttY + (isMobile ? 36 : 44)} textAnchor="middle" fontSize={isMobile ? 14 : 17} fill="#fff" fontWeight={900}>
                  {Math.round(p.co2).toLocaleString("th-TH")} ±{p.ci.toLocaleString("th-TH", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                </text>
                <text x={ttX + ttW / 2} y={ttY + (isMobile ? 54 : 64)} textAnchor="middle" fontSize={isMobile ? 10 : 11} fill="#94a3b8" fontWeight={600}>
                  คาร์บอนสะสม (tCO₂)
                </text>
                <line x1={ttX + 10} y1={divY} x2={ttX + ttW - 10} y2={divY} stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
                <text x={ttX + ttW / 2} y={divY + (isMobile ? 14 : 16)} textAnchor="middle" fontSize={isMobile ? 13 : 15} fill="#7dd3fc" fontWeight={900}>
                  {p.gainValue.toLocaleString("th-TH", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ±{p.gainCi.toLocaleString("th-TH", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                </text>
                <text x={ttX + ttW / 2} y={divY + (isMobile ? 28 : 32)} textAnchor="middle" fontSize={isMobile ? 9 : 10} fill="#94a3b8" fontWeight={600}>
                  เกณฑ์คาร์บอน (tCO₂/ปี)
                </text>
              </g>
            );
          })()}
        </svg>
      </div>
    </div>
  );
}

