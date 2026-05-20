"use client";

import { useAuth } from "@/lib/auth-context";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { CarbonBarChart, buildBarPoints } from "@/app/components/organisms/ParcelResultsPanel/CarbonBarChart";

const HERO_BG =
  "radial-gradient(1000px 400px at -5% -5%, rgba(16,185,129,0.12) 0%, rgba(16,185,129,0) 60%)," +
  "radial-gradient(800px 400px at 105% 0%, rgba(59,130,246,0.1) 0%, rgba(59,130,246,0) 58%)," +
  "linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.9) 100%)";

function carbonCo2(age: number, trees: number): number {
  if (age <= 0) return 0;
  const H = Math.min(2.0 + 1.8 * age, 28);
  const D = Math.min(3 + 4.5 * age, 60);
  const AGB = 0.1284 * D * D * H * 0.001;
  return (AGB + AGB * 0.26) * 0.47 * 3.67 * trees;
}

function fmtCompact(v: number): string {
  return v.toLocaleString("th-TH", { maximumFractionDigits: 0 });
}

type Forecast = { yr3: number; yr5: number; yr7: number };

type SavedPlot = {
  id: string;
  name: string;
  areaRai: number;
  carbonTotal: number;
  rubberAge: number;
  plantYearBE?: number;
  trees?: number;
  variety?: string;
  spacing?: string;
  confidence?: number;
  userId?: string;
  ownerName?: string;
  province?: string;
  date: string;
  geojson?: unknown;
  boundaryGeojson?: unknown;
  forecast?: Forecast;
};

// Smooth cubic bezier path builder (module-level, not inside component)
function buildSmoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  if (pts.length < 2) return `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`;
  let d = `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1], cur = pts[i];
    const cp1x = prev.x + (cur.x - prev.x) * 0.45;
    const cp2x = cur.x - (cur.x - prev.x) * 0.45;
    d += ` C${cp1x.toFixed(2)},${prev.y.toFixed(2)} ${cp2x.toFixed(2)},${cur.y.toFixed(2)} ${cur.x.toFixed(2)},${cur.y.toFixed(2)}`;
  }
  return d;
}

function ForecastBody({
  milestones,
  chartPts,
  base,
  maxCo2,
  isMobile,
}: {
  milestones: any[];
  chartPts: any[];
  base: number;
  maxCo2: number;
  isMobile?: boolean;
}) {
  const [view, setView] = useState<"timeline" | "chart">("timeline");
  const [hoveredPt, setHoveredPt] = useState<number | null>(null);

  // Stable IDs for SVG gradients (safe for SSR hydration)
  const rawId = useId();
  const uid = rawId.replace(/:/g, "-");

  // SVG dimensions - Compacted for better density
  const W = isMobile ? 400 : 800, H = isMobile ? 180 : 220, PL = 12, PT = 20, PB = 30;
  const iW = W - PL * 2, iH = H - PT - PB;
  const n = chartPts.length;

  const vals = chartPts.length > 0 ? chartPts.map(p => p.co2) : [0];
  const minV = Math.min(...vals);
  const maxV = Math.max(...vals, 1);
  const rng = maxV - minV || maxV * 0.1 || 1;

  const xi = (i: number) => PL + (n > 1 ? i / (n - 1) : 0.5) * iW;
  const yi = (v: number) => PT + (1 - (v - minV) / rng) * iH;

  const svgPts = chartPts.map((p, i) => ({ x: xi(i), y: yi(p.co2), ...p }));
  const linePath = buildSmoothPath(svgPts);
  const areaPath = svgPts.length > 0
    ? `${linePath} L${xi(n - 1).toFixed(2)},${(PT + iH).toFixed(2)} L${PL.toFixed(2)},${(PT + iH).toFixed(2)} Z`
    : "";

  const hp = hoveredPt !== null ? svgPts[hoveredPt] ?? null : null;

  return (
    <>
      {/* Toggle button */}
      <div style={{ padding: "8px 16px 0", display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={() => setView(v => v === "timeline" ? "chart" : "timeline")}
          title={view === "timeline" ? "ดูกราฟรายปี" : "ดู Timeline"}
          style={{
            display: "flex", alignItems: "center", gap: 4, padding: "4px 10px",
            borderRadius: 8, cursor: "pointer", fontSize: 10, fontWeight: 700,
            border: "1.5px solid rgba(16,185,129,0.35)",
            background: view === "chart" ? "rgba(16,185,129,0.12)" : "transparent",
            color: "#059669", transition: "background 0.15s",
          }}
        >
          <i className={`bi ${view === "timeline" ? "bi-graph-up" : "bi-calendar3"}`} style={{ fontSize: 11 }} />
          {view === "timeline" ? "กราฟเส้น" : "Timeline"}
        </button>
      </div>

      {/* Timeline view */}
      {view === "timeline" && (
        <div style={{ padding: isMobile ? "14px 10px" : "12px 16px 12px", display: "flex", gap: 0, alignItems: "stretch" }}>
          {milestones.map((m, i) => {
            const isFirst = i === 0;
            const isLast = i === milestones.length - 1;
            const changeFromBase = isFirst ? 0 : m.co2 - base;
            const changePct = base > 0 ? (changeFromBase / base) * 100 : 0;
            const barFill = maxCo2 > 0 ? Math.round((m.co2 / maxCo2) * 100) : 0;
            const dotColor = isFirst ? "#059669" : isLast ? "#16a34a" : "#10b981";
            return (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
                {!isLast && (
                  <div style={{ position: "absolute", top: isMobile ? 12 : 10, left: "50%", right: "-50%", height: 2, background: "linear-gradient(90deg,rgba(16,185,129,0.35),rgba(16,185,129,0.1))", zIndex: 0 }} />
                )}
                <div style={{ width: isMobile ? 20 : 16, height: isMobile ? 20 : 16, borderRadius: "50%", flexShrink: 0, background: isFirst ? dotColor : "#fff", border: `2px solid ${dotColor}`, boxShadow: isFirst ? "0 0 0 3px rgba(5,150,105,0.1)" : "none", zIndex: 1, marginBottom: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {isFirst && <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#fff" }} />}
                </div>
                <div style={{ fontSize: isMobile ? 10 : 10.5, fontWeight: isFirst ? 700 : 500, color: isFirst ? "#059669" : "#64748b", marginBottom: 2, textAlign: "center" }}>{m.label}</div>
                <div style={{ fontSize: isMobile ? 14 : 13, fontWeight: 800, color: isFirst ? "#059669" : isLast ? "#15803d" : "#0f172a", textAlign: "center" }}>{fmtCompact(m.co2)}</div>
                <div style={{ fontSize: 9.5, color: "#94a3b8", marginTop: 1, textAlign: "center" }}>tCO₂</div>
                {!isFirst && changeFromBase !== 0 && (
                  <div style={{ marginTop: 5, fontSize: isMobile ? 10.5 : 10, fontWeight: 700, color: changeFromBase > 0 ? "#16a34a" : "#dc2626", background: changeFromBase > 0 ? "rgba(22,163,74,0.08)" : "rgba(220,38,38,0.08)", padding: isMobile ? "2px 6px" : "1px 5px", borderRadius: 6, textAlign: "center" }}>
                    {changeFromBase > 0 ? "+" : ""}{changePct.toFixed(1)}%
                  </div>
                )}
                <div style={{ marginTop: 8, width: "80%", height: 3.5, borderRadius: 3, background: "rgba(16,185,129,0.1)", overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 3, width: `${barFill}%`, background: isFirst ? "linear-gradient(90deg,#059669,#10b981)" : isLast ? "linear-gradient(90deg,#10b981,#34d399)" : "rgba(16,185,129,0.5)", transition: "width 0.4s ease" }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Line chart view */}
      {view === "chart" && (
        <div style={{ padding: "10px 16px 12px" }}>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            style={{ width: "100%", height: H, display: "block", overflow: "visible" }}
          >
            <defs>
              <linearGradient id={`areaGrad-${uid}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.30" />
                <stop offset="60%" stopColor="#10b981" stopOpacity="0.08" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
              </linearGradient>
              <linearGradient id={`lineGrad-${uid}`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#059669" />
                <stop offset="100%" stopColor="#34d399" />
              </linearGradient>
              <filter id={`glow-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor="#10b981" floodOpacity="0.45" />
              </filter>
              <filter id={`dotGlow-${uid}`} x="-60%" y="-60%" width="220%" height="220%">
                <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#34d399" floodOpacity="0.6" />
              </filter>
            </defs>

            {/* Subtle horizontal grid lines */}
            {[0, 0.5, 1].map(t => (
              <line key={t}
                x1={PL} y1={PT + t * iH} x2={PL + iW} y2={PT + t * iH}
                stroke="rgba(16,185,129,0.12)"
                strokeWidth={t === 0 || t === 1 ? 1 : 0.6}
                strokeDasharray={t === 0.5 ? "4 3" : undefined}
              />
            ))}

            {/* Hover vertical guide */}
            {hp && (
              <line
                x1={hp.x} y1={PT} x2={hp.x} y2={PT + iH}
                stroke="rgba(16,185,129,0.25)" strokeWidth={1.5} strokeDasharray="4 3"
              />
            )}

            {/* Area fill */}
            <path d={areaPath} fill={`url(#areaGrad-${uid})`} />

            {/* Line with gradient stroke */}
            <path
              d={linePath}
              fill="none"
              stroke={`url(#lineGrad-${uid})`}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              filter={`url(#glow-${uid})`}
            />

            {/* Invisible wide hit targets */}
            {svgPts.map((p, i) => (
              <rect key={i}
                x={i === 0 ? PL : (svgPts[i - 1].x + p.x) / 2}
                y={PT}
                width={
                  i === 0
                    ? (svgPts[1] ? (svgPts[1].x + p.x) / 2 - PL : iW)
                    : i === n - 1
                      ? PL + iW - (svgPts[i - 1].x + p.x) / 2
                      : p.x - svgPts[i - 1].x
                }
                height={iH}
                fill="transparent"
                style={{ cursor: "crosshair" }}
                onMouseEnter={() => setHoveredPt(i)}
                onMouseLeave={() => setHoveredPt(null)}
              />
            ))}

            {/* Dots */}
            {svgPts.map((p, i) => {
              const isHov = hoveredPt === i;
              const isFirst = i === 0;
              const isLast = i === n - 1;
              return (
                <g key={i}>
                  {isHov && (
                    <circle cx={p.x} cy={p.y} r={10}
                      fill="rgba(16,185,129,0.15)"
                    />
                  )}
                  <circle
                    cx={p.x} cy={p.y}
                    r={isHov ? 5.5 : isFirst || isLast ? 4 : 3}
                    fill={isHov ? "#34d399" : isFirst ? "#059669" : "#fff"}
                    stroke={isFirst ? "#059669" : "#10b981"}
                    strokeWidth={isHov ? 2.5 : 2}
                    filter={isHov ? `url(#dotGlow-${uid})` : undefined}
                    style={{ transition: "r 0.15s ease" }}
                  />
                </g>
              );
            })}

            {/* Year labels along x-axis */}
            {svgPts.map((p, i) => (
              <text key={i} x={p.x} y={H - 10}
                textAnchor="middle" fontSize={isMobile ? 12 : 13}
                fontWeight={i === 0 ? 700 : 400}
                fill={i === 0 ? "#059669" : "#94a3b8"}
              >
                {p.label}
              </text>
            ))}

            {/* Tooltip */}
            {hp && (() => {
              const isFirst = hoveredPt === 0;
              const changeAbs = hp.co2 - base;
              const changePct = base > 0 ? (changeAbs / base) * 100 : 0;
              const ttW = isMobile ? 112 : 130, ttH = isFirst ? (isMobile ? 38 : 42) : (isMobile ? 52 : 60);
              const ttX = Math.min(Math.max(hp.x - ttW / 2, PL), PL + iW - ttW);
              const ttY = hp.y - ttH - 12;
              return (
                <g pointerEvents="none">
                  {/* Backdrop blur effect via rect */}
                  <rect x={ttX} y={ttY} width={ttW + 10} height={ttH + 10} rx={9}
                    fill="#064e3b" opacity={0.95}
                  />
                  <text x={ttX + (ttW + 10) / 2} y={ttY + (isMobile ? 16 : 18)}
                    textAnchor="middle" fontSize={isMobile ? 11 : 12} fill="#6ee7b7" fontWeight={600}
                  >
                    {isFirst ? "ณ ปัจจุบัน" : `อีก ${hp.yr} ปีข้างหน้า`}
                  </text>
                  <text x={ttX + (ttW + 10) / 2} y={ttY + (isMobile ? 34 : 38)}
                    textAnchor="middle" fontSize={isMobile ? 13 : 15} fill="#ffffff" fontWeight={800}
                  >
                    {hp.co2.toLocaleString("th-TH", { maximumFractionDigits: 1 })} tCO₂
                  </text>
                  {!isFirst && (
                    <text x={ttX + (ttW + 10) / 2} y={ttY + (isMobile ? 50 : 54)}
                      textAnchor="middle" fontSize={isMobile ? 11 : 11.5}
                      fill={changePct >= 0 ? "#34d399" : "#f87171"} fontWeight={700}
                    >
                      {changePct >= 0 ? "▲" : "▼"} {Math.abs(changePct).toFixed(1)}% จากปัจจุบัน
                    </text>
                  )}
                  {/* Arrow */}
                  <polygon
                    points={`${hp.x - 5},${ttY + ttH} ${hp.x + 5},${ttY + ttH} ${hp.x},${ttY + ttH + 6}`}
                    fill="#064e3b" opacity={0.95}
                  />
                </g>
              );
            })()}
          </svg>
          <div style={{ textAlign: "center", fontSize: 9, color: "#94a3b8", marginTop: 2 }}>
            hover บนเส้นเพื่อดูรายละเอียด · หน่วย tCO₂
          </div>
        </div>
      )}
    </>
  );
}

