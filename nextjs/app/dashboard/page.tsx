"use client";

import { useEffect, useMemo, useState } from "react";
import DashboardMap, { type MapPlot } from "./DashboardMap";
import { getDashboardRayong, getDashboardDistricts, type DashboardRayongResponse, type DashboardDistrict } from "@/lib/carbon-api";

// ── Rayong province system database ──────────────────────────────────────────
const AGE_CONFIG = [
  { key: "1-5", label: "1–5 ปี", stage: "ระยะเริ่มต้น", color: "#4ade80", dark: "#166534", bg: "rgba(74,222,128,0.13)" },
  { key: "6-12", label: "6–12 ปี", stage: "ระยะเปิดกรีด", color: "#22c55e", dark: "#14532d", bg: "rgba(34,197,94,0.13)" },
  { key: "13-18", label: "13–18 ปี", stage: "ระยะสูงสุด", color: "#16a34a", dark: "#052e16", bg: "rgba(22,163,74,0.13)" },
  { key: "19+", label: "19+ ปี", stage: "ระยะคงที่", color: "#166534", dark: "#052e16", bg: "rgba(22,101,52,0.13)" },
];

type AgeDist = { key: string; areaRai: number; carbon: number };
type District = {
  id: string; name: string;
  plots: number; areaRai: number; carbon: number;
  ageDist: AgeDist[];
  lat: number; lng: number;
};

const DISTRICTS: District[] = [
  {
    id: "mueang", name: "เมืองระยอง", plots: 312, areaRai: 14250, carbon: 52340, lat: 12.6818, lng: 101.2587,
    ageDist: [{ key: "1-5", areaRai: 1918, carbon: 6200 }, { key: "6-12", areaRai: 4065, carbon: 18400 }, { key: "13-18", areaRai: 5526, carbon: 19800 }, { key: "19+", areaRai: 2740, carbon: 7940 }],
  },
  {
    id: "ban-chang", name: "บ้านฉาง", plots: 198, areaRai: 9120, carbon: 33840, lat: 12.7243, lng: 101.0594,
    ageDist: [{ key: "1-5", areaRai: 1013, carbon: 3600 }, { key: "6-12", areaRai: 2994, carbon: 12800 }, { key: "13-18", areaRai: 3731, carbon: 13900 }, { key: "19+", areaRai: 1382, carbon: 3540 }],
  },
  {
    id: "klaeng", name: "แกลง", plots: 687, areaRai: 31280, carbon: 118420, lat: 12.7781, lng: 101.6504,
    ageDist: [{ key: "1-5", areaRai: 4462, carbon: 14200 }, { key: "6-12", areaRai: 9152, carbon: 41800 }, { key: "13-18", areaRai: 11656, carbon: 48700 }, { key: "19+", areaRai: 6010, carbon: 13720 }],
  },
  {
    id: "wang-chan", name: "วังจันทร์", plots: 423, areaRai: 19640, carbon: 74130, lat: 12.9236, lng: 101.5678,
    ageDist: [{ key: "1-5", areaRai: 2693, carbon: 8900 }, { key: "6-12", areaRai: 5897, carbon: 26200 }, { key: "13-18", areaRai: 7661, carbon: 30100 }, { key: "19+", areaRai: 3389, carbon: 8930 }],
  },
  {
    id: "ban-khai", name: "บ้านค่าย", plots: 356, areaRai: 16420, carbon: 62180, lat: 12.7578, lng: 101.3856,
    ageDist: [{ key: "1-5", areaRai: 2214, carbon: 7200 }, { key: "6-12", areaRai: 4797, carbon: 21800 }, { key: "13-18", areaRai: 6365, carbon: 25600 }, { key: "19+", areaRai: 3044, carbon: 7580 }],
  },
  {
    id: "pluak-daeng", name: "ปลวกแดง", plots: 287, areaRai: 13140, carbon: 49810, lat: 12.9856, lng: 101.1923,
    ageDist: [{ key: "1-5", areaRai: 1740, carbon: 5800 }, { key: "6-12", areaRai: 3846, carbon: 17600 }, { key: "13-18", areaRai: 5127, carbon: 20600 }, { key: "19+", areaRai: 2426, carbon: 5810 }],
  },
  {
    id: "khao-chamao", name: "เขาชะเมา", plots: 384, areaRai: 17820, carbon: 67520, lat: 12.9418, lng: 101.7256,
    ageDist: [{ key: "1-5", areaRai: 2413, carbon: 7800 }, { key: "6-12", areaRai: 5337, carbon: 23800 }, { key: "13-18", areaRai: 6915, carbon: 27600 }, { key: "19+", areaRai: 3156, carbon: 8320 }],
  },
  {
    id: "nikhom", name: "นิคมพัฒนา", plots: 200, areaRai: 4820, carbon: 27010, lat: 12.8234, lng: 101.2345,
    ageDist: [{ key: "1-5", areaRai: 675, carbon: 4100 }, { key: "6-12", areaRai: 1446, carbon: 9800 }, { key: "13-18", areaRai: 1880, carbon: 10200 }, { key: "19+", areaRai: 819, carbon: 2910 }],
  },
];

