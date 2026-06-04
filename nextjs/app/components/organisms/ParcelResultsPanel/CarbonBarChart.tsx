"use client";
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { YearlyEstimate } from "@/lib/carbon-api";

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
  isAgeValid?: boolean;
};

export function profileToBarPoints(profile: YearlyEstimate[], baseAge: number = 0): BarPoint[] {
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
      isAgeValid: (item.age != null && !isNaN(item.age)),
    };
  });
}



export function CarbonBarChart({
  pts,
  isMobile,
  title = "ปริมาณคาร์บอนกักเก็บ (tCO₂eq)",
  narrowMode = false,
  showAge = true,
  initialMaxYearBE,
}: {
  pts: BarPoint[];
  isMobile?: boolean;
  title?: string;
  narrowMode?: boolean;
  showAge?: boolean;
  initialMaxYearBE?: number;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  if (!pts.length) return null;

  // ถ้าส่งอายุมา (กราฟเดี่ยว) ให้แสดงถึงอายุ 35 
  // ถ้าไม่ส่งอายุ (กราฟรวม) จะดึงข้อมูลทั้งหมดที่สรุปมาแล้ว
  const allPts = showAge ? pts.filter(p => p.age <= 35) : pts;
  if (!allPts.length) return null;

  const actualMaxIdx = Math.max(0, allPts.length - 1);
  const [range, setRange] = useState<[number, number]>([0, actualMaxIdx]);

  useEffect(() => {
    let initialMax = actualMaxIdx;
    
    if (showAge) {
      // กราฟแปลงเดี่ยว: เริ่มต้นโชว์ถึงอายุ 28 ก่อน ถ้าอยากดูถึง 35 ให้เลื่อนเอาเอง
      let idx28 = -1;
      for (let i = 0; i < allPts.length; i++) {
        if (allPts[i].age <= 28) {
          idx28 = i;
        }
      }
      initialMax = idx28 !== -1 ? idx28 : actualMaxIdx;
    } else {
      // กราฟรวม: แสดงถึงพ.ศ.ของแปลงที่สั้นที่สุดก่อน (ถ้ามีส่งมา) จากนั้นเลื่อนต่อได้
      if (initialMaxYearBE) {
        const idx = allPts.findIndex(p => p.yearBE === initialMaxYearBE);
        initialMax = idx !== -1 ? idx : actualMaxIdx;
      } else {
        initialMax = actualMaxIdx;
      }
    }
    
    setRange([0, initialMax]);
  }, [allPts.length, showAge, actualMaxIdx, initialMaxYearBE]);

  const minVal = Math.max(0, Math.min(range[0], actualMaxIdx));
  const maxVal = Math.max(minVal, Math.min(range[1], actualMaxIdx));

  const displayPts = allPts.slice(minVal, maxVal + 1);

  const W = isMobile ? 560 : (narrowMode ? 760 : 1120);
  const H = isMobile ? 280 : (narrowMode ? 320 : 340);
  const PL = isMobile ? 40 : (narrowMode ? 50 : 60);
  const PT = 15;
  const PB = showAge ? 82 : 44;
  const PR = isMobile ? 25 : 30;
  const iW = W - PL - PR;
  const iH = H - PT - PB;

  // Max value calculated on ALL points so scale remains stable
  const maxValueWithMargin = Math.max(...allPts.map((p) => (p.co2 || 0) + (p.ci || 0)), 1);
  const maxCo2 = maxValueWithMargin * 1.15;
  const gap = isMobile ? 2 : 5;

  let barW = iW / displayPts.length - gap;
  const maxBarW = isMobile ? 48 : 72;
  if (barW > maxBarW) barW = maxBarW;

  const totalBarsWidth = displayPts.length * barW + Math.max(0, displayPts.length - 1) * gap;
  const startX = PL + Math.max(0, (iW - totalBarsWidth) / 2);
  const gridStart = Math.max(PL, startX - (isMobile ? 12 : 24));
  const gridEnd = Math.min(PL + iW, startX + totalBarsWidth + (isMobile ? 12 : 24));

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
      padding: isMobile ? "12px 10px 8px" : "18px 16px 12px",
      boxShadow: "0 10px 30px -5px rgba(5,150,105,0.12)",
      border: "1px solid rgba(16,185,129,0.15)",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center"
    }}>
      {title && (
        <div style={{ textAlign: "center", fontSize: isMobile ? 14 : (narrowMode ? 15 : 17), fontWeight: 800, color: "#0f766e", marginTop: isMobile ? 0 : 4, marginBottom: isMobile ? 6 : 10 }}>
          {title === "ปริมาณการกักเก็บคาร์บอนสะสม (tCO₂)" ? "ปริมาณการกักเก็บคาร์บอนสะสม (tCO₂eq)" : title}
        </div>
      )}

      <div ref={wrapperRef} style={{ position: "relative", width: "100%" }}>
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
              <stop offset="0%" stopColor="#a3e635" />
              <stop offset="25%" stopColor="#4ade80" />
              <stop offset="50%" stopColor="#10b981" />
              <stop offset="75%" stopColor="#059669" />
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
              <g key={p.year_at} onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(null)} style={{ cursor: "pointer" }}>
                <rect x={x - gap / 2} y={PT} width={barW + gap} height={iH} fill="transparent" />
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
          {(() => {
            const year0Pt = allPts.find(p => p.year_at === 0) || allPts[0];
            const year0H = Math.max(((year0Pt.co2 || 0) / maxCo2) * iH, 4);
            const year0Y = PT + iH - year0H;
            return (
              <line
                x1={gridStart} y1={year0Y} x2={gridEnd} y2={year0Y}
                stroke="#15803d" strokeWidth={2.5} strokeDasharray="8,4" opacity={0.95}
                style={{ pointerEvents: "none" }}
              />
            );
          })()}

          {/* Trend Line */}
          <path d={linePath} fill="none" stroke="url(#lineGrad)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} style={{ pointerEvents: "none" }} />

          {/* Trend Line Dots */}
          {linePoints.map((lp, i) => {
            const dotCycle = displayPts[i].year_at === 0 ? 0 : Math.floor((displayPts[i].year_at - 1) / 7);
            const col = getCycleColor(dotCycle);
            return (
              <circle key={displayPts[i].year_at} cx={lp.x} cy={lp.y} r={2.5} fill="#fff" stroke={col.bot} strokeWidth={1.5} opacity={0.9} style={{ pointerEvents: "none" }} />
            );
          })}

          {/* X-axis labels (cycle boundary) */}
          {displayPts.map((p, i) => {
            // แสดง label ทุกๆ 7 ปี เริ่มจากปีแรก (ปี 0)
            if (i % 7 !== 0) return null;

            const x = startX + i * (barW + gap) + barW / 2;
            const isFirst = i === 0;
            return (
              <g key={p.year_at}>
                {/* อายุ — แถวแรกใส่คำว่า "อายุ" นำหน้า */}
                {showAge && (
                  <text x={x} y={PT + iH + 28} textAnchor="middle" fontSize={isMobile ? 16 : 22} fill="#475569" fontWeight={700}>
                    {isFirst ? `อายุ ${p.age}` : p.age}
                  </text>
                )}
                {/* พ.ศ. — แถวแรกใส่คำว่า "พ.ศ." นำหน้า */}
                <text x={x} y={PT + iH + (showAge ? 58 : 30)} textAnchor="middle" fontSize={isMobile ? 16 : 22} fill="#94a3b8" fontWeight={500}>
                  {isFirst ? `พ.ศ. ${p.yearBE}` : p.yearBE}
                </text>
              </g>
            );
          })}

        </svg>

        {/* Tooltip — Portal at document.body (position:fixed) to escape overflow:hidden ancestors */}
        {hoverIdx !== null && hoveredPt && wrapperRef.current && typeof window !== "undefined" && (() => {
          const rect = wrapperRef.current!.getBoundingClientRect();
          const scale = rect.width / W;

          const p = hoveredPt;
          const hoverDisplayCycle = p.year_at === 0 ? 0 : Math.floor((p.year_at - 1) / 7);
          const col = getCycleColor(hoverDisplayCycle);
          const bh = Math.max(((p.co2 || 0) / maxCo2) * iH, 4);
          const xSvg = startX + hoverIdx * (barW + gap) + barW / 2;
          const ySvg = PT + iH - bh;

          const xFixed = rect.left + xSvg * scale;
          const yFixed = rect.top + ySvg * scale;
          const xPct = xSvg / W * 100;
          const translateX = xPct > 70 ? "-90%" : xPct < 30 ? "-10%" : "-50%";

          const co2Val = Math.floor(p.co2 || 0);
          const co2Ci = (Math.floor((p.ci || 0) * 10) / 10).toLocaleString("th-TH", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
          const gainVal = Math.floor(p.gainValue || 0).toLocaleString("th-TH");
          const gainCiVal = (Math.floor((p.gainCi || 0) * 10) / 10).toLocaleString("th-TH", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

          const tooltipBottomY = yFixed - 10;

          return createPortal(
            <div style={{ zIndex: 9999, pointerEvents: "none" }}>
              <div style={{
                position: "fixed",
                left: xFixed,
                top: tooltipBottomY,
                transform: `translate(${translateX}, -100%)`,
                background: "#082f20",
                borderRadius: 8,
                borderTop: `3px solid ${col.top}`,
                boxShadow: "0 4px 16px rgba(0,0,0,0.45)",
                color: "#fff",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                padding: "8px 12px 10px",
                boxSizing: "border-box",
                fontFamily: "inherit",
                gap: 5,
                minWidth: 148,
              }}>
              <div style={{ color: col.top, fontSize: 12, fontWeight: 700, letterSpacing: "0.02em" }}>
                ปีที่ {p.year_at}
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ color: "#fff", fontSize: 11, fontWeight: 600, marginBottom: 1, opacity: 0.8 }}>
                  คาร์บอนกักเก็บ
                </div>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 3 }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: "#fff", lineHeight: 1 }}>
                    {co2Val.toLocaleString("th-TH")}
                  </span>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", fontWeight: 500 }}>
                    ±{co2Ci}
                  </span>
                </div>
              </div>
              <div style={{ width: "80%", height: 1, background: "rgba(255,255,255,0.12)" }} />
              <div style={{ textAlign: "center" }}>
                <div style={{ color: "rgba(56,189,248,0.9)", fontSize: 11, fontWeight: 600, marginBottom: 1 }}>
                  คาร์บอนเครดิต
                </div>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 3 }}>
                  <span style={{ fontSize: 20, fontWeight: 800, color: "#38bdf8", lineHeight: 1 }}>
                    {gainVal}
                  </span>
                  <span style={{ fontSize: 11, color: "rgba(56,189,248,0.6)", fontWeight: 500 }}>
                    ±{gainCiVal}
                  </span>
                </div>
                <div style={{ color: "rgba(186,230,253,0.7)", fontSize: 10, fontWeight: 500, marginTop: 2 }}>
                  tCO₂eq
                </div>
              </div>
              </div>
              <div style={{
                position: "fixed",
                left: xFixed,
                top: tooltipBottomY + 1,
                transform: "translate(-50%, 0)",
                width: 0,
                height: 0,
                borderLeft: "7px solid transparent",
                borderRight: "7px solid transparent",
                borderTop: "7px solid #082f20",
              }} />
            </div>,
            document.body
          );
        })()}
      </div>

      {/* Dual Range Slider for Window Selection */}
      {allPts.length > 1 && (
        <div style={{ marginTop: 12, padding: "0 12px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#0f766e" }}>
              ช่วงปีที่แสดงผล
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#10b981" }}>
              พ.ศ. {allPts[minVal]?.yearBE ?? 0} - {allPts[maxVal]?.yearBE ?? 0}
            </div>
          </div>

          <div style={{ position: "relative", width: "100%", height: 24, display: "flex", alignItems: "center" }}>
            {/* Background track */}
            <div style={{ position: "absolute", width: "100%", height: 6, background: "#e2e8f0", borderRadius: 3, zIndex: 1 }} />
            {/* Selected track */}
            <div style={{
              position: "absolute",
              left: `calc(8px + ${actualMaxIdx > 0 ? (minVal / actualMaxIdx) : 0} * (100% - 16px))`,
              width: `calc(${actualMaxIdx > 0 ? ((maxVal - minVal) / actualMaxIdx) : 0} * (100% - 16px))`,
              height: 6,
              background: "linear-gradient(90deg, #10b981, #059669)",
              borderRadius: 3,
              zIndex: 2,
              transition: "left 0.1s, width 0.1s"
            }} />
            {/* Min Input */}
            <input
              type="range"
              min={0}
              max={actualMaxIdx}
              value={minVal}
              onChange={(e) => {
                const value = Math.min(Number(e.target.value), maxVal - 1);
                setRange([value, maxVal]);
              }}
              style={{
                position: "absolute",
                width: "100%",
                zIndex: minVal > actualMaxIdx - 1 ? 4 : 3,
                WebkitAppearance: "none",
                appearance: "none",
                background: "transparent",
                pointerEvents: "none",
                margin: 0
              }}
              className="thumb-slider"
            />
            {/* Max Input */}
            <input
              type="range"
              min={0}
              max={actualMaxIdx}
              value={maxVal}
              onChange={(e) => {
                const value = Math.max(Number(e.target.value), minVal + 1);
                setRange([minVal, value]);
              }}
              style={{
                position: "absolute",
                width: "100%",
                zIndex: 3,
                WebkitAppearance: "none",
                appearance: "none",
                background: "transparent",
                pointerEvents: "none",
                margin: 0
              }}
              className="thumb-slider"
            />
          </div>

          {/* Ticks underneath the track */}
          <div style={{ position: "relative", width: "100%", height: 16, marginTop: -6 }}>
            {allPts.map((p, i) => {
              if (i % 7 !== 0) return null;

              return (
                <div key={p.year_at} style={{
                  position: "absolute",
                  left: `calc(8px + ${(i / actualMaxIdx)} * (100% - 16px))`,
                  transform: "translateX(-50%)",
                  fontSize: 11,
                  color: "#94a3b8",
                  fontWeight: 600
                }}>
                  {p.yearBE}
                </div>
              );
            })}
          </div>
        </div>
      )}
      <style>{`
        .thumb-slider::-webkit-slider-thumb {
          pointer-events: auto;
          -webkit-appearance: none;
          width: 16px;
          height: 16px;
          background: #fff;
          border: 2px solid #059669;
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        .thumb-slider::-moz-range-thumb {
          pointer-events: auto;
          width: 16px;
          height: 16px;
          background: #fff;
          border: 2px solid #059669;
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
      `}</style>
    </div>
  );
}
