"use client";

import { useEffect, useMemo, useState } from "react";
import DashboardMap, { type MapPlot } from "./DashboardMap";

// ── Rayong province system database ──────────────────────────────────────────
const AGE_CONFIG = [
  { key: "1-5", label: "1–5 ปี", stage: "ระยะเริ่มต้น", color: "#4ade80", dark: "#166534", bg: "rgba(74,222,128,0.13)" },
  { key: "6-12", label: "6–12 ปี", stage: "ระยะเปิดกรีด", color: "#22c55e", dark: "#14532d", bg: "rgba(34,197,94,0.13)" },
  { key: "13-18", label: "13–18 ปี", stage: "ระยะสูงสุด", color: "#16a34a", dark: "#052e16", bg: "rgba(22,163,74,0.13)" },
  { key: "19+", label: "19+ ปี", stage: "ระยะคงที่", color: "#166534", dark: "#052e16", bg: "rgba(22,101,52,0.13)" },
];

type AgeDist = { key: string; plots: number; carbon: number };
type District = {
  id: string; name: string;
  plots: number; areaRai: number; carbon: number;
  ageDist: AgeDist[];
  lat: number; lng: number;
};

const DISTRICTS: District[] = [
  {
    id: "mueang", name: "เมืองระยอง", plots: 312, areaRai: 14250, carbon: 52340, lat: 12.6818, lng: 101.2587,
    ageDist: [{ key: "1-5", plots: 42, carbon: 6200 }, { key: "6-12", plots: 89, carbon: 18400 }, { key: "13-18", plots: 121, carbon: 19800 }, { key: "19+", plots: 60, carbon: 7940 }],
  },
  {
    id: "ban-chang", name: "บ้านฉาง", plots: 198, areaRai: 9120, carbon: 33840, lat: 12.7243, lng: 101.0594,
    ageDist: [{ key: "1-5", plots: 22, carbon: 3600 }, { key: "6-12", plots: 65, carbon: 12800 }, { key: "13-18", plots: 81, carbon: 13900 }, { key: "19+", plots: 30, carbon: 3540 }],
  },
  {
    id: "klaeng", name: "แกลง", plots: 687, areaRai: 31280, carbon: 118420, lat: 12.7781, lng: 101.6504,
    ageDist: [{ key: "1-5", plots: 98, carbon: 14200 }, { key: "6-12", plots: 201, carbon: 41800 }, { key: "13-18", plots: 256, carbon: 48700 }, { key: "19+", plots: 132, carbon: 13720 }],
  },
  {
    id: "wang-chan", name: "วังจันทร์", plots: 423, areaRai: 19640, carbon: 74130, lat: 12.9236, lng: 101.5678,
    ageDist: [{ key: "1-5", plots: 58, carbon: 8900 }, { key: "6-12", plots: 127, carbon: 26200 }, { key: "13-18", plots: 165, carbon: 30100 }, { key: "19+", plots: 73, carbon: 8930 }],
  },
  {
    id: "ban-khai", name: "บ้านค่าย", plots: 356, areaRai: 16420, carbon: 62180, lat: 12.7578, lng: 101.3856,
    ageDist: [{ key: "1-5", plots: 48, carbon: 7200 }, { key: "6-12", plots: 104, carbon: 21800 }, { key: "13-18", plots: 138, carbon: 25600 }, { key: "19+", plots: 66, carbon: 7580 }],
  },
  {
    id: "pluak-daeng", name: "ปลวกแดง", plots: 287, areaRai: 13140, carbon: 49810, lat: 12.9856, lng: 101.1923,
    ageDist: [{ key: "1-5", plots: 38, carbon: 5800 }, { key: "6-12", plots: 84, carbon: 17600 }, { key: "13-18", plots: 112, carbon: 20600 }, { key: "19+", plots: 53, carbon: 5810 }],
  },
  {
    id: "khao-chamao", name: "เขาชะเมา", plots: 384, areaRai: 17820, carbon: 67520, lat: 12.9418, lng: 101.7256,
    ageDist: [{ key: "1-5", plots: 52, carbon: 7800 }, { key: "6-12", plots: 115, carbon: 23800 }, { key: "13-18", plots: 149, carbon: 27600 }, { key: "19+", plots: 68, carbon: 8320 }],
  },
  {
    id: "nikhom", name: "นิคมพัฒนา", plots: 200, areaRai: 4820, carbon: 27010, lat: 12.8234, lng: 101.2345,
    ageDist: [{ key: "1-5", plots: 28, carbon: 4100 }, { key: "6-12", plots: 60, carbon: 9800 }, { key: "13-18", plots: 78, carbon: 10200 }, { key: "19+", plots: 34, carbon: 2910 }],
  },
];