function ForecastSection({
  rubberAge,
  trees,
  carbonTotal,
  forecast,
  isMobile,
}: {
  rubberAge: number;
  trees: number;
  carbonTotal: number;
  forecast?: Forecast;
  isMobile?: boolean;
}) {
  const canCompute = trees > 0 && rubberAge > 0;

  const milestones: { label: string; co2: number; yr: number }[] = [];
  if (canCompute) {
    milestones.push({ label: "ปัจจุบัน", co2: carbonTotal, yr: 0 });
    milestones.push({ label: "+1 ปี", co2: carbonCo2(rubberAge + 1, trees), yr: 1 });
    milestones.push({ label: "+3 ปี", co2: carbonCo2(rubberAge + 3, trees), yr: 3 });
    milestones.push({ label: "+5 ปี", co2: carbonCo2(rubberAge + 5, trees), yr: 5 });
    milestones.push({ label: "+7 ปี", co2: carbonCo2(rubberAge + 7, trees), yr: 7 });
  } else if (forecast && (forecast.yr3 > 0 || forecast.yr5 > 0 || forecast.yr7 > 0)) {
    milestones.push({ label: "ปัจจุบัน", co2: carbonTotal, yr: 0 });
    if (forecast.yr3 > 0) milestones.push({ label: "+3 ปี", co2: forecast.yr3, yr: 3 });
    if (forecast.yr5 > 0) milestones.push({ label: "+5 ปี", co2: forecast.yr5, yr: 5 });
    if (forecast.yr7 > 0) milestones.push({ label: "+7 ปี", co2: forecast.yr7, yr: 7 });
  }

  if (milestones.length === 0) {
    return (
      <div style={{ marginTop: 12, padding: "16px", background: "rgba(148,163,184,0.03)", borderRadius: 14, fontSize: 12, color: "#94a3b8", textAlign: "center", border: "1.5px dashed rgba(148,163,184,0.15)" }}>
        <i className="bi bi-graph-up-arrow me-2" style={{ opacity: 0.6 }} />
        ยังไม่มีข้อมูลการประมวลผลคาร์บอน
      </div>
    );
  }

  const base = milestones[0].co2;
  const last = milestones[milestones.length - 1].co2;
  const growthPct = base > 0 ? ((last - base) / base) * 100 : 0;
  const maxCo2 = Math.max(...milestones.map(m => m.co2), 1);

  const chartPts = canCompute
    ? Array.from({ length: 8 }, (_, i) => ({
      yr: i,
      label: i === 0 ? "ปัจจุบัน" : `+${i}`,
      co2: i === 0 ? carbonTotal : carbonCo2(rubberAge + i, trees),
    }))
    : milestones.map(m => ({ yr: m.yr, label: m.label, co2: m.co2 }));

  return (
    <div style={{ marginTop: 14, borderRadius: 14, border: "1px solid rgba(16,185,129,0.18)", overflow: "hidden", background: "#fff" }}>
      {/* Header */}
      <div style={{ padding: "10px 16px", background: "linear-gradient(135deg,rgba(16,185,129,0.07) 0%,rgba(5,150,105,0.04) 100%)", borderBottom: "1px solid rgba(16,185,129,0.1)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: isMobile ? 12 : 13, fontWeight: 700, color: "#059669", display: "flex", alignItems: "center", gap: 6 }}>
          <i className="bi bi-graph-up-arrow" style={{ fontSize: isMobile ? 13 : 14 }} />
          พยากรณ์การกักเก็บคาร์บอน (tCO₂)
        </span>
        {growthPct > 0 && (
          <span style={{ fontSize: isMobile ? 10 : 11, fontWeight: 700, color: "#16a34a", background: "rgba(22,163,74,0.1)", padding: "3px 10px", borderRadius: 20, border: "1px solid rgba(22,163,74,0.25)", display: "flex", alignItems: "center", gap: 3 }}>
            <span style={{ fontSize: isMobile ? 9 : 10 }}>▲</span> {growthPct.toFixed(1)}% ใน {milestones[milestones.length - 1].yr} ปี
          </span>
        )}
      </div>
      <ForecastBody milestones={milestones} chartPts={chartPts} base={base} maxCo2={maxCo2} isMobile={isMobile} />
    </div>
  );
}

function PlotsMapView({ plots, isMobile }: { plots: SavedPlot[], isMobile: boolean }) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
        sources: {
          sat: {
            type: "raster",
            tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
            tileSize: 256,
            minzoom: 1,
            maxzoom: 18,
            attribution: "",
          },
          street: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            minzoom: 1,
            maxzoom: 18,
            attribution: "",
          },
        },
        layers: [
          { id: "sat", type: "raster", source: "sat", layout: { visibility: "visible" } },
          { id: "street", type: "raster", source: "street", layout: { visibility: "none" } },
        ],
      },
      center: [101.258, 13.5],
      zoom: 5,
      attributionControl: false,
    });

    mapRef.current = map;
    const nav = new maplibregl.NavigationControl();
    map.addControl(nav, "bottom-right");

    const onMapLoad = () => {
      if (!mapRef.current) return;
      const m = mapRef.current;
      const boundaryFeatures: any[] = [];
      const parcelFeatures: any[] = [];

      plots.forEach((p, i) => {
        const carbonPerTree = (p.trees && p.trees > 0)
          ? (p.carbonTotal / p.trees).toFixed(3)
          : null;
        const props = {
          id: p.id,
          name: p.name,
          area: p.areaRai.toFixed(2),
          carbon: p.carbonTotal.toFixed(2),
          carbonPerTree: carbonPerTree ?? "—",
          province: p.province || "—",
          index: String(i + 1)
        };

        if (p.boundaryGeojson) {
          boundaryFeatures.push({
            type: "Feature",
            geometry: p.boundaryGeojson,
            properties: { ...props, type: 'boundary' }
          });
        }
        if (p.geojson) {
          parcelFeatures.push({
            type: "Feature",
            geometry: p.geojson,
            properties: { ...props, type: 'parcel' }
          });
        }
      });

      map.addSource("my-boundaries", {
        type: "geojson",
        data: { type: "FeatureCollection", features: boundaryFeatures }
      });
      map.addSource("my-parcels", {
        type: "geojson",
        data: { type: "FeatureCollection", features: parcelFeatures }
      });

      map.addLayer({
        id: "boundary-fill",
        type: "fill",
        source: "my-boundaries",
        paint: { "fill-color": "#3b82f6", "fill-opacity": 0.05 }
      });
      map.addLayer({
        id: "boundary-outline",
        type: "line",
        source: "my-boundaries",
        paint: {
          "line-color": "#3b82f6",
          "line-width": 1.5,
          "line-dasharray": [4, 2]
        }
      });

      map.addLayer({
        id: "parcel-fill",
        type: "fill",
        source: "my-parcels",
        paint: {
          "fill-color": "#ea580c",
          "fill-opacity": 0.35
        }
      });
      map.addLayer({
        id: "parcel-outline",
        type: "line",
        source: "my-parcels",
        paint: { "line-color": "#9a3412", "line-width": 2 }
      });

      // Index Labels
      map.addLayer({
        id: "parcel-label",
        type: "symbol",
        source: "my-parcels",
        layout: {
          "text-field": ["get", "index"],
          "text-size": 16,
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": "#dc2626",
          "text-halo-color": "#ffffff",
          "text-halo-width": 3,
        }
      });

      const handlePlotClick = (e: any) => {
        if (!e.features?.length) return;
        const p = e.features[0].properties;
        const isBoundary = p.type === 'boundary';
        if (isBoundary) return;  // ไม่แสดง popup สำหรับขอบเขตที่วาด
        const dot = isBoundary ? '#6366f1' : '#10b981';
        const html = `
          <div style="
            font-family: 'Noto Sans Thai', 'Noto Sans', system-ui, sans-serif;
            width: 220px;
            background: #fff;
            border-radius: 14px;
            border: 1px solid #e2e8f0;
            box-shadow: 0 8px 24px rgba(0,0,0,0.10);
            overflow: hidden;
          ">
            <!-- Accent top bar -->
            <div style="height: 3px; background: ${dot};"></div>

            <!-- Content -->
            <div style="padding: 14px 16px 12px;">
              <!-- Type + Index -->
              <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
                <span style="
                  font-size: 9.5px; font-weight: 700; letter-spacing: 0.5px;
                  color: ${dot}; text-transform: uppercase;
                ">${isBoundary ? 'ขอบเขตที่วาด' : 'แปลงที่ตรวจพบ'}</span>
                <span style="font-size: 10px; color: #cbd5e1; font-weight: 600;">#${p.index}</span>
              </div>

              <!-- Name -->
              <div style="font-size: 16px; font-weight: 800; color: #0f172a; margin-bottom: 6px; line-height: 1.2;">${p.name}</div>

              <!-- Province -->
              <div style="display:flex; align-items:center; gap:5px; color:#94a3b8; font-size:11.5px; margin-bottom:14px;">
                <i class="bi bi-geo-alt-fill" style="font-size:10px; color:${dot};"></i>
                <span>${p.province}</span>
              </div>

              <!-- Divider -->
              <div style="height:1px; background:#f1f5f9; margin-bottom:12px;"></div>

              <!-- Stats row -->
              <div style="display:flex; gap:12px; align-items:flex-start;">
                <div>
                  <div style="font-size:15px; font-weight:800; color:#0f172a;">${p.area}</div>
                  <div style="font-size:9.5px; color:#94a3b8; margin-top:1px;">ไร่</div>
                </div>
                <div style="width:1px; background:#f1f5f9; align-self:stretch;"></div>
                <div>
                  <div style="font-size:15px; font-weight:800; color:#059669;">${p.carbon}</div>
                  <div style="font-size:9.5px; color:#94a3b8; margin-top:1px;">tCO₂</div>
                </div>
                ${p.carbonPerTree !== '—' ? `
                <div style="width:1px; background:#f1f5f9; align-self:stretch;"></div>
                <div>
                  <div style="font-size:13px; font-weight:800; color:#0891b2;">${p.carbonPerTree}</div>
                  <div style="font-size:9px; color:#94a3b8; margin-top:1px; line-height:1.3;">tCO₂<br>/ต้น</div>
                </div>
                ` : ''}
              </div>
            </div>
          </div>
        `;
        new maplibregl.Popup({ closeButton: false, maxWidth: 'none', className: 'kc-custom-popup' })
          .setLngLat(e.lngLat)
          .setHTML(html)
          .addTo(map);
      };

      map.on("click", "parcel-fill", handlePlotClick);
      map.on("mouseenter", "parcel-fill", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "parcel-fill", () => { map.getCanvas().style.cursor = ""; });

      if (boundaryFeatures.length > 0 || parcelFeatures.length > 0) {
        const bounds = new maplibregl.LngLatBounds();
        [...boundaryFeatures, ...parcelFeatures].forEach(f => {
          const geom = f.geometry as any;
          const processCoords = (coords: any) => {
            if (typeof coords[0] === "number") bounds.extend(coords as [number, number]);
            else coords.forEach(processCoords);
          };
          processCoords(geom.coordinates);
        });
        map.fitBounds(bounds, { padding: isMobile ? 40 : 80, duration: 1200 });
      }
    };

    map.on("load", onMapLoad);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [isMobile]); // Only recreate map if isMobile changes (rare)

  // Separate effect to update data when plots change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const boundaryFeatures: any[] = [];
    const parcelFeatures: any[] = [];

    plots.forEach((p, i) => {
      const carbonPerTree = (p.trees && p.trees > 0)
        ? (p.carbonTotal / p.trees).toFixed(3)
        : null;
      const props = {
        id: p.id,
        name: p.name,
        area: p.areaRai.toFixed(2),
        carbon: p.carbonTotal.toFixed(2),
        carbonPerTree: carbonPerTree ?? "—",
        province: p.province || "—",
        index: String(i + 1)
      };

      if (p.boundaryGeojson) {
        boundaryFeatures.push({
          type: "Feature",
          geometry: p.boundaryGeojson,
          properties: { ...props, type: 'boundary' }
        });
      }
      if (p.geojson) {
        parcelFeatures.push({
          type: "Feature",
          geometry: p.geojson,
          properties: { ...props, type: 'parcel' }
        });
      }
    });

    const bSrc = map.getSource("my-boundaries") as maplibregl.GeoJSONSource;
    const pSrc = map.getSource("my-parcels") as maplibregl.GeoJSONSource;

    if (bSrc) bSrc.setData({ type: "FeatureCollection", features: boundaryFeatures });
    if (pSrc) pSrc.setData({ type: "FeatureCollection", features: parcelFeatures });

    if (boundaryFeatures.length > 0 || parcelFeatures.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      [...boundaryFeatures, ...parcelFeatures].forEach(f => {
        const geom = f.geometry as any;
        const processCoords = (coords: any) => {
          if (typeof coords[0] === "number") bounds.extend(coords as [number, number]);
          else if (Array.isArray(coords)) coords.forEach(processCoords);
        };
        processCoords(geom.coordinates);
      });
      if (!bounds.isEmpty()) {
        // Only fit bounds if the number of plots has changed to avoid fighting manual zoom
        const prevCount = map.getContainer().getAttribute('data-plot-count');
        if (prevCount !== String(plots.length)) {
          map.fitBounds(bounds, { padding: isMobile ? 40 : 80, duration: 1200 });
          map.getContainer().setAttribute('data-plot-count', String(plots.length));
        }
      }
    }
  }, [plots, isMobile]);

  return (
    <div style={{ position: "relative", marginBottom: 24 }}>
      <div
        ref={mapContainerRef}
        style={{
          width: "100%",
          height: isMobile ? "450px" : "600px",
          borderRadius: 24,
          overflow: "hidden",
          border: "1px solid rgba(16,185,129,0.15)",
          boxShadow: "0 10px 30px rgba(0,0,0,0.08)"
        }}
      />
      {/* Basemap toggle */}
      <div style={{ position: "absolute", top: 12, left: 12, display: "flex", gap: 6, background: "rgba(255,255,255,0.9)", padding: 4, borderRadius: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.1)", zIndex: 1 }}>
        <button
          onClick={() => {
            if (!mapRef.current) return;
            mapRef.current.setLayoutProperty("sat", "visibility", "visible");
            mapRef.current.setLayoutProperty("street", "visibility", "none");
          }}
          style={{ padding: "6px 12px", borderRadius: 8, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer", background: "transparent" }}
        >ดาวเทียม</button>
        <button
          onClick={() => {
            if (!mapRef.current) return;
            mapRef.current.setLayoutProperty("sat", "visibility", "none");
            mapRef.current.setLayoutProperty("street", "visibility", "visible");
          }}
          style={{ padding: "6px 12px", borderRadius: 8, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer", background: "transparent" }}
        >ลายเส้น</button>
      </div>
    </div>
  );
}

function EditPlotModal({ plot, onClose, onSave, isMobile }: { plot: SavedPlot; onClose: () => void; onSave: (p: SavedPlot) => void; isMobile: boolean }) {
  const [formData, setFormData] = useState({
    name: plot.name || "",
    ownerName: plot.ownerName || "",
    province: plot.province || "",
    areaRai: plot.areaRai?.toString() || "",
    rubberAge: plot.rubberAge?.toString() || "",
    trees: plot.trees?.toString() || "",
    plantYearBE: plot.plantYearBE?.toString() || "",
  });

  const handleSave = () => {
    const ageNum = parseInt(formData.rubberAge) || 0;
    const treesNum = parseInt(formData.trees) || 0;
    const newCarbon = (ageNum > 0 && treesNum > 0) ? carbonCo2(ageNum, treesNum) : plot.carbonTotal;
    const forecast = {
      yr3: carbonCo2(ageNum + 3, treesNum),
      yr5: carbonCo2(ageNum + 5, treesNum),
      yr7: carbonCo2(ageNum + 7, treesNum)
    };

    onSave({
      ...plot,
      name: formData.name,
      ownerName: formData.ownerName,
      province: formData.province,
      areaRai: parseFloat(formData.areaRai) || 0,
      rubberAge: ageNum,
      trees: treesNum,
      plantYearBE: parseInt(formData.plantYearBE) || undefined,
      carbonTotal: newCarbon,
      forecast
    });
  };

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 500, maxHeight: "90vh", overflow: "auto", padding: isMobile ? 20 : 30, boxShadow: "0 20px 40px rgba(0,0,0,0.2)" }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#064e3b", marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
          <i className="bi bi-pencil-square" style={{ color: "#10b981" }} /> แก้ไขข้อมูลแปลง
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#475569", marginBottom: 6 }}>ชื่อโครงการ</label>
            <input type="text" value={formData.name} onChange={e => setFormData(f => ({ ...f, name: e.target.value }))} style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid #cbd5e1", fontSize: 14 }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#475569", marginBottom: 6 }}>ชื่อเจ้าของ</label>
            <input type="text" value={formData.ownerName} onChange={e => setFormData(f => ({ ...f, ownerName: e.target.value }))} style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid #cbd5e1", fontSize: 14 }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#475569", marginBottom: 6 }}>จังหวัด</label>
            <input type="text" value={formData.province} onChange={e => setFormData(f => ({ ...f, province: e.target.value }))} style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid #cbd5e1", fontSize: 14 }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#475569", marginBottom: 6 }}>พื้นที่ (ไร่)</label>
            <input type="number" step="0.01" value={formData.areaRai} onChange={e => setFormData(f => ({ ...f, areaRai: e.target.value }))} style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid #cbd5e1", fontSize: 14 }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#475569", marginBottom: 6 }}>อายุยาง (ปี)</label>
            <input type="number" value={formData.rubberAge} onChange={e => setFormData(f => ({ ...f, rubberAge: e.target.value }))} style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid #cbd5e1", fontSize: 14 }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#475569", marginBottom: 6 }}>จำนวนต้น</label>
            <input type="number" value={formData.trees} onChange={e => setFormData(f => ({ ...f, trees: e.target.value }))} style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid #cbd5e1", fontSize: 14 }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#475569", marginBottom: 6 }}>ปีที่ปลูก (พ.ศ.)</label>
            <input type="number" value={formData.plantYearBE} onChange={e => setFormData(f => ({ ...f, plantYearBE: e.target.value }))} style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid #cbd5e1", fontSize: 14 }} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, marginTop: 24, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "#f1f5f9", color: "#475569", fontWeight: 700, cursor: "pointer" }}>ยกเลิก</button>
          <button onClick={handleSave} style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "#10b981", color: "#fff", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <i className="bi bi-floppy-disk" /> บันทึก
          </button>
        </div>
      </div>
    </div>
  );
}

function PlotCard({ plot, index, onDelete, onEdit, expanded, onToggle, isMobile }: { plot: SavedPlot; index: number; onDelete: () => void; onEdit?: (p: SavedPlot) => void; expanded: boolean; onToggle: () => void; isMobile: boolean }) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const carbonPerTree = plot.trees && plot.trees > 0 ? (plot.carbonTotal / plot.trees) : null;

  // Build CarbonBarChart data points
  const currentYearBE = new Date().getFullYear() + 543;
  const plantYearBE = plot.plantYearBE && plot.plantYearBE > 0
    ? plot.plantYearBE
    : (currentYearBE - (plot.rubberAge || 0));

  const barPts = (plot.carbonTotal > 0 && plot.rubberAge > 0 && (plot.trees ?? 0) > 0)
    ? buildBarPoints(plot.rubberAge, plantYearBE, plot.trees ?? 0, plot.spacing || "2.5*8")
    : [];

  // 4 key metrics — same fields as the map-draw input panel
  const mainMetrics = [
    { label: "พื้นที่", val: plot.areaRai > 0 ? plot.areaRai.toFixed(2) : "—", unit: "ไร่", icon: "bi-grid-3x3", color: "#0d9488", grd: "linear-gradient(135deg,rgba(13,148,136,0.14),rgba(13,148,136,0.05))", border: "rgba(13,148,136,0.22)" },
    { label: "ปีที่ปลูก", val: plot.plantYearBE && plot.plantYearBE > 0 ? String(plot.plantYearBE) : "—", unit: "พ.ศ.", icon: "bi-calendar2-check", color: "#0369a1", grd: "linear-gradient(135deg,rgba(3,105,161,0.14),rgba(3,105,161,0.05))", border: "rgba(3,105,161,0.22)" },
    { label: "พันธุ์ยาง", val: plot.variety || "—", unit: "", icon: "bi-patch-check", color: "#7c3aed", grd: "linear-gradient(135deg,rgba(124,58,237,0.14),rgba(124,58,237,0.05))", border: "rgba(124,58,237,0.22)" },
    { label: "จำนวนต้น", val: plot.trees && plot.trees > 0 ? plot.trees.toLocaleString("th-TH") : "—", unit: "ต้น", icon: "bi-tree-fill", color: "#16a34a", grd: "linear-gradient(135deg,rgba(22,163,74,0.14),rgba(22,163,74,0.05))", border: "rgba(22,163,74,0.22)" },
    { label: "ระยะปลูก", val: plot.spacing || "—", unit: "ม.", icon: "bi-arrows-expand", color: "#ea580c", grd: "linear-gradient(135deg,rgba(234,88,12,0.14),rgba(234,88,12,0.05))", border: "rgba(234,88,12,0.22)" },
    { label: "คาร์บอน/ต้น", val: carbonPerTree !== null ? (carbonPerTree < 0.01 ? carbonPerTree.toFixed(4) : carbonPerTree.toFixed(3)) : "—", unit: "tCO₂", icon: "bi-droplet-fill", color: "#059669", grd: "linear-gradient(135deg,rgba(5,150,105,0.14),rgba(5,150,105,0.05))", border: "rgba(5,150,105,0.22)" },
  ];

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 20,
        border: "1px solid rgba(16,185,129,0.12)",
        boxShadow: "0 4px 20px rgba(0,0,0,0.05)",
        overflow: "hidden",
        transition: "all 0.25s ease",
        position: "relative"
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = "0 12px 30px rgba(16,185,129,0.12)";
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.05)";
        e.currentTarget.style.transform = "";
      }}
    >
      {/* ── Top Header Area ── */}
      <div style={{
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        alignItems: isMobile ? "flex-start" : "center",
        justifyContent: "space-between",
        padding: isMobile ? "16px 18px 12px" : "16px 20px 14px",
        gap: isMobile ? 12 : 16,
        background: "linear-gradient(to bottom, #fff, #f9fafb)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0, flex: 1 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10, flexShrink: 0,
            background: "linear-gradient(135deg,#10b981,#059669)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 12px rgba(16,185,129,0.25)",
            fontSize: 18, fontWeight: 900, color: "#fff"
          }}>
            {index}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              แปลงที่ {index}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
              {plot.province && (
                <span style={{ fontSize: 11, color: "#64748b", display: "flex", alignItems: "center", gap: 3 }}>
                  <i className="bi bi-geo-alt-fill" style={{ color: "#10b981", fontSize: 10 }} />{plot.province}
                </span>
              )}
              <span style={{ fontSize: 11, color: "#94a3b8" }}>•</span>
              <span style={{ fontSize: 10.5, color: "#94a3b8" }}>
                {new Date(plot.date).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" })}
              </span>
            </div>
          </div>
        </div>

        {/* Total Carbon Badge - Always visible, prominent but compact */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "8px 14px", background: "rgba(16,185,129,0.06)",
          borderRadius: 14, border: "1px solid rgba(16,185,129,0.15)",
          alignSelf: isMobile ? "stretch" : "center",
          justifyContent: "space-between"
        }}>
          <div>
            <div style={{ fontSize: 9, color: plot.carbonTotal > 0 ? "#059669" : "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
              {plot.carbonTotal > 0 ? "คาร์บอนรวม" : "สถานะ"}
            </div>
            <div style={{ fontSize: plot.carbonTotal > 0 ? 20 : 16, fontWeight: 900, color: plot.carbonTotal > 0 ? "#064e3b" : "#94a3b8", lineHeight: 1 }}>
              {plot.carbonTotal > 0 ? (
                <>{fmtCompact(plot.carbonTotal)} <span style={{ fontSize: 11, fontWeight: 700 }}>tCO₂</span></>
              ) : "รอการประมวลผล"}
            </div>
          </div>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#10b981", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <i className="bi bi-cloud-check-fill" style={{ color: "#fff", fontSize: 14 }} />
          </div>
        </div>
      </div>

      {/* ── Condensed Metrics Grid ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(3, 1fr)",
        gap: 1,
        background: "rgba(16,185,129,0.1)",
        borderTop: "1px solid rgba(16,185,129,0.1)",
        borderBottom: "1px solid rgba(16,185,129,0.1)"
      }}>
        {[
          { label: "พื้นที่", val: plot.areaRai > 0 ? plot.areaRai.toFixed(2) : "—", unit: "ไร่", icon: "bi-grid-3x3" },
          { label: "ปีที่ปลูก", val: plot.plantYearBE && plot.plantYearBE > 0 ? String(plot.plantYearBE) : "—", unit: "พ.ศ.", icon: "bi-calendar2-check" },
          { label: "พันธุ์ยาง", val: plot.variety || "—", unit: "", icon: "bi-patch-check" },
          { label: "จำนวนต้น", val: plot.trees && plot.trees > 0 ? plot.trees.toLocaleString("th-TH") : "—", unit: "ต้น", icon: "bi-tree-fill" },
          { label: "ระยะปลูก", val: plot.spacing || "—", unit: "ม.", icon: "bi-arrows-expand" },
          { label: "คาร์บอน/ต้น", val: carbonPerTree !== null ? (carbonPerTree < 0.01 ? carbonPerTree.toFixed(4) : carbonPerTree.toFixed(3)) : "—", unit: "tCO₂", icon: "bi-droplet-fill" },
        ].map(({ label, val, unit, icon }) => (
          <div key={label} style={{ background: "#fff", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 1 }}>
            <div style={{ fontSize: 9.5, color: "#94a3b8", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
              <i className={`bi ${icon}`} style={{ fontSize: 10, color: "#10b981" }} /> {label}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: "#334155" }}>{val}</span>
              <span style={{ fontSize: 9.5, color: "#94a3b8", fontWeight: 500 }}>{unit}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Simple Action Footer ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 16px", background: "#fff"
      }}>
        <button
          onClick={onToggle}
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "6px 12px",
            background: expanded ? "rgba(16,185,129,0.08)" : "transparent",
            border: "none", borderRadius: 8, cursor: "pointer",
            fontSize: 12, fontWeight: 700, color: "#059669", transition: "all 0.15s"
          }}
        >
          <i className={`bi bi-bar-chart-line${expanded ? "-fill" : ""}`} />
          {expanded ? "ซ่อนรายละเอียด" : "ดูพยากรณ์และกราฟ"}
          <i className={`bi bi-chevron-${expanded ? "up" : "down"}`} style={{ fontSize: 10, opacity: 0.7 }} />
        </button>

        <div style={{ display: "flex", gap: 6 }}>
          {!confirmDelete ? (
            <>
              <button onClick={() => onEdit?.(plot)} style={{ width: 32, height: 32, borderRadius: 8, background: "#f1f5f9", color: "#475569", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }} title="แก้ไข">
                <i className="bi bi-pencil-square" style={{ fontSize: 14 }} />
              </button>
              <button onClick={() => setConfirmDelete(true)} style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(239,68,68,0.06)", color: "#ef4444", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }} title="ลบ">
                <i className="bi bi-trash3" style={{ fontSize: 14 }} />
              </button>
            </>
          ) : (
            <div style={{ display: "flex", gap: 4 }}>
              <button onClick={onDelete} style={{ padding: "4px 10px", background: "#ef4444", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 700, fontSize: 11 }}>ลบ</button>
              <button onClick={() => setConfirmDelete(false)} style={{ padding: "4px 10px", background: "#f1f5f9", color: "#64748b", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 11 }}>ยกเลิก</button>
            </div>
          )}
        </div>
      </div>

      {expanded && (
        <div style={{ padding: "0 16px 20px", background: "#fff" }}>
          <div style={{ height: 1, background: "#f1f5f9", marginBottom: 16 }} />

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(16,185,129,0.1)", color: "#059669", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <i className="bi bi-bar-chart-line-fill" style={{ fontSize: 12 }} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#064e3b" }}>กราฟการกักเก็บคาร์บอนรายปี (tCO₂)</div>
          </div>

          {barPts.length > 0 ? (
            <div style={{ marginBottom: 20 }}>
              <CarbonBarChart pts={barPts} isMobile={isMobile} />
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "30px 20px", background: "#f8fafc", borderRadius: 16, border: "1.5px dashed #e2e8f0", color: "#94a3b8", fontSize: 13, marginBottom: 20 }}>
              <i className="bi bi-bar-chart-line" style={{ fontSize: 24, display: "block", marginBottom: 10, opacity: 0.5 }} />
              {plot.carbonTotal > 0 ? "ข้อมูลไม่เพียงพอในการสร้างกราฟ" : "ยังไม่ได้ประมวลผลคาร์บอนสำหรับแปลงนี้"}
            </div>
          )}

        </div>
      )}
    </div>
  );
}



export default function MyPlotsPage() {
  const { user, ready } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [plots, setPlots] = useState<SavedPlot[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [expandedPlotId, setExpandedPlotId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"mine" | "all">("mine");
  const [displayMode, setDisplayMode] = useState<"list" | "map">("list");
  const [isMobile, setIsMobile] = useState(false);

  const isAdmin = user?.role === "admin";

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    setMounted(true);
    if (ready && user) {
      try {
        if (viewMode === "mine") {
          const key = `user_saved_plots_${user.id}`;
          const stored = localStorage.getItem(key);
          if (stored) {
            const parsed = JSON.parse(stored);
            const myOnly = Array.isArray(parsed) ? parsed.filter((p: any) => p.userId === user.id || !p.userId) : [];
            setPlots(myOnly);
          } else {
            setPlots([]);
          }
        } else if (isAdmin) {
          // Admin view: fetch plots from ALL users
          const usersRaw = localStorage.getItem("kc_users");
          const allUsers = usersRaw ? JSON.parse(usersRaw) : [];
          let allPlots: SavedPlot[] = [];

          allUsers.forEach((u: any) => {
            const userKey = `user_saved_plots_${u.id}`;
            const userPlotsRaw = localStorage.getItem(userKey);
            if (userPlotsRaw) {
              const parsed = JSON.parse(userPlotsRaw);
              if (Array.isArray(parsed)) {
                // Decorate plots with owner info if missing
                const decorated = parsed.map(p => ({
                  ...p,
                  userId: u.id,
                  ownerName: p.ownerName || u.fullname
                }));
                allPlots = [...allPlots, ...decorated];
              }
            }
          });

          // Also check the global_saved_plots for any legacy/anonymous ones
          const globalKey = 'global_saved_plots';
          const globalRaw = localStorage.getItem(globalKey);
          if (globalRaw) {
            const globalPlots = JSON.parse(globalRaw);
            // Only add global plots that aren't already in the list (by ID)
            const existingIds = new Set(allPlots.map(p => p.id));
            globalPlots.forEach((gp: any) => {
              if (!existingIds.has(gp.id)) {
                allPlots.push(gp);
              }
            });
          }

          // Sort by date desc
          allPlots.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          setPlots(allPlots);
        }
      } catch { }
    }
  }, [ready, user, viewMode]);


  const handleDelete = (id: string) => {
    if (!user) return;
    const plotToDelete = plots.find(p => p.id === id);
    if (!plotToDelete) return;

    const updated = plots.filter(p => p.id !== id);
    setPlots(updated);

    try {
      // 1. Update the owner's specific storage
      const ownerId = plotToDelete.userId || user.id;
      const key = `user_saved_plots_${ownerId}`;
      const ownerStoredRaw = localStorage.getItem(key);
      if (ownerStoredRaw) {
        const ownerPlots = JSON.parse(ownerStoredRaw);
        const filtered = ownerPlots.filter((p: any) => p.id !== id);
        localStorage.setItem(key, JSON.stringify(filtered));
      }

      // 2. Also remove from global list
      const globalKey = 'global_saved_plots';
      const globalRaw = localStorage.getItem(globalKey);
      if (globalRaw) {
        const globalPlots = JSON.parse(globalRaw);
        const filteredGlobal = globalPlots.filter((p: any) => p.id !== id);
        localStorage.setItem(globalKey, JSON.stringify(filteredGlobal));
      }
    } catch { }
  };



  const handleDeleteAll = () => {
    if (!user) return;
    if (viewMode === "all") {
      // Admin deleting everything? Let's limit this to current view for safety
      // Actually, standard behavior: delete what is shown
      plots.forEach(p => handleDelete(p.id));
    } else {
      const idsToDelete = plots.map(p => p.id);
      setPlots([]);
      try {
        const key = `user_saved_plots_${user.id}`;
        localStorage.removeItem(key);

        const globalKey = 'global_saved_plots';
        const globalRaw = localStorage.getItem(globalKey);
        if (globalRaw) {
          const globalPlots = JSON.parse(globalRaw);
          const filteredGlobal = globalPlots.filter((p: any) => !idsToDelete.includes(p.id));
          localStorage.setItem(globalKey, JSON.stringify(filteredGlobal));
        }
      } catch { }
    }
    setConfirmDeleteAll(false);
  };



  const totalArea = plots.reduce((s, p) => s + (p.areaRai || 0), 0);
  const totalCarbon = plots.reduce((s, p) => s + (p.carbonTotal || 0), 0);
  const totalForecast7 = plots.reduce((s, p) => {
    if (p.forecast?.yr7) return s + p.forecast.yr7;
    if ((p.trees ?? 0) > 0 && p.rubberAge > 0) return s + carbonCo2(p.rubberAge + 7, p.trees!);
    return s;
  }, 0);

  const filteredPlots = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return plots;
    return plots.filter(p =>
      p.name.toLowerCase().includes(term) ||
      (p.province ?? "").toLowerCase().includes(term) ||
      (p.ownerName ?? "").toLowerCase().includes(term)
    );
  }, [plots, searchTerm]);

  const projectGroups = useMemo(() => {
    const groups: { [key: string]: { projectName: string, plots: SavedPlot[], totalArea: number, totalCarbon: number, date: number } } = {};
    filteredPlots.forEach(p => {
      const pName = p.name || "ไม่มีชื่อโครงการ";
      if (!groups[pName]) {
        groups[pName] = { projectName: pName, plots: [], totalArea: 0, totalCarbon: 0, date: 0 };
      }
      groups[pName].plots.push(p);
      groups[pName].totalArea += (p.areaRai || 0);
      groups[pName].totalCarbon += (p.carbonTotal || 0);
      const d = new Date(p.date).getTime();
      if (d > groups[pName].date) groups[pName].date = d;
    });
    return Object.values(groups).sort((a, b) => b.date - a.date);
  }, [filteredPlots]);

  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
  const toggleProject = (pName: string) => setExpandedProjects(prev => ({ ...prev, [pName]: !prev[pName] }));

  const [editingPlot, setEditingPlot] = useState<SavedPlot | null>(null);

  const handleUpdatePlot = (updated: SavedPlot) => {
    if (!user) return;
    const newPlots = plots.map(p => p.id === updated.id ? updated : p);
    setPlots(newPlots);
    try {
      const ownerId = updated.userId || user.id;
      const key = `user_saved_plots_${ownerId}`;
      const ownerStoredRaw = localStorage.getItem(key);
      if (ownerStoredRaw) {
        const ownerPlots = JSON.parse(ownerStoredRaw);
        const saved = ownerPlots.map((p: any) => p.id === updated.id ? updated : p);
        localStorage.setItem(key, JSON.stringify(saved));
      }

      const globalKey = 'global_saved_plots';
      const globalRaw = localStorage.getItem(globalKey);
      if (globalRaw) {
        const globalPlots = JSON.parse(globalRaw);
        const savedGlobal = globalPlots.map((p: any) => p.id === updated.id ? updated : p);
        localStorage.setItem(globalKey, JSON.stringify(savedGlobal));
      }
    } catch { }
    setEditingPlot(null);
  };

  if (!ready || !mounted)
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fdfb" }}>
        <div className="spinner-border" style={{ color: "#10b981", width: "3rem", height: "3rem" }} role="status" />
      </div>
    );

  if (!user) return null;

  return (
    <div style={{ minHeight: "100vh", background: "#f4fcf8", paddingTop: 140, paddingBottom: "60px", fontFamily: "'Inter','Noto Sans Thai',sans-serif" }}>
      <div className="container" style={{ maxWidth: "1100px" }}>

        {/* Hero */}
        <div style={{
          background: HERO_BG, borderRadius: isMobile ? 18 : 20, padding: isMobile ? "20px 18px" : "28px 40px", marginBottom: 20,
          border: "1px solid rgba(16,185,129,0.15)", boxShadow: "0 10px 30px rgba(0,0,0,0.02)",
          position: "relative", overflow: "hidden",
        }}>
          <div style={{ position: "absolute", top: -50, left: -50, width: isMobile ? 150 : 200, height: isMobile ? 150 : 200, background: "rgba(16,185,129,0.2)", filter: "blur(60px)", borderRadius: "50%", pointerEvents: "none" }} />
          <div style={{ position: "absolute", bottom: -50, right: -50, width: isMobile ? 200 : 250, height: isMobile ? 200 : 250, background: "rgba(13,148,136,0.15)", filter: "blur(70px)", borderRadius: "50%", pointerEvents: "none" }} />

          <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", gap: 20 }}>
            <div style={{ width: "100%" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "4px 12px", background: "rgba(16,185,129,0.1)", color: "#059669", borderRadius: 50, fontSize: 11, fontWeight: 700, border: "1px solid rgba(16,185,129,0.2)" }}>
                  <i className="bi bi-folder-fill" /> {viewMode === "all" ? "ข้อมูลทั้งหมดในระบบ" : "ข้อมูลของฉัน"}
                </div>
              </div>
              <h1 style={{ fontSize: isMobile ? 24 : 30, fontWeight: 800, color: "#064e3b", marginBottom: 8, lineHeight: 1.2 }}>
                {viewMode === "all" ? "การจัดการแปลงยางพาราทั้งหมด" : "แปลงยางพาราของฉัน"}
              </h1>
              <p style={{ fontSize: isMobile ? 13 : 14, color: "#475569", margin: "0 0 18px", lineHeight: 1.6 }}>
                {viewMode === "all"
                  ? "ตรวจสอบและจัดการข้อมูลแปลงยางพาราของผู้ใช้งานทุกคนในระบบ"
                  : "จัดการและติดตามข้อมูลแปลงยาง พร้อมพยากรณ์คาร์บอนรายปี"}
              </p>
              {/* Search */}
              <div style={{ position: "relative", maxWidth: isMobile ? "100%" : 440 }}>
                <i className="bi bi-search" style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: searchFocused ? "#059669" : "#94a3b8", fontSize: 14, pointerEvents: "none" }} />
                <input
                  type="text"
                  placeholder="ค้นหาแปลง ชื่อเจ้าของ หรือจังหวัด..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  style={{
                    width: "100%", padding: "11px 38px 11px 40px",
                    borderRadius: 13, fontSize: 13, color: "#0f172a",
                    border: `2px solid ${searchFocused ? "#10b981" : "rgba(16,185,129,0.25)"}`,
                    background: "rgba(255,255,255,0.95)", outline: "none",
                    boxShadow: searchFocused ? "0 0 0 4px rgba(16,185,129,0.1)" : "0 2px 10px rgba(0,0,0,0.04)",
                    transition: "border-color 0.15s, box-shadow 0.15s",
                  }}
                />
                {searchTerm && (
                  <button onClick={() => setSearchTerm("")} style={{ position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 16, padding: 2, lineHeight: 1 }}>
                    <i className="bi bi-x-circle-fill" />
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", flexWrap: "wrap", alignItems: "center", justifyContent: isMobile ? "flex-start" : "flex-end", gap: isMobile ? 12 : 16, width: isMobile ? "100%" : "auto" }}>
              {isAdmin && (
                <div style={{
                  background: "rgba(255,255,255,0.9)",
                  padding: 4,
                  borderRadius: isMobile ? 12 : 14,
                  display: "flex",
                  gap: isMobile ? 3 : 4,
                  border: "1px solid rgba(16,185,129,0.15)",
                  width: isMobile ? "100%" : "auto",
                  boxShadow: isMobile ? "none" : "0 4px 15px rgba(0,0,0,0.05)"
                }}>
                  <button
                    onClick={() => setViewMode("mine")}
                    style={{
                      flex: isMobile ? 1 : "initial",
                      padding: isMobile ? "7px 12px" : "8px 16px",
                      borderRadius: isMobile ? 9 : 10,
                      border: "none",
                      fontSize: isMobile ? 12 : 13,
                      fontWeight: 700,
                      cursor: "pointer",
                      transition: "all 0.2s",
                      background: viewMode === "mine" ? "#10b981" : "transparent",
                      color: viewMode === "mine" ? "#fff" : "#64748b",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                      whiteSpace: "nowrap"
                    }}
                  >
                    <i className="bi bi-person-circle" /> {isMobile ? "ของฉัน" : "เฉพาะของฉัน"}
                  </button>
                  <button
                    onClick={() => setViewMode("all")}
                    style={{
                      flex: isMobile ? 1 : "initial",
                      padding: isMobile ? "7px 12px" : "8px 16px",
                      borderRadius: isMobile ? 9 : 10,
                      border: "none",
                      fontSize: isMobile ? 12 : 13,
                      fontWeight: 700,
                      cursor: "pointer",
                      transition: "all 0.2s",
                      background: viewMode === "all" ? "#0f172a" : "transparent",
                      color: viewMode === "all" ? "#fff" : "#64748b",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                      whiteSpace: "nowrap"
                    }}
                  >
                    <i className="bi bi-people-fill" /> {isMobile ? "ทั้งหมด" : "ดูทั้งหมด"}
                  </button>
                </div>
              )}
              <Link
                href="/map-draw"
                style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: isMobile ? 8 : 10, background: "linear-gradient(135deg,#10b981 0%,#059669 100%)", color: "#fff", padding: isMobile ? "12px 24px" : "14px 28px", borderRadius: isMobile ? 12 : 14, fontWeight: 700, fontSize: isMobile ? 13 : 15, textDecoration: "none", boxShadow: isMobile ? "0 6px 15px rgba(16,185,129,0.25)" : "0 10px 25px rgba(16,185,129,0.3)",
                  width: isMobile ? "100%" : "auto",
                  whiteSpace: "nowrap",
                  transition: "all 0.2s ease"
                }}
              >
                <i className="bi bi-plus-circle" style={{ fontSize: isMobile ? 15 : 17 }} /> วาดแปลงใหม่
              </Link>
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        {plots.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(auto-fit, minmax(190px, 1fr))", gap: isMobile ? 10 : 14, marginBottom: 24 }}>
            {([
              { label: "แปลงทั้งหมด", val: plots.length.toLocaleString("th-TH"), unit: "แปลง", icon: "bi-map", color: "#16a34a", bg: "rgba(22,163,74,0.08)" },
              { label: "พื้นที่รวม", val: totalArea.toFixed(2), unit: "ไร่", icon: "bi-grid-fill", color: "#0d9488", bg: "rgba(13,148,136,0.08)" },
            ] as { label: string; val: string; unit: string; icon: string; color: string; bg: string }[]).map(({ label, val, unit, icon, color, bg }) => (
              <div key={label} style={{ background: "#fff", borderRadius: 14, padding: isMobile ? "10px 12px" : "12px 14px", border: "1px solid rgba(0,0,0,0.05)", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                  <span style={{ fontSize: 10, color: "#64748b" }}>{label}</span>
                  <div style={{ width: 22, height: 22, borderRadius: 6, background: bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <i className={`bi ${icon}`} style={{ color, fontSize: 10 }} />
                  </div>
                </div>
                <div style={{ fontSize: isMobile ? 16 : 18, fontWeight: 800, color }}>{val} <span style={{ fontSize: 9, color: "#94a3b8", fontWeight: 400 }}>{unit}</span></div>
              </div>
            ))}
          </div>
        )}

        {/* Content */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, padding: "0 2px", gap: 10 }}>
            <h2 style={{ fontSize: isMobile ? 14 : 17, fontWeight: 800, color: "#064e3b", margin: 0, whiteSpace: "nowrap", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
              {viewMode === "all" ? (isMobile ? "แปลงทั้งหมด" : "รายการแปลงทั้งหมด") : (isMobile ? "แปลงที่บันทึก" : "รายการแปลงที่บันทึกแล้ว")}
              <span style={{ fontSize: isMobile ? 10 : 12, fontWeight: 400, color: "#64748b", marginLeft: isMobile ? 4 : 8 }}>
                {searchTerm ? `พบ ${filteredPlots.length}` : `(${plots.length})`}
              </span>
            </h2>
            <div style={{ display: "flex", gap: isMobile ? 6 : 10, alignItems: "center", flexShrink: 0 }}>
              {plots.length > 0 && (
                <div style={{
                  display: "flex",
                  background: "rgba(255,255,255,0.8)",
                  padding: 4,
                  borderRadius: 12,
                  border: "1px solid rgba(16,185,129,0.15)",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.05)"
                }}>
                  <button
                    onClick={() => setDisplayMode("list")}
                    style={{
                      padding: isMobile ? "5px 8px" : "6px 12px",
                      borderRadius: 8,
                      border: "none",
                      fontSize: isMobile ? 10.5 : 12,
                      fontWeight: 700,
                      cursor: "pointer",
                      background: displayMode === "list" ? "#10b981" : "transparent",
                      color: displayMode === "list" ? "#fff" : "#64748b",
                      transition: "all 0.2s"
                    }}
                  >
                    <i className="bi bi-list-ul" style={{ marginRight: isMobile ? 2 : 5 }} /> รายการ
                  </button>
                  <button
                    onClick={() => setDisplayMode("map")}
                    style={{
                      padding: isMobile ? "5px 8px" : "6px 12px",
                      borderRadius: 8,
                      border: "none",
                      fontSize: isMobile ? 10.5 : 12,
                      fontWeight: 700,
                      cursor: "pointer",
                      background: displayMode === "map" ? "#10b981" : "transparent",
                      color: displayMode === "map" ? "#fff" : "#64748b",
                      transition: "all 0.2s"
                    }}
                  >
                    <i className="bi bi-map-fill" style={{ marginRight: isMobile ? 2 : 5 }} /> แผนที่
                  </button>
                </div>
              )}
              {plots.length > 0 && (
                <div>
                  {confirmDeleteAll ? (
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ fontSize: 13, color: "#ef4444", fontWeight: 700 }}>ลบทั้งหมด?</span>
                      <button
                        onClick={handleDeleteAll}
                        style={{ padding: "6px 14px", background: "#ef4444", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 12 }}
                      >
                        ยืนยัน
                      </button>
                      <button
                        onClick={() => setConfirmDeleteAll(false)}
                        style={{ padding: "6px 14px", background: "rgba(0,0,0,0.06)", color: "#64748b", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600 }}
                      >
                        ยกเลิก
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteAll(true)}
                      style={{ padding: isMobile ? "6px 10px" : "8px 12px", background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, cursor: "pointer", fontSize: isMobile ? 13 : 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, transition: "all 0.2s" }}
                    >
                      <i className="bi bi-trash3-fill" style={{ fontSize: isMobile ? 14 : 12 }} /> {isMobile ? "" : "ลบทั้งหมด"}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {displayMode === "map" && filteredPlots.length > 0 ? (
            <PlotsMapView plots={filteredPlots} isMobile={isMobile} />
          ) : filteredPlots.length === 0 ? (
            <div style={{ textAlign: "center", padding: "44px 24px", background: "#fff", borderRadius: 20, color: "#94a3b8", fontSize: 13 }}>
              <i className="bi bi-search" style={{ fontSize: 30, display: "block", marginBottom: 8 }} />
              ไม่พบแปลงที่ตรงกับ &ldquo;<strong style={{ color: "#64748b" }}>{searchTerm}</strong>&rdquo;
              <br />
              <button onClick={() => setSearchTerm("")} style={{ marginTop: 12, padding: "5px 16px", background: "rgba(16,185,129,0.08)", color: "#059669", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 8, cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
                ล้างการค้นหา
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 24 : 32 }}>
              {editingPlot && <EditPlotModal plot={editingPlot} onClose={() => setEditingPlot(null)} onSave={handleUpdatePlot} isMobile={isMobile} />}
              {projectGroups.map((group, gIdx) => (
                <div key={`${group.projectName}-${gIdx}`} style={{ background: "#fff", borderRadius: 24, border: "1px solid rgba(16,185,129,0.2)", overflow: "hidden", boxShadow: "0 10px 30px rgba(0,0,0,0.03)" }}>
                  {/* Project Header */}
                  <div style={{ padding: isMobile ? "14px 16px" : "16px 24px", background: "linear-gradient(135deg,rgba(16,185,129,0.04),rgba(5,150,105,0.01))", display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", gap: 12 }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 10, background: "#10b981", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
                          <i className="bi bi-folder-fill" />
                        </div>
                        <h3 style={{ margin: 0, fontSize: isMobile ? 18 : 20, fontWeight: 800, color: "#064e3b" }}>{group.projectName}</h3>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, color: "#64748b", fontSize: 13, fontWeight: 500 }}>
                        <span><i className="bi bi-map-fill me-1" style={{ color: "#0ea5e9" }} /> {group.plots.length} แปลง</span>
                        <span><i className="bi bi-grid-fill me-1" style={{ color: "#10b981" }} /> {group.totalArea.toFixed(2)} ไร่</span>
                        <span><i className="bi bi-cloud-arrow-up-fill me-1" style={{ color: "#8b5cf6" }} /> {fmtCompact(group.totalCarbon)} tCO₂</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, width: isMobile ? "100%" : "auto" }}>
                      <Link href={`/map-draw?project=${encodeURIComponent(group.projectName)}&action=calc`} style={{ flex: isMobile ? "1 1 100%" : "auto", textAlign: "center", padding: "8px 16px", borderRadius: 12, background: "linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)", color: "#fff", fontWeight: 700, fontSize: 13, textDecoration: "none", border: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, boxShadow: "0 4px 15px rgba(14,165,233,0.3)" }}>
                        <i className="bi bi-magic" /> ประมวลผลคาร์บอน
                      </Link>
                      <Link href={`/map-draw?project=${encodeURIComponent(group.projectName)}`} style={{ flex: isMobile ? 1 : "auto", textAlign: "center", padding: "8px 16px", borderRadius: 12, background: "rgba(16,185,129,0.1)", color: "#059669", fontWeight: 700, fontSize: 13, textDecoration: "none", border: "1px solid rgba(16,185,129,0.2)", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                        <i className="bi bi-plus-lg" /> เพิ่มแปลง
                      </Link>
                      <button onClick={() => toggleProject(group.projectName)} style={{ flex: isMobile ? 1 : "auto", padding: "8px 16px", borderRadius: 12, background: expandedProjects[group.projectName] ? "rgba(0,0,0,0.05)" : "#0f172a", color: expandedProjects[group.projectName] ? "#475569" : "#fff", fontWeight: 700, fontSize: 13, border: "none", cursor: "pointer", transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                        {expandedProjects[group.projectName] ? "ซ่อนแปลง" : "ดูแปลงทั้งหมด"} <i className={`bi bi-chevron-${expandedProjects[group.projectName] ? "up" : "down"}`} />
                      </button>
                    </div>
                  </div>

                  {/* Project Plots */}
                  {expandedProjects[group.projectName] && (
                    <div style={{ padding: isMobile ? "16px" : "24px", background: "#f8fafc", borderTop: "1px solid rgba(16,185,129,0.1)" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                        {group.plots.map((plot, i) => (
                          <PlotCard
                            key={`${plot.id}-${i}`}
                            plot={plot}
                            index={i + 1}
                            onDelete={() => handleDelete(plot.id)}
                            onEdit={setEditingPlot}
                            expanded={expandedPlotId === plot.id}
                            onToggle={() => setExpandedPlotId(prev => prev === plot.id ? null : plot.id)}
                            isMobile={isMobile}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