const PROVINCE_TOTAL: District = {
  id: "all", name: "ทุกอำเภอ", lat: 12.6819, lng: 101.2587,
  plots: 2847, areaRai: 126490, carbon: 485250,
    ageDist: [
        { key: "1-5", areaRai: 17238, carbon: 57800 },
        { key: "6-12", areaRai: 37544, carbon: 172200 },
        { key: "13-18", areaRai: 48874, carbon: 196500 },
        { key: "19+", areaRai: 22925, carbon: 58750 },
    ],
};

const fmt = (n: number) => n.toLocaleString("th-TH");
const fmtC = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 0 });


// ── District carbon comparison chart ─────────────────────────────────────────
const DIST_STACKS = [
  { key: "1-5",   color: "#bbf7d0", label: "1–5 ปี",   stage: "ระยะเริ่มต้น" },
  { key: "6-12",  color: "#4ade80", label: "6–12 ปี",  stage: "ระยะเปิดกรีด" },
  { key: "13-18", color: "#16a34a", label: "13–18 ปี", stage: "ระยะสูงสุด" },
  { key: "19+",   color: "#166534", label: "19+ ปี",   stage: "ระยะคงที่" },
];

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
  const PT = isMobile ? 44 : 48;
  const PB = 10;

  const maxCarbon = Math.max(...districts.map(d => d.carbon));
  const iW = W - PL - PR;

  const rows = districts.map((d, i) => {
    const y = PT + i * (barH + gap);
    const bw = Math.max((d.carbon / maxCarbon) * iW, 4);
    let xOff = 0;
    const segs = DIST_STACKS.map(s => {
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
          {DIST_STACKS.map((s, i) => (
            <g key={s.key} transform={`translate(${PL + i * (isMobile ? 90 : 108)}, ${isMobile ? 16 : 17})`}>
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
          const ttW = isMobile ? 190 : 226;
          const lineH = isMobile ? 19 : 21;
          const ttH = (isMobile ? 46 : 52) + DIST_STACKS.length * lineH + 8;
          const midX = PL + bw / 2;
          const ttX = Math.min(Math.max(midX - ttW / 2, 4), W - ttW - 4);
          const ttY = y > totalH / 2 ? y - ttH - 10 : y + barH + 10;
          const pad = 14;

          return (
            <g pointerEvents="none">
              <rect x={ttX} y={ttY} width={ttW} height={ttH} rx={12}
                fill="#0f172a" style={{ filter: "drop-shadow(0 10px 28px rgba(0,0,0,0.4))" }} />
              <rect x={ttX} y={ttY} width={ttW} height={4} rx={2} fill="#10b981" />

              {/* Header */}
              <text x={ttX + pad} y={ttY + 22}
                fontSize={isMobile ? 14 : 15} fontWeight={800} fill="#fff">{d.name}</text>
              <text x={ttX + ttW - pad} y={ttY + 22}
                textAnchor="end" fontSize={isMobile ? 14 : 15} fontWeight={800} fill="#4ade80">
                {fmtC(d.carbon)}
                <tspan fontSize={10} fill="#64748b" dx={3}>tCO₂eq</tspan>
              </text>

              {/* Divider */}
              <line x1={ttX + pad} y1={ttY + (isMobile ? 30 : 34)}
                x2={ttX + ttW - pad} y2={ttY + (isMobile ? 30 : 34)}
                stroke="rgba(255,255,255,0.08)" strokeWidth={1} />

              {/* Age breakdown */}
              {DIST_STACKS.map((s, i) => {
                const carbon = d.ageDist.find(a => a.key === s.key)?.carbon ?? 0;
                const rowY = ttY + (isMobile ? 36 : 42) + i * lineH;
                return (
                  <g key={s.key}>
                    <rect x={ttX + pad} y={rowY} width={8} height={8} rx={2} fill={s.color} />
                    <text x={ttX + pad + 12} y={rowY + 8}
                      fontSize={isMobile ? 11 : 12} fill="#94a3b8" fontWeight={600}>
                      {s.label}
                      <tspan fill="#64748b" fontSize={isMobile ? 10 : 11} dx={4}>{s.stage}</tspan>
                    </text>
                    <text x={ttX + ttW - pad} y={rowY + 8}
                      textAnchor="end" fontSize={isMobile ? 12 : 13} fill="#e2e8f0" fontWeight={700}>
                      {fmtC(carbon)}
                      <tspan fontSize={10} fill="#475569" dx={2}>tCO₂eq</tspan>
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

// ── Age distribution (per-year 1-35) ─────────────────────────────────────────
const AGE_GROUPS_35 = [
  { key: "1-5",   label: "1–5 ปี",   range: [1, 5]   as [number, number], color: "#bbf7d0", dark: "#166534", bg: "rgba(187,247,208,0.35)" },
  { key: "6-12",  label: "6–12 ปี",  range: [6, 12]  as [number, number], color: "#4ade80", dark: "#15803d", bg: "rgba(74,222,128,0.22)" },
  { key: "13-20", label: "13–20 ปี", range: [13, 20] as [number, number], color: "#16a34a", dark: "#14532d", bg: "rgba(22,163,74,0.18)" },
  { key: "21-28", label: "21–28 ปี", range: [21, 28] as [number, number], color: "#166534", dark: "#052e16", bg: "rgba(22,101,52,0.18)" },
  { key: "29-35", label: "29–35 ปี", range: [29, 35] as [number, number], color: "#052e16", dark: "#052e16", bg: "rgba(5,46,22,0.15)" },
];

// index 0 = age 1, index 34 = age 35 (converted from plot counts × ~45 Rai/plot)
const PER_YEAR_RAI = [
  2115, 2250, 2385, 3015, 3105,       // 1–5
  2475, 2430, 2610, 2790, 3150, 2115, 2295,  // 6–12
  2385, 2070, 2520, 2385, 3240, 2880, 3285, 2475, // 13–20
  2025, 2340, 2115, 2565, 3060, 2790, 2115, 2250, // 21–28
  3015, 2565, 2205, 2970, 3105, 2115, 2745,   // 29–35
];

function getAgeGroup(age: number) {
  return AGE_GROUPS_35.find(g => age >= g.range[0] && age <= g.range[1])!;
}

function AgeDistributionChart({ isMobile, perYearRai }: { isMobile: boolean; perYearRai?: number[] | null }) {
  const [hoveredAge, setHoveredAge] = useState<number | null>(null);

  const W = isMobile ? 480 : 1060;
  const H = isMobile ? 260 : 295;
  const PL = 20, PR = 20;
  const PT = isMobile ? 38 : 48;
  const PB = isMobile ? 48 : 54;
  const iW = W - PL - PR;
  const iH = H - PT - PB;

  const nBars = 35;
  const gap = isMobile ? 2 : 3;
  const barW = (iW - gap * (nBars - 1)) / nBars;
  const yearData = perYearRai ?? PER_YEAR_RAI;
  const maxVal = Math.max(...yearData);
  const totalRai = yearData.reduce((a, b) => a + b, 0);

  const groupSummary = AGE_GROUPS_35.map(g => {
    const rai = yearData.slice(g.range[0] - 1, g.range[1]).reduce((a, b) => a + b, 0);
    return { ...g, rai, pct: Math.round((rai / totalRai) * 100) };
  });

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div style={{ width: 40, height: 40, borderRadius: 11, background: "rgba(16,185,129,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <i className="bi bi-bar-chart-fill" style={{ color: "#059669", fontSize: 20 }} />
        </div>
        <div>
          <div style={{ fontSize: isMobile ? 16 : 20, fontWeight: 900, color: "#064e3b" }}>การกระจายพื้นที่ยางตามอายุ (1–35 ปี)</div>
          <div style={{ fontSize: isMobile ? 13 : 14, color: "#94a3b8", fontWeight: 500, marginTop: 2 }}>พื้นที่ (ไร่) ต่อแต่ละกลุ่มอายุต้นยาง · ทุกอำเภอ</div>
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
          const age = idx + 1;
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

        {/* X-axis labels: 1,5,10,15,20,25,30,35 */}
        {[1, 5, 10, 15, 20, 25, 30, 35].map(age => {
          const x = PL + (age - 1) * (barW + gap) + barW / 2;
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
          const idx = hoveredAge - 1;
          const val = yearData[idx];
          const g = getAgeGroup(hoveredAge);
          const bh = Math.max((val / maxVal) * iH, 4);
          const cx = PL + idx * (barW + gap) + barW / 2;
          const y = PT + iH - bh;
          const ttW = isMobile ? 120 : 140, ttH = isMobile ? 52 : 58;
          const ttX = Math.min(Math.max(cx - ttW / 2, 4), W - ttW - 4);
          const ttY = Math.max(y - ttH - 10, 4);
          return (
            <g pointerEvents="none">
              <rect x={ttX} y={ttY} width={ttW} height={ttH} rx={9} fill="#064e3b" opacity={0.96}
                style={{ filter: "drop-shadow(0 4px 10px rgba(5,150,105,0.3))" }} />
              <rect x={ttX} y={ttY} width={ttW} height={3} rx={1.5} fill={g.color} />
              <text x={ttX + ttW / 2} y={ttY + 20} textAnchor="middle" fontSize={isMobile ? 13 : 14} fill="#6ee7b7" fontWeight={700}>
                อายุ {hoveredAge} ปี · {g.label}
              </text>
              <text x={ttX + ttW / 2} y={ttY + 42} textAnchor="middle" fontSize={isMobile ? 18 : 22} fill="#fff" fontWeight={900}>
                {val.toLocaleString("th-TH")} ไร่
              </text>
            </g>
          );
        })()}
      </svg>

      {/* Legend row */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: isMobile ? 8 : 14, padding: "12px 0 10px", borderTop: "1px solid rgba(16,185,129,0.1)", marginTop: 4 }}>
        <span style={{ fontSize: isMobile ? 13 : 14, color: "#64748b", fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}>
          <i className="bi bi-palette2" style={{ color: "#059669" }} /> คำอธิบายสีช่วงอายุต้นยาง (ปี):
        </span>
        {AGE_GROUPS_35.map(g => (
          <span key={g.key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 13, height: 13, borderRadius: "50%", background: g.color, flexShrink: 0, border: "1.5px solid rgba(0,0,0,0.1)", display: "inline-block" }} />
            <span style={{ fontSize: isMobile ? 13 : 14, fontWeight: 700, color: "#374151" }}>{g.label}</span>
          </span>
        ))}
      </div>

      {/* Legend: meaning of numbers */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: isMobile ? 8 : 18, padding: "9px 14px", background: "rgba(5,150,105,0.04)", borderRadius: 10, marginBottom: 18, border: "1px solid rgba(16,185,129,0.1)" }}>
        <span style={{ fontSize: isMobile ? 13 : 14, color: "#374151", fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}>
          <i className="bi bi-info-circle" style={{ color: "#059669" }} /> ความหมายของตัวเลข:
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: isMobile ? 13 : 14, color: "#64748b" }}>
          <span style={{ display: "inline-block", width: 22, height: 4, background: "linear-gradient(90deg,#4ade80,#059669)", borderRadius: 2 }} />
          ตัวเลขบนกราฟ: พื้นที่ (ไร่) ของแต่ละอายุ
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: isMobile ? 13 : 14, color: "#64748b" }}>
          <i className="bi bi-check2-square" style={{ color: "#059669" }} />
          ตัวเลขในการ์ดด้านล่าง: พื้นที่รวม (ไร่) และสัดส่วนพื้นที่ (%) ของกลุ่มอายุนั้น
        </span>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${isMobile ? 2 : 5},1fr)`, gap: isMobile ? 10 : 14 }}>
        {groupSummary.map(g => (
          <div key={g.key} style={{ background: g.bg, borderRadius: 14, padding: isMobile ? "14px 14px" : "18px 20px", border: `1.5px solid ${g.color}60`, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: -16, right: -16, width: 70, height: 70, borderRadius: "50%", background: g.color, opacity: 0.15 }} />
            <div style={{ fontSize: isMobile ? 14 : 15, fontWeight: 800, color: g.dark, marginBottom: 6 }}>{g.label}</div>
            <div style={{ fontSize: isMobile ? 32 : 40, fontWeight: 900, color: g.dark, lineHeight: 1, marginBottom: 3 }}>{g.rai.toLocaleString("th-TH")}</div>
            <div style={{ fontSize: isMobile ? 14 : 14, color: "#64748b", fontWeight: 600 }}>ไร่</div>
            <div style={{ marginTop: 12, height: 5, background: "rgba(0,0,0,0.08)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${g.pct}%`, background: g.color, borderRadius: 3, minWidth: 6 }} />
            </div>
            <div style={{ marginTop: 5, fontSize: isMobile ? 14 : 16, fontWeight: 900, color: g.dark }}>{g.pct}%</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Animated counter ─────────────────────────────────────────────────────────
function useCounter(target: number, ms = 1200) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (target === 0) { setV(0); return; }
    let cur = 0;
    const step = target / (ms / 16);
    const t = setInterval(() => {
      cur += step;
      if (cur >= target) { setV(target); clearInterval(t); }
      else setV(cur);
    }, 16);
    return () => clearInterval(t);
  }, [target, ms]);
  return v;
}

function StatCard({ icon, label, value, unit, color }: {
  icon: string; label: string; value: number; unit: string; color: string;
}) {
  const a = useCounter(value);
  const disp = value >= 1000
    ? Math.round(a).toLocaleString("th-TH")
    : a.toLocaleString("th-TH", { maximumFractionDigits: 0 });
  return (
    <div className="db2-stat-card" style={{ borderTop: `3px solid ${color}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <i className={`bi ${icon}`} style={{ color, fontSize: 16 }} />
        </div>
        <span style={{ fontSize: 16, fontWeight: 700, color: "#64748b" }}>{label}</span>
      </div>
      <div style={{ fontSize: 34, fontWeight: 900, color: "#0f172a", letterSpacing: -1.5, lineHeight: 1 }}>{disp}</div>
      <div style={{ fontSize: 15, color: "#94a3b8", fontWeight: 600, marginTop: 5 }}>{unit}</div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [selectedId, setSelectedId] = useState("all");
  const [isMobile, setIsMobile] = useState(false);
  const [mapPlots, setMapPlots] = useState<MapPlot[]>([]);
  const [mapBbox, setMapBbox] = useState<{ minLng: number; minLat: number; maxLng: number; maxLat: number } | null>(null);
  const [dashData, setDashData] = useState<DashboardRayongResponse | null>(null);
  const [dashDistricts, setDashDistricts] = useState<DashboardDistrict[] | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsMobile(window.innerWidth < 768);
    const h = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  useEffect(() => {
    fetch("/api/dashboard/stats")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        setMapPlots(data.mapPlots ?? []);
        setMapBbox(data.bbox ?? null);
      })
      .catch(console.error);
  }, []);

  // Fetch real dashboard data from backend raster
  useEffect(() => {
    getDashboardRayong()
      .then(setDashData)
      .catch(() => { /* fall back to hardcoded data */ });
  }, []);

  // Fetch real per-district data from backend raster
  useEffect(() => {
    getDashboardDistricts()
      .then(r => setDashDistricts(r.districts))
      .catch(() => { /* fall back to hardcoded district data */ });
  }, []);

  // Compute PER_YEAR_RAI from real API data, or fall back to hardcoded
  const realPerYearRai = useMemo(() => {
    if (!dashData?.perYearRai) return null;
    const arr = new Array(35).fill(0);
    for (const item of dashData.perYearRai) {
      if (item.age >= 1 && item.age <= 35) {
        arr[item.age - 1] = Math.round(item.areaRai);
      }
    }
    return arr;
  }, [dashData]);

  // Merge real data into PROVINCE_TOTAL for display
  const effectiveProvinceTotal = useMemo(() => {
    if (!dashData) return PROVINCE_TOTAL;
    return {
      ...PROVINCE_TOTAL,
      areaRai: Math.round(dashData.totalAreaRai),
      carbon: Math.round(dashData.totalCarbonTco2),
      ageDist: (dashData.ageGroups || []).map(g => ({
        key: g.key,
        areaRai: Math.round(g.areaRai),
        carbon: Math.round(g.carbonTco2),
      })),
    };
  }, [dashData]);

  // Merge real district data into DISTRICTS format (fall back to hardcoded)
  const effectiveDistricts = useMemo(() => {
    if (!dashDistricts) return DISTRICTS;
    return DISTRICTS.map(d => {
      const real = dashDistricts.find(r => r.name === d.name);
      if (!real) return d;
      return {
        ...d,
        areaRai: Math.round(real.areaRai),
        carbon: Math.round(real.carbonTco2),
        ageDist: real.ageDist.map(a => ({
          key: a.group,
          areaRai: Math.round(a.areaRai),
          carbon: Math.round(a.carbonTco2),
        })),
      };
    });
  }, [dashDistricts]);

  const selected = useMemo(() => {
    if (selectedId === "all") return effectiveProvinceTotal;
    return effectiveDistricts.find(d => d.id === selectedId) ?? effectiveProvinceTotal;
  }, [selectedId, effectiveProvinceTotal, effectiveDistricts]);
  const maxAgeDist = useMemo(() => Math.max(...selected.ageDist.map(a => a.areaRai), 1), [selected]);

  return (
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
                <span style={{ background: "rgba(5,150,105,0.1)", border: "1px solid rgba(5,150,105,0.2)", borderRadius: 8, padding: "5px 14px", fontSize: 15, fontWeight: 700, color: "#059669" }}>
                  <i className="bi bi-geo-alt-fill" style={{ marginRight: 5 }} />จังหวัดระยอง
                </span>
                <span style={{ background: "rgba(5,150,105,0.08)", border: "1px solid rgba(5,150,105,0.18)", borderRadius: 8, padding: "5px 14px", fontSize: 15, fontWeight: 700, color: "#047857" }}>
                  ฐานข้อมูลระบบ
                </span>
              </div>
              <h1 style={{ fontSize: isMobile ? 24 : 34, fontWeight: 900, color: "#064e3b", margin: "0 0 8px", letterSpacing: -0.8, lineHeight: 1.15 }}>
                ฐานข้อมูลยางพาราจังหวัดระยอง
              </h1>
              <div style={{ fontSize: isMobile ? 15 : 17, color: "#64748b", margin: 0, fontWeight: 500, display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "flex-start" : "center", gap: isMobile ? 8 : 6 }}>
                <span>ข้อมูลการใช้ประโยชน์ที่ดิน (LU) กรมพัฒนาที่ดิน</span>
                <span style={{ background: "rgba(5,150,105,0.1)", border: "1px solid rgba(5,150,105,0.2)", borderRadius: 6, padding: "2px 8px", fontSize: isMobile ? 13 : 14, fontWeight: 700, color: "#059669", whiteSpace: "nowrap" }}>
                  ปี พ.ศ. 2567
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Stat cards ───────────────────────────────────────────────────── */}
        <div className="db2-stat-row">
          <StatCard icon="bi-map-fill" label="พื้นที่รวม" value={effectiveProvinceTotal.areaRai} unit="ไร่" color="#0d9488" />
          <StatCard icon="bi-cloud-arrow-up-fill" label="คาร์บอนรวม" value={effectiveProvinceTotal.carbon} unit="tCO₂eq" color="#065f46" />
        </div>

        {/* ── District dropdown ────────────────────────────────────────────── */}
        <div className="db2-card" style={{ padding: "14px 20px", marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
              <i className="bi bi-geo-alt-fill" style={{ color: "#059669", fontSize: 16 }} />
              <span style={{ fontSize: 16, fontWeight: 700, color: "#374151" }}>เลือกอำเภอ</span>
            </div>
            <div style={{ position: "relative", flex: 1, minWidth: 200, maxWidth: 320 }}>
              <select
                value={selectedId}
                onChange={e => setSelectedId(e.target.value)}
                style={{
                  width: "100%",
                  appearance: "none",
                  WebkitAppearance: "none",
                  background: "#fff",
                  border: "1.5px solid rgba(5,150,105,0.35)",
                  borderRadius: 10,
                  padding: "10px 40px 10px 14px",
                  fontSize: 15,
                  fontWeight: 700,
                  color: "#0f172a",
                  cursor: "pointer",
                  outline: "none",
                  boxShadow: "0 1px 4px rgba(5,150,105,0.1)",
                  fontFamily: "'Noto Sans Thai','Inter',sans-serif",
                }}
              >
                <option key="all" value="all">
                  {effectiveProvinceTotal.name}{dashData ? ` — ${fmt(effectiveProvinceTotal.areaRai)} ไร่` : ""}
                </option>
                {effectiveDistricts.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name} — {fmt(d.areaRai)} ไร่
                  </option>
                ))}
              </select>
              <i className="bi bi-chevron-down" style={{
                position: "absolute", right: 13, top: "50%", transform: "translateY(-50%)",
                color: "#059669", fontSize: 14, pointerEvents: "none", fontWeight: 700,
              }} />
            </div>
            {selectedId !== "all" && (
              <button
                onClick={() => setSelectedId("all")}
                style={{
                  padding: "8px 14px", borderRadius: 8, border: "1px solid rgba(5,150,105,0.2)",
                  background: "rgba(5,150,105,0.06)", color: "#059669", fontSize: 14,
                  fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
                  flexShrink: 0,
                }}>
                <i className="bi bi-x-circle" />ดูทั้งหมด
              </button>
            )}
          </div>
        </div>

        {/* ── Map + District panel ─────────────────────────────────────────── */}
        <div className="db2-main-row">

          {/* Map */}
          <div className="db2-card db2-map-card">
            <div className="db2-card-header">
              <i className="bi bi-map-fill" style={{ color: "#059669" }} />
              <span>แผนที่แปลงยางพารา จังหวัดระยอง</span>
              <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700, color: "#059669", background: "rgba(5,150,105,0.1)", padding: "3px 10px", borderRadius: 50, border: "1px solid rgba(5,150,105,0.18)" }}>
                {fmt(effectiveProvinceTotal.areaRai)} ไร่
              </span>
            </div>
            <div className="db2-map-body">
              <DashboardMap
                plots={mapPlots}
                bbox={mapBbox}
                districts={effectiveDistricts}
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
                  <div style={{ fontSize: 16, color: "#64748b", fontWeight: 500, marginTop: 3 }}>จังหวัดระยอง · ข้อมูลระบบ</div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                {[
                  { label: "พื้นที่รวม", value: fmt(selected.areaRai), unit: "ไร่", color: "#0d9488" },
                  { label: "คาร์บอนรวม", value: fmtC(selected.carbon), unit: "tCO₂eq", color: "#065f46" },
                ].map(m => (
                  <div key={m.label} style={{ background: "#fff", borderRadius: 11, padding: "12px 14px", border: "1px solid rgba(16,185,129,0.12)" }}>
                    <div style={{ fontSize: 14, color: "#64748b", fontWeight: 600, marginBottom: 4 }}>{m.label}</div>
                    <div style={{ fontSize: 26, fontWeight: 900, color: m.color, letterSpacing: -0.8, lineHeight: 1 }}>{m.value}</div>
                    <div style={{ fontSize: 14, color: "#94a3b8", marginTop: 3 }}>{m.unit}</div>
                  </div>
                ))}
              </div>

              {/* Carbon total highlight */}
              <div style={{ background: "linear-gradient(135deg,#064e3b,#047857)", borderRadius: 13, padding: "16px 18px", display: "flex", alignItems: "center", gap: 14 }}>
                <i className="bi bi-cloud-arrow-up-fill" style={{ color: "#4ade80", fontSize: 30, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 15, color: "rgba(255,255,255,0.65)", fontWeight: 600, marginBottom: 2 }}>คาร์บอนสะสมทั้งหมด</div>
                  <div style={{ fontSize: 32, fontWeight: 900, color: "#fff", letterSpacing: -1.5, lineHeight: 1 }}>
                    {fmtC(selected.carbon)}
                    <span style={{ fontSize: 17, fontWeight: 600, color: "rgba(255,255,255,0.65)", marginLeft: 8 }}>tCO₂eq</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Age distribution */}
            <div className="db2-card" style={{ padding: "16px 18px", flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a", marginBottom: 16 }}>
                <i className="bi bi-bar-chart-steps" style={{ marginRight: 7, color: "#059669" }} />การกระจายตามอายุยาง
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {selected.ageDist.map(a => {
                  const cfg = AGE_CONFIG.find(c => c.key === a.key)!;
                  const barPct = maxAgeDist > 0 ? Math.round((a.areaRai / maxAgeDist) * 100) : 0;
                  const totalPct = selected.areaRai > 0 ? ((a.areaRai / selected.areaRai) * 100).toFixed(1) : "0";
                  return (
                    <div key={a.key}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <span style={{ width: 11, height: 11, borderRadius: 3, background: cfg.color, flexShrink: 0 }} />
                          <span style={{ fontSize: 15, fontWeight: 700, color: "#374151" }}>{cfg.label}</span>
                          <span style={{ fontSize: 14, color: "#94a3b8", fontStyle: "italic" }}>{cfg.stage}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 15, fontWeight: 800, color: cfg.dark }}>{fmt(a.areaRai)}<span style={{ fontSize: 13, fontWeight: 600, marginLeft: 3, opacity: 0.7 }}>ไร่</span></span>
                          <span style={{ fontSize: 14, fontWeight: 700, background: cfg.bg, color: cfg.dark, borderRadius: 5, padding: "2px 7px" }}>{totalPct}%</span>
                        </div>
                      </div>
                      <div style={{ height: 7, background: "#f1f5f9", borderRadius: 4, overflow: "hidden", marginBottom: 4 }}>
                        <div style={{ height: "100%", width: `${barPct}%`, background: `linear-gradient(90deg,${cfg.color}88,${cfg.color})`, borderRadius: 4, transition: "width 0.7s cubic-bezier(.16,1,.3,1)", minWidth: 4 }} />
                      </div>
                      <div style={{ textAlign: "right", fontSize: 14, color: "#94a3b8", fontWeight: 500 }}>
                        {fmtC(a.carbon)} tCO₂eq
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
            <span style={{ marginLeft: 6, fontWeight: 500, color: "#94a3b8", fontSize: 15 }}>จังหวัดระยอง · คลิกเพื่อเลือกอำเภอ</span>
          </div>
          <div style={{ padding: "16px 20px 12px" }}>
            <DistrictCarbonChart selectedId={selectedId} onSelect={setSelectedId} isMobile={isMobile} districts={effectiveDistricts} />
          </div>
        </div>

        {/* ── Age distribution chart ───────────────────────────────────────── */}
        <div className="db2-card" style={{ padding: isMobile ? "16px 14px 20px" : "24px 28px 28px" }}>
          <AgeDistributionChart isMobile={isMobile} perYearRai={realPerYearRai} />
        </div>

      </div>

      <style>{`
        .db2-wrap { max-width: 1300px; margin: 0 auto; padding: 0 28px; }
        .db2-hero { position: relative; border-radius: 20px; padding: 36px 44px; margin-bottom: 22px; overflow: hidden; background: #fff; }
        .db2-stat-row { display: grid; grid-template-columns: repeat(2,1fr); gap: 14px; margin-bottom: 18px; }
        .db2-stat-card { background: #fff; border-radius: 14px; padding: 20px; border: 1px solid rgba(16,185,129,0.1); box-shadow: 0 2px 10px rgba(16,185,129,0.06); }
        .db2-main-row { display: grid; grid-template-columns: 1.65fr 1fr; gap: 16px; margin-bottom: 18px; }
        .db2-map-card { display: flex; flex-direction: column; }
        .db2-map-body { height: 520px; }
        .db2-card { background: #fff; border-radius: 16px; border: 1px solid rgba(16,185,129,0.1); box-shadow: 0 2px 12px rgba(16,185,129,0.06); margin-bottom: 18px; }
        .db2-card-header { display: flex; align-items: center; gap: 9px; padding: 13px 18px; border-bottom: 1px solid rgba(16,185,129,0.08); font-size: 15px; font-weight: 800; color: #0f172a; }
        select:focus { border-color: #059669 !important; box-shadow: 0 0 0 3px rgba(5,150,105,0.15) !important; }

        @media (max-width: 1024px) {
          .db2-main-row { grid-template-columns: 1fr; }
          .db2-map-body { height: 400px; }
          .db2-stat-row { grid-template-columns: repeat(2,1fr); }
        }

        /* ── Mobile (≤ 640px) ── */
        @media (max-width: 640px) {
          .db2-page { padding-top: 100px !important; padding-bottom: 36px !important; }
          .db2-wrap { padding: 0 12px; }
          .db2-hero { padding: 18px 16px; border-radius: 14px; margin-bottom: 14px; }
          .db2-hero h1 { font-size: 18px !important; }
          .db2-hero p  { font-size: 14px !important; }
          .db2-stat-row { grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
          .db2-stat-card { padding: 14px 12px; border-radius: 11px; }
          .db2-main-row { gap: 12px; margin-bottom: 12px; }
          .db2-map-body { height: 260px; }
          .db2-card { border-radius: 12px; margin-bottom: 12px; }
          .db2-card-header { padding: 10px 14px; font-size: 14px; gap: 7px; }
        }

        @media (max-width: 400px) {
          .db2-stat-row { grid-template-columns: 1fr 1fr; gap: 8px; }
          .db2-stat-card { padding: 12px 10px; }
        }
      `}</style>
    </div>
  );
}