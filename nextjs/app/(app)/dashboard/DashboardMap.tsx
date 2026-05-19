"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { type Map as MLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export type MapPlot = {
  id: number | string;
  name: string;
  amphoe?: string;
  areaRai: number;
  carbonTotal: number;
  age?: number;
  geojson: GeoJSON.GeoJSON;
  boundaryGeojson?: GeoJSON.GeoJSON | null;
};

export type DistrictMarker = {
  id: string;
  name: string;
  carbon: number;
  plots: number;
  lat: number;
  lng: number;
};

type Bbox = { minLng: number; minLat: number; maxLng: number; maxLat: number };

// Carbon color stops (low → high)
const CARBON_MIN = 27000;
const CARBON_MAX = 120000;

export default function DashboardMap({
  plots,
  bbox,
  flyToCenter,
  flyZoom = 11,
  districts = [],
  selectedDistrictId,
  onSelectDistrict,
}: {
  plots: MapPlot[];
  bbox?: Bbox | null;
  flyToCenter?: [number, number] | null;
  flyZoom?: number;
  districts?: DistrictMarker[];
  selectedDistrictId?: string;
  onSelectDistrict?: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const onSelectRef = useRef(onSelectDistrict);
  onSelectRef.current = onSelectDistrict;

  const [isMobile, setIsMobile] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    setMounted(true);
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // ── Map initialisation (runs once) ──────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          satellite: {
            type: "raster",
            tiles: [
              "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
            ],
            tileSize: 256,
            attribution: "© Esri",
            maxzoom: 18,
          },
        },
        layers: [{ id: "satellite", type: "raster", source: "satellite" }],
      },
      center: [101.2587, 12.6819],
      zoom: 8,
      attributionControl: false,
    });
    mapRef.current = map;

    // Only add zoom controls on desktop. Mobile users use pinch-to-zoom.
    if (window.innerWidth >= 640) {
      map.addControl(
        new maplibregl.NavigationControl({ visualizePitch: false }),
        "bottom-right",
      );
    }

    map.on("load", () => {
      // ── User plot layers (for reuse on other pages) ────────────────────────
      const detectedFeatures: GeoJSON.Feature[] = [];
      const boundaryFeatures: GeoJSON.Feature[] = [];
      const seenBoundaries = new Set<string>();

      for (const plot of plots) {
        if (plot.geojson) {
          detectedFeatures.push({
            type: "Feature",
            geometry: plot.geojson as GeoJSON.Geometry,
            properties: {
              name: plot.name ?? "แปลงไม่มีชื่อ",
              amphoe: plot.amphoe ?? "",
              area: plot.areaRai ?? 0,
              carbon: plot.carbonTotal ?? 0,
              age: plot.age ?? 0,
            },
          });
        }
        const bnd = plot.boundaryGeojson as GeoJSON.Geometry | null | undefined;
        if (bnd) {
          const key = JSON.stringify(bnd);
          if (!seenBoundaries.has(key)) {
            seenBoundaries.add(key);
            boundaryFeatures.push({ type: "Feature", geometry: bnd, properties: { name: plot.name } });
          }
        }
      }

      map.addSource("plots-boundary", { type: "geojson", data: { type: "FeatureCollection", features: boundaryFeatures } });
      map.addLayer({ id: "plots-boundary-fill", type: "fill", source: "plots-boundary", paint: { "fill-color": "#22d3ee", "fill-opacity": 0.10 } });
      map.addLayer({ id: "plots-boundary-line", type: "line", source: "plots-boundary", paint: { "line-color": "#06b6d4", "line-width": 2, "line-dasharray": [3, 2] } });
      map.addSource("plots-detected", { type: "geojson", data: { type: "FeatureCollection", features: detectedFeatures } });
      map.addLayer({ id: "plots-detected-fill", type: "fill", source: "plots-detected", paint: {
        "fill-color": ["interpolate", ["linear"], ["get", "carbon"],
          0,   "#fef08a",   // ต่ำ  — เหลืองอ่อน
          100, "#34d399",   // ปานกลาง — เขียวมรกต
          250, "#f97316",   // สูง   — ส้ม
        ] as any,
        "fill-opacity": ["interpolate", ["linear"], ["get", "carbon"],
          0, 0.70,
          250, 0.92,
        ] as any,
      } } as any); // eslint-disable-line
      map.addLayer({ id: "plots-detected-line", type: "line", source: "plots-detected", paint: { "line-color": "#1e1b4b", "line-width": 0.8, "line-opacity": 0.55 } });


      // ── District markers ───────────────────────────────────────────────────
      // District markers removed based on user request

      // ── Fit bounds ─────────────────────────────────────────────────────────
      if (bbox) {
        map.fitBounds([[bbox.minLng, bbox.minLat], [bbox.maxLng, bbox.maxLat]], { padding: 60, duration: 1000, maxZoom: 16 });
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [plots, bbox, districts]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Update selected district ring when selection changes ─────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (map.getLayer("districts-selected")) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        map.setFilter("districts-selected", ["==", ["get", "id"], selectedDistrictId ?? ""] as any);
      }
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [selectedDistrictId]);

  // ── Fly to selected district ──────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !flyToCenter) return;
    mapRef.current.flyTo({ center: flyToCenter, zoom: flyZoom, duration: 1000 });
  }, [flyToCenter, flyZoom]);

  return (
    <div style={{ position: "relative", height: "100%" }}>
      <div ref={containerRef} style={{ height: "100%" }} />

      {/* ── Legend: desktop (always visible) ───────────────────────────────── */}
      {mounted && !isMobile && (
        <div style={{
          position: "absolute", bottom: 48, left: 12,
          background: "rgba(15,23,42,0.9)", backdropFilter: "blur(16px)",
          borderRadius: 13, padding: "12px 16px",
          border: "1px solid rgba(255,255,255,0.12)",
          borderTop: "3px solid #34d399",
          boxShadow: "0 6px 24px rgba(0,0,0,0.4)",
          fontFamily: "'Noto Sans Thai','Inter',sans-serif", minWidth: 168,
        }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "#6ee7b7", marginBottom: 10, letterSpacing: 0.6, display: "flex", alignItems: "center", gap: 5 }}>
            <i className="bi bi-info-circle-fill" style={{ color: "#34d399" }} /> ระดับคาร์บอนต่อแปลง (tCO₂)
          </div>
          {/* Gradient bar */}
          <div style={{ height: 7, borderRadius: 4, marginBottom: 6, background: "linear-gradient(90deg,#fef08a,#34d399,#f97316)", boxShadow: "0 0 8px rgba(249,115,22,0.35)" }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8.5, color: "#94a3b8", fontWeight: 600, marginBottom: 10 }}>
            <span>&lt;100</span><span>100–250</span><span>&gt;250</span>
          </div>
          {([
            { color: "#fef08a", label: "ต่ำ",      range: "< 100" },
            { color: "#34d399", label: "ปานกลาง", range: "100–250" },
            { color: "#f97316", label: "สูง",      range: "> 250" },
          ] as const).map(s => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
              <div style={{ width: 12, height: 12, borderRadius: 3, flexShrink: 0, background: s.color, border: "1px solid rgba(255,255,255,0.2)", boxShadow: `0 0 6px ${s.color}88` }} />
              <span style={{ fontSize: 10, color: "#cbd5e1", flex: 1 }}>{s.label}</span>
              <span style={{ fontSize: 9, color: "#94a3b8", fontWeight: 600 }}>{s.range}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Legend: mobile (collapsible) ────────────────────────────────────── */}
      {mounted && isMobile && (
        <div style={{
          position: "absolute", bottom: 24, left: 12,
          fontFamily: "'Noto Sans Thai','Inter',sans-serif",
          display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8,
          zIndex: 10,
        }}>
          {/* Expanded panel */}
          {legendOpen && (
            <div style={{
              background: "rgba(15,23,42,0.92)", backdropFilter: "blur(12px)",
              borderRadius: 14, padding: "12px 14px",
              border: "1px solid rgba(255,255,255,0.08)",
              borderTop: "3px solid #34d399",
              boxShadow: "0 8px 24px -4px rgba(0,0,0,0.5)",
              minWidth: 180,
              animation: "fadeIn 0.2s ease-out",
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#6ee7b7", marginBottom: 8, letterSpacing: 0.3, display: "flex", alignItems: "center", gap: 4 }}>
                <i className="bi bi-info-circle-fill" style={{ color: "#34d399", fontSize: 10 }} /> คาร์บอนต่อแปลง (tCO₂)
              </div>

              {/* Gradient bar for mobile */}
              <div style={{ height: 7, borderRadius: 4, overflow: "hidden", marginBottom: 5, background: "linear-gradient(90deg,#fef08a,#34d399,#f97316)", boxShadow: "0 0 6px rgba(249,115,22,0.3)" }} />
              
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8.5, color: "#94a3b8", fontWeight: 600, marginBottom: 10 }}>
                <span>&lt;100</span>
                <span>100–250</span>
                <span>&gt;250</span>
              </div>
            </div>
          )}

          {/* Toggle button */}
          <button
            onClick={() => setLegendOpen(o => !o)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: legendOpen ? "rgba(15,23,42,0.95)" : "rgba(15,23,42,0.85)", 
              backdropFilter: "blur(8px)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 20, padding: "6px 14px",
              color: "#6ee7b7", fontSize: 11, fontWeight: 600,
              cursor: "pointer", boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
              fontFamily: "inherit", transition: "all 0.2s",
            }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: "linear-gradient(135deg,#34d399,#f97316)", flexShrink: 0 }} />
            สัญลักษณ์
            <span style={{ fontSize: 9, opacity: 0.6, marginLeft: 2, transform: legendOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▼</span>
          </button>
        </div>
      )}
    </div>
  );
}