const PROVINCE_TOTAL: District = {
  id: "all", name: "ทุกอำเภอ", lat: 12.6819, lng: 101.2587,
  plots: 2847, areaRai: 126490, carbon: 485250,
  ageDist: [
    { key: "1-5", plots: 388, carbon: 57800 },
    { key: "6-12", plots: 845, carbon: 172200 },
    { key: "13-18", plots: 1100, carbon: 196500 },
    { key: "19+", plots: 516, carbon: 58750 },
  ],
};

const ALL_ROWS = [PROVINCE_TOTAL, ...DISTRICTS];

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
}: {
  selectedId: string;
  onSelect: (id: string) => void;
  isMobile: boolean;
}) {
  const [hoverId, setHoverId] = useState<string | null>(null);

  const W = isMobile ? 460 : 800;
  const barH = isMobile ? 24 : 26;
  const gap = isMobile ? 7 : 7;
  const PL = isMobile ? 72 : 108;
  const PR = isMobile ? 78 : 98;
  const PT = isMobile ? 44 : 48;
  const PB = 10;

  const maxCarbon = Math.max(...DISTRICTS.map(d => d.carbon));
  const iW = W - PL - PR;

  const rows = DISTRICTS.map((d, i) => {
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

  const totalH = PT + DISTRICTS.length * (barH + gap) - gap + PB;

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
        <text x={PL} y={isMobile ? 10 : 11} fontSize={isMobile ? 9 : 9.5} fill="#059669" fontWeight={700}>
          อายุยางพารา (ปี)
        </text>
        <g>
          {DIST_STACKS.map((s, i) => (
            <g key={s.key} transform={`translate(${PL + i * (isMobile ? 90 : 108)}, ${isMobile ? 16 : 17})`}>
              <rect width={10} height={10} rx={2.5} fill={s.color} />
              <text x={14} y={9} fontSize={isMobile ? 10 : 10} fill="#334155" fontWeight={700}>{s.label}</text>
              <text x={14} y={isMobile ? 22 : 21} fontSize={isMobile ? 9 : 9} fill="#94a3b8" fontWeight={500}>{s.stage}</text>
            </g>
          ))}
        </g>

        {/* X grid lines */}
        {[0.25, 0.5, 0.75, 1].map(t => (
          <line key={t}
            x1={PL + t * iW} y1={PT - 6}
            x2={PL + t * iW} y2={PT + DISTRICTS.length * (barH + gap) - gap}
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
                fontSize={isMobile ? 11 : 12}
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
                fontSize={isMobile ? 11 : 11}
                fontWeight={isActive ? 800 : 700}
                fill={isActive ? "#059669" : "#64748b"}>
                {fmtC(d.carbon)}
                <tspan fontSize={8.5} fill="#94a3b8" fontWeight={500} dx={3}>tCO₂</tspan>
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
                fontSize={isMobile ? 12 : 13} fontWeight={800} fill="#fff">{d.name}</text>
              <text x={ttX + ttW - pad} y={ttY + 22}
                textAnchor="end" fontSize={isMobile ? 12 : 13} fontWeight={800} fill="#4ade80">
                {fmtC(d.carbon)}
                <tspan fontSize={9} fill="#64748b" dx={3}>tCO₂</tspan>
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
                      fontSize={isMobile ? 9.5 : 10.5} fill="#94a3b8" fontWeight={600}>
                      {s.label}
                      <tspan fill="#64748b" fontSize={isMobile ? 8.5 : 9.5} dx={4}>{s.stage}</tspan>
                    </text>
                    <text x={ttX + ttW - pad} y={rowY + 8}
                      textAnchor="end" fontSize={isMobile ? 10 : 11} fill="#e2e8f0" fontWeight={700}>
                      {fmtC(carbon)}
                      <tspan fontSize={8.5} fill="#475569" dx={2}>tCO₂</tspan>
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
          <i className={`bi ${icon}`} style={{ color, fontSize: 15 }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>{label}</span>
      </div>
      <div style={{ fontSize: 30, fontWeight: 900, color: "#0f172a", letterSpacing: -1.5, lineHeight: 1 }}>{disp}</div>
      <div style={{ fontSize: 12, color: "#94a3b8", fontWeight: 600, marginTop: 5 }}>{unit}</div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [selectedId, setSelectedId] = useState("all");
  const [isMobile, setIsMobile] = useState(false);
  const [mapPlots, setMapPlots] = useState<MapPlot[]>([]);
  const [mapBbox, setMapBbox] = useState<{ minLng: number; minLat: number; maxLng: number; maxLat: number } | null>(null);

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

  const selected = useMemo(() => ALL_ROWS.find(d => d.id === selectedId) ?? PROVINCE_TOTAL, [selectedId]);
  const flyTo = useMemo<[number, number]>(() => [selected.lng, selected.lat], [selected]);
  const flyZoom = selectedId === "all" ? 9 : 12;

  const maxDistrictCarbon = useMemo(() => Math.max(...DISTRICTS.map(d => d.carbon), 1), []);
  const maxAgeDist = useMemo(() => Math.max(...selected.ageDist.map(a => a.plots), 1), [selected]);

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
                <span style={{ background: "rgba(5,150,105,0.1)", border: "1px solid rgba(5,150,105,0.2)", borderRadius: 8, padding: "5px 14px", fontSize: 12, fontWeight: 700, color: "#059669" }}>
                  <i className="bi bi-geo-alt-fill" style={{ marginRight: 5 }} />จังหวัดระยอง
                </span>
                <span style={{ background: "rgba(5,150,105,0.08)", border: "1px solid rgba(5,150,105,0.18)", borderRadius: 8, padding: "5px 14px", fontSize: 12, fontWeight: 700, color: "#047857" }}>
                  ฐานข้อมูลระบบ
                </span>
              </div>
              <h1 style={{ fontSize: isMobile ? 20 : 30, fontWeight: 900, color: "#064e3b", margin: "0 0 8px", letterSpacing: -0.8, lineHeight: 1.15 }}>
                ฐานข้อมูลยางพาราจังหวัดระยอง
              </h1>
              <p style={{ fontSize: isMobile ? 13 : 15, color: "#64748b", margin: 0, fontWeight: 500 }}>
                สำรวจและวิเคราะห์แปลงยางพาราด้วยดาวเทียม · ครอบคลุม 8 อำเภอ
              </p>
            </div>
          </div>
        </div>

        {/* ── Stat cards ───────────────────────────────────────────────────── */}
        <div className="db2-stat-row">
          <StatCard icon="bi-layers-fill" label="แปลงทั้งหมด" value={PROVINCE_TOTAL.plots} unit="แปลง" color="#059669" />
          <StatCard icon="bi-map-fill" label="พื้นที่รวม" value={PROVINCE_TOTAL.areaRai} unit="ไร่" color="#0d9488" />
          <StatCard icon="bi-cloud-arrow-up-fill" label="คาร์บอนรวม" value={PROVINCE_TOTAL.carbon} unit="tCO₂" color="#065f46" />
          <StatCard icon="bi-building" label="จำนวนอำเภอ" value={8} unit="อำเภอ" color="#0369a1" />
        </div>

        {/* ── District dropdown ────────────────────────────────────────────── */}
        <div className="db2-card" style={{ padding: "14px 20px", marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
              <i className="bi bi-geo-alt-fill" style={{ color: "#059669", fontSize: 14 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>เลือกอำเภอ</span>
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
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#0f172a",
                  cursor: "pointer",
                  outline: "none",
                  boxShadow: "0 1px 4px rgba(5,150,105,0.1)",
                  fontFamily: "'Noto Sans Thai','Inter',sans-serif",
                }}
              >
                {ALL_ROWS.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name}{d.id !== "all" ? ` — ${fmt(d.plots)} แปลง` : ""}
                  </option>
                ))}
              </select>
              <i className="bi bi-chevron-down" style={{
                position: "absolute", right: 13, top: "50%", transform: "translateY(-50%)",
                color: "#059669", fontSize: 13, pointerEvents: "none", fontWeight: 700,
              }} />
            </div>
            {selectedId !== "all" && (
              <button
                onClick={() => setSelectedId("all")}
                style={{
                  padding: "8px 14px", borderRadius: 8, border: "1px solid rgba(5,150,105,0.2)",
                  background: "rgba(5,150,105,0.06)", color: "#059669", fontSize: 12,
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
              <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "#059669", background: "rgba(5,150,105,0.1)", padding: "3px 10px", borderRadius: 50, border: "1px solid rgba(5,150,105,0.18)" }}>
                {fmt(PROVINCE_TOTAL.plots)} แปลง
              </span>
            </div>
            <div className="db2-map-body">
              <DashboardMap
                plots={mapPlots}
                bbox={mapBbox}
                flyToCenter={flyTo}
                flyZoom={flyZoom}
                districts={DISTRICTS}
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
                  <i className="bi bi-geo-alt-fill" style={{ color: "#fff", fontSize: 20 }} />
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: "#064e3b", lineHeight: 1 }}>{selected.name}</div>
                  <div style={{ fontSize: 12, color: "#64748b", fontWeight: 500, marginTop: 3 }}>จังหวัดระยอง · ข้อมูลระบบ</div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                {[
                  { label: "จำนวนแปลง", value: fmt(selected.plots), unit: "แปลง", color: "#059669" },
                  { label: "พื้นที่รวม", value: fmt(selected.areaRai), unit: "ไร่", color: "#0d9488" },
                ].map(m => (
                  <div key={m.label} style={{ background: "#fff", borderRadius: 11, padding: "12px 14px", border: "1px solid rgba(16,185,129,0.12)" }}>
                    <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, marginBottom: 4 }}>{m.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: m.color, letterSpacing: -0.8, lineHeight: 1 }}>{m.value}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>{m.unit}</div>
                  </div>
                ))}
              </div>

              {/* Carbon total highlight */}
              <div style={{ background: "linear-gradient(135deg,#064e3b,#047857)", borderRadius: 13, padding: "16px 18px", display: "flex", alignItems: "center", gap: 14 }}>
                <i className="bi bi-cloud-arrow-up-fill" style={{ color: "#4ade80", fontSize: 28, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", fontWeight: 600, marginBottom: 2 }}>คาร์บอนสะสมทั้งหมด</div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: "#fff", letterSpacing: -1.5, lineHeight: 1 }}>
                    {fmtC(selected.carbon)}
                    <span style={{ fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.65)", marginLeft: 8 }}>tCO₂</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Age distribution */}
            <div className="db2-card" style={{ padding: "16px 18px", flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", marginBottom: 16 }}>
                <i className="bi bi-bar-chart-steps" style={{ marginRight: 7, color: "#059669" }} />การกระจายตามอายุยาง
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {selected.ageDist.map(a => {
                  const cfg = AGE_CONFIG.find(c => c.key === a.key)!;
                  const plotPct = maxAgeDist > 0 ? Math.round((a.plots / maxAgeDist) * 100) : 0;
                  const totalPct = selected.plots > 0 ? ((a.plots / selected.plots) * 100).toFixed(1) : "0";
                  return (
                    <div key={a.key}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <span style={{ width: 11, height: 11, borderRadius: 3, background: cfg.color, flexShrink: 0 }} />
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>{cfg.label}</span>
                          <span style={{ fontSize: 11, color: "#94a3b8", fontStyle: "italic" }}>{cfg.stage}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 800, color: cfg.dark }}>{fmt(a.plots)}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, background: cfg.bg, color: cfg.dark, borderRadius: 5, padding: "2px 7px" }}>{totalPct}%</span>
                        </div>
                      </div>
                      <div style={{ height: 7, background: "#f1f5f9", borderRadius: 4, overflow: "hidden", marginBottom: 4 }}>
                        <div style={{ height: "100%", width: `${plotPct}%`, background: `linear-gradient(90deg,${cfg.color}88,${cfg.color})`, borderRadius: 4, transition: "width 0.7s cubic-bezier(.16,1,.3,1)", minWidth: 4 }} />
                      </div>
                      <div style={{ textAlign: "right", fontSize: 11, color: "#94a3b8", fontWeight: 500 }}>
                        {fmtC(a.carbon)} tCO₂
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
            <span style={{ marginLeft: 6, fontWeight: 500, color: "#94a3b8", fontSize: 12 }}>จังหวัดระยอง · คลิกเพื่อเลือกอำเภอ</span>
          </div>
          <div style={{ padding: "16px 20px 12px" }}>
            <DistrictCarbonChart selectedId={selectedId} onSelect={setSelectedId} isMobile={isMobile} />
          </div>
        </div>

        {/* ── District comparison table ────────────────────────────────────── */}
        <div className="db2-card" style={{ overflow: "hidden" }}>
          <div className="db2-card-header">
            <i className="bi bi-table" style={{ color: "#059669" }} />
            <span>เปรียบเทียบข้อมูลรายอำเภอ</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: isMobile ? 12 : 13 }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid rgba(16,185,129,0.1)" }}>
                  {["อำเภอ", "แปลง", "พื้นที่ (ไร่)", "คาร์บอน (tCO₂)", "สัดส่วน"].map(h => (
                    <th key={h} style={{ padding: "10px 16px", textAlign: h === "อำเภอ" ? "left" : "right", fontSize: 11, fontWeight: 800, color: "#64748b", letterSpacing: 0.3 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DISTRICTS.map((d, i) => {
                  const pct = PROVINCE_TOTAL.carbon > 0 ? (d.carbon / PROVINCE_TOTAL.carbon) * 100 : 0;
                  const isActive = d.id === selectedId;
                  return (
                    <tr key={d.id}
                      onClick={() => setSelectedId(d.id)}
                      style={{
                        background: isActive ? "rgba(5,150,105,0.05)" : i % 2 === 0 ? "#fff" : "#fafafa",
                        borderBottom: "1px solid rgba(0,0,0,0.04)",
                        cursor: "pointer",
                        transition: "background 0.15s",
                        borderLeft: isActive ? "3px solid #059669" : "3px solid transparent",
                      }}>
                      <td style={{ padding: "12px 16px", fontWeight: isActive ? 800 : 600, color: isActive ? "#059669" : "#1e293b" }}>
                        {d.name}
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 700, color: "#374151" }}>{fmt(d.plots)}</td>
                      <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 700, color: "#374151" }}>{fmt(d.areaRai)}</td>
                      <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 800, color: "#059669" }}>{fmtC(d.carbon)}</td>
                      <td style={{ padding: "12px 16px", textAlign: "right" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
                          <div style={{ width: 60, height: 6, background: "#f1f5f9", borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${(d.carbon / maxDistrictCarbon) * 100}%`, background: "linear-gradient(90deg,#4ade80,#059669)", borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", minWidth: 32 }}>{pct.toFixed(1)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      <style>{`
        .db2-wrap { max-width: 1300px; margin: 0 auto; padding: 0 28px; }
        .db2-hero { position: relative; border-radius: 20px; padding: 36px 44px; margin-bottom: 22px; overflow: hidden; background: #fff; }
        .db2-stat-row { display: grid; grid-template-columns: repeat(4,1fr); gap: 14px; margin-bottom: 18px; }
        .db2-stat-card { background: #fff; border-radius: 14px; padding: 20px; border: 1px solid rgba(16,185,129,0.1); box-shadow: 0 2px 10px rgba(16,185,129,0.06); }
        .db2-main-row { display: grid; grid-template-columns: 1.65fr 1fr; gap: 16px; margin-bottom: 18px; }
        .db2-map-card { display: flex; flex-direction: column; }
        .db2-map-body { height: 520px; }
        .db2-card { background: #fff; border-radius: 16px; border: 1px solid rgba(16,185,129,0.1); box-shadow: 0 2px 12px rgba(16,185,129,0.06); margin-bottom: 18px; }
        .db2-card-header { display: flex; align-items: center; gap: 9px; padding: 13px 18px; border-bottom: 1px solid rgba(16,185,129,0.08); font-size: 14px; font-weight: 800; color: #0f172a; }
        select:focus { border-color: #059669 !important; box-shadow: 0 0 0 3px rgba(5,150,105,0.15) !important; }

        @media (max-width: 1024px) {
          .db2-main-row { grid-template-columns: 1fr; }
          .db2-map-body { height: 400px; }
          .db2-stat-row { grid-template-columns: repeat(2,1fr); }
        }

        /* ── Mobile (≤ 640px) ── */
        @media (max-width: 640px) {
          .db2-page { padding-top: 76px !important; padding-bottom: 36px !important; }
          .db2-wrap { padding: 0 12px; }
          .db2-hero { padding: 18px 16px; border-radius: 14px; margin-bottom: 14px; }
          .db2-hero h1 { font-size: 17px !important; }
          .db2-hero p  { font-size: 12px !important; }
          .db2-stat-row { grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
          .db2-stat-card { padding: 14px 12px; border-radius: 11px; }
          .db2-main-row { gap: 12px; margin-bottom: 12px; }
          .db2-map-body { height: 260px; }
          .db2-card { border-radius: 12px; margin-bottom: 12px; }
          .db2-card-header { padding: 10px 14px; font-size: 12px; gap: 7px; }
        }

        @media (max-width: 400px) {
          .db2-stat-row { grid-template-columns: 1fr 1fr; gap: 8px; }
          .db2-stat-card { padding: 12px 10px; }
        }
      `}</style>
    </div>
  );
}
