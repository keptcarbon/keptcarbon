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
const MAX_AGE_DISPLAY = 28; // แสดงกราฟถึงอายุ 28 ปี

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
  showAge = true,
}: {
  pts: BarPoint[];
  isMobile?: boolean;
  title?: string;
  narrowMode?: boolean;
  showAge?: boolean;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  if (!pts.length) return null;

  // กรองเฉพาะข้อมูลที่อายุ <= MAX_AGE_DISPLAY
  const displayPts = pts.filter(p => p.age <= MAX_AGE_DISPLAY);
  if (!displayPts.length) return null;

  const W = isMobile ? 560 : (narrowMode ? 760 : 1120);
  const H = isMobile ? 520 : (narrowMode ? 600 : 640);
  const PL = isMobile ? 46 : (narrowMode ? 62 : 78);
  const PT = isMobile ? 50 : 64;
  const PB = showAge
    ? (isMobile ? 130 : (narrowMode ? 132 : 136))
    : (isMobile ? 96 : (narrowMode ? 98 : 102));
  const PR = isMobile ? 30 : (narrowMode ? 32 : 40);
  const iW = W - PL - PR;
  const iH = H - PT - PB;

  const maxValueWithMargin = Math.max(...displayPts.map((p) => (p.co2 || 0) + (p.ci || 0)), 1);
  const maxCo2 = maxValueWithMargin * 1.15;
  const gap = isMobile ? 2 : 5;
  
  // Calculate standard max bar width for ~28 bars, cap it so it doesn't get huge
  let barW = iW / displayPts.length - gap;
  const maxBarW = isMobile ? 48 : 72;
  if (barW > maxBarW) barW = maxBarW;

  const totalBarsWidth = displayPts.length * barW + Math.max(0, displayPts.length - 1) * gap;
  const startX = PL + Math.max(0, (iW - totalBarsWidth) / 2);
  const gridStart = Math.max(PL, startX - (isMobile ? 12 : 24));
  const gridEnd = Math.min(PL + iW, startX + totalBarsWidth + (isMobile ? 12 : 24));

  const labelStep = displayPts.length <= 10 ? 1 : (displayPts.length <= 20 ? 3 : 7);

  const linePoints = displayPts.map((p, i) => {
    const bh = Math.max(((p.co2 || 0) / maxCo2) * iH, 2);
    const x = startX + i * (barW + gap) + barW / 2;
    const y = PT + iH - bh;
    return { x, y };
  });

  const linePath = linePoints
    .map((p, i) => (i === 0 ? `M ${p.x},${p.y}` : `L ${p.x},${p.y}`))
    .join(" ");

  // ตัดสินว่า tooltip อยู่ที่ไหน
  const hoveredPt = hoverIdx !== null ? displayPts[hoverIdx] : null;

  return (
    <div style={{ 
      background: "linear-gradient(135deg,#f0fdf4,#dcfce7)", 
      borderRadius: 16, 
      padding: isMobile ? "14px 10px 10px" : "24px 20px 14px", 
      boxShadow: "0 10px 30px -5px rgba(5,150,105,0.12)", 
      border: "1px solid rgba(16,185,129,0.15)",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center"
    }}>
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
          <line key={t} x1={gridStart} y1={PT + t * iH} x2={gridEnd} y2={PT + t * iH}
            stroke="rgba(0,0,0,0.06)" strokeWidth={1}
            strokeDasharray={t > 0 && t < 1 ? "4,4" : undefined} />
        ))}

        {/* Bars */}
        {displayPts.map((p, i) => {
          const bh = Math.max(((p.co2 || 0) / maxCo2) * iH, 4);
          const x = startX + i * (barW + gap);
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
            x1={gridStart} y1={linePoints[0].y} x2={gridEnd} y2={linePoints[0].y}
            stroke="#15803d" strokeWidth={2.5} strokeDasharray="8,4" opacity={0.95}
            style={{ pointerEvents: "none" }}
          />
        )}

        {/* Trend Line */}
        <path d={linePath} fill="none" stroke="url(#lineGrad)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} style={{ pointerEvents: "none" }} />

        {/* Trend Line Dots */}
        {linePoints.map((lp, i) => {
          const dotCycle = displayPts[i].year_at === 0 ? 0 : Math.floor((displayPts[i].year_at - 1) / 7);
          const col = getCycleColor(dotCycle);
          return (
            <circle key={i} cx={lp.x} cy={lp.y} r={2.5} fill="#fff" stroke={col.bot} strokeWidth={1.5} opacity={0.9} style={{ pointerEvents: "none" }} />
          );
        })}

        {/* X-axis labels (dynamic frequency) */}
        {displayPts.map((p, i) => {
          if (i % labelStep !== 0 && i !== displayPts.length - 1) return null;
          const x = startX + i * (barW + gap) + barW / 2;
          return (
            <g key={i}>
              {/* อายุ (แทนที่ปีที่เดิม) */}
              {showAge && (
                <text x={x} y={PT + iH + (isMobile ? 30 : 40)} textAnchor="middle" fontSize={isMobile ? 15 : 18} fill="#475569" fontWeight={700}>
                  {p.age}
                </text>
              )}
              {/* พ.ศ. */}
              <text x={x} y={PT + iH + (showAge ? (isMobile ? 56 : 72) : (isMobile ? 30 : 40))} textAnchor="middle" fontSize={isMobile ? 15 : 18} fill="#94a3b8" fontWeight={500}>
                {p.yearBE}
              </text>
            </g>
          );
        })}

        {/* Y-axis label */}
        <text x={isMobile ? 2 : PL - 8} y={PT + 6} textAnchor={isMobile ? "start" : "end"} fontSize={isMobile ? 17 : 22} fill="#94a3b8" fontWeight={600}>tCO₂</text>

        {/* X-axis row labels — เปลี่ยนจาก "ปีที่" เป็น "อายุ" */}
        {showAge && (
          <text x={isMobile ? 4 : PL - 14} y={PT + iH + (isMobile ? 30 : 40)} textAnchor={isMobile ? "start" : "end"} fontSize={isMobile ? 15 : 18} fill="#64748b" fontWeight={600}>อายุ</text>
        )}
        <text x={isMobile ? 4 : PL - 14} y={PT + iH + (showAge ? (isMobile ? 56 : 72) : (isMobile ? 30 : 40))} textAnchor={isMobile ? "start" : "end"} fontSize={isMobile ? 15 : 18} fill="#64748b" fontWeight={600}>พ.ศ.</text>

        {/* Tooltip */}
        {hoverIdx !== null && hoveredPt && (() => {
          const p = hoveredPt;
          const hoverDisplayCycle = p.year_at === 0 ? 0 : Math.floor((p.year_at - 1) / 7);
          const col = getCycleColor(hoverDisplayCycle);
          const bh = Math.max(((p.co2 || 0) / maxCo2) * iH, 4);
          const x = startX + hoverIdx * (barW + gap) + barW / 2;
          const y = PT + iH - bh;

          // Tooltip dimensions
          const ttW = isMobile ? 240 : 280;
          const ttH = isMobile ? 230 : 270;
          const ttX = Math.min(Math.max(x - ttW / 2, 4), W - ttW - 4);
          const ttY = Math.max(y - ttH - 14, 4);

          const co2Val = Math.floor(p.co2 || 0);
          const co2Ci = (Math.floor((p.ci || 0) * 10) / 10);
          const gainVal = Math.floor(p.gainValue || 0);
          const gainCiVal = (Math.floor((p.gainCi || 0) * 10) / 10);

          return (
            <g pointerEvents="none">
              <foreignObject x={ttX} y={ttY} width={ttW} height={ttH}>
                <div style={{
                  width: "100%",
                  height: "100%",
                  background: "linear-gradient(145deg, rgba(2,44,34,0.95), rgba(6,78,59,0.85))",
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                  borderRadius: "20px",
                  border: "1px solid rgba(16,185,129,0.4)",
                  boxShadow: "0 10px 40px rgba(2,44,34,0.6), inset 0 1px 1px rgba(255,255,255,0.1)",
                  color: "#fff",
                  display: "flex",
                  flexDirection: "column",
                  padding: isMobile ? "16px" : "20px",
                  boxSizing: "border-box",
                  fontFamily: "inherit",
                  justifyContent: "space-between"
                }}>
                  {/* Header */}
                  <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
                    <div style={{ 
                      background: "rgba(255,255,255,0.12)", 
                      padding: "6px 16px", 
                      borderRadius: "24px",
                      color: col.top,
                      fontWeight: 800,
                      fontSize: isMobile ? 14 : 16,
                      border: `1px solid ${col.top}50`,
                      boxShadow: "0 2px 8px rgba(0,0,0,0.2)"
                    }}>
                      ปีที่ {p.year_at}
                    </div>
                  </div>

                  {/* Section 1: Carbon Storage */}
                  <div style={{ textAlign: "center", marginTop: isMobile ? 12 : 16 }}>
                    <div style={{ color: "rgba(255,255,255,0.75)", fontSize: isMobile ? 13 : 15, fontWeight: 700, marginBottom: 4, letterSpacing: "0.5px" }}>
                      กักเก็บคาร์บอน
                    </div>
                    <div style={{ fontSize: isMobile ? 24 : 28, fontWeight: 800, color: "#fff", display: "flex", alignItems: "baseline", justifyContent: "center", gap: 4, textShadow: "0 2px 10px rgba(0,0,0,0.3)" }}>
                      {co2Val.toLocaleString("th-TH")}
                      <span style={{ fontSize: isMobile ? 16 : 18, color: "rgba(255,255,255,0.75)", fontWeight: 600, textShadow: "none" }}>
                        ±{co2Ci.toLocaleString("th-TH", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                      </span>
                    </div>
                  </div>

                  {/* Elegant Divider */}
                  <div style={{ 
                    width: "100%", 
                    height: 1, 
                    background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)", 
                    margin: isMobile ? "12px 0" : "16px 0" 
                  }} />

                  {/* Section 2: Carbon Credit */}
                  <div style={{ textAlign: "center" }}>
                    <div style={{ color: "#38bdf8", fontSize: isMobile ? 15 : 17, fontWeight: 800, marginBottom: 4, letterSpacing: "0.5px" }}>
                      คาร์บอนเครดิต
                    </div>
                    <div style={{ fontSize: isMobile ? 32 : 40, fontWeight: 900, color: "#38bdf8", display: "flex", alignItems: "baseline", justifyContent: "center", gap: 4, lineHeight: 1.1, textShadow: "0 4px 16px rgba(56,189,248,0.4)" }}>
                      {gainVal.toLocaleString("th-TH")}
                      <span style={{ fontSize: isMobile ? 18 : 22, color: "rgba(56,189,248,0.75)", fontWeight: 700, textShadow: "none" }}>
                        ±{gainCiVal.toLocaleString("th-TH", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                      </span>
                    </div>
                    <div style={{ fontSize: isMobile ? 12 : 14, color: "rgba(56,189,248,0.65)", fontWeight: 600, marginTop: 4 }}>
                      tCO₂eq
                    </div>
                  </div>
                </div>
              </foreignObject>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}
