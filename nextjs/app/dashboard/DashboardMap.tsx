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
  areaRai: number;
  lat: number;
  lng: number;
};

type Bbox = { minLng: number; minLat: number; maxLng: number; maxLat: number };

const CARBON_MIN = 27000;
const CARBON_MAX = 120000;

const DISTRICT_PCODES: Record<string, string> = {
  mueang: "TH2101",
  "ban-chang": "TH2102",
  klaeng: "TH2103",
  "wang-chan": "TH2104",
  "ban-khai": "TH2105",
  "pluak-daeng": "TH2106",
  "khao-chamao": "TH2107",
  nikhom: "TH2108",
};

function ringCentroid(ring: number[][]): [number, number] {
  let cx = 0, cy = 0, area = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const cross = ring[i][0] * ring[j][1] - ring[j][0] * ring[i][1];
    cx += (ring[i][0] + ring[j][0]) * cross;
    cy += (ring[i][1] + ring[j][1]) * cross;
    area += cross;
  }
  area /= 2;
  if (Math.abs(area) < 1e-12) {
    let sumX = 0, sumY = 0;
    for (const [x, y] of ring) { sumX += x; sumY += y; }
    return [sumX / ring.length, sumY / ring.length];
  }
  return [cx / (6 * area), cy / (6 * area)];
}

function ringArea(ring: number[][]): number {
  let area = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += ring[i][0] * ring[j][1] - ring[j][0] * ring[i][1];
  }
  return Math.abs(area) / 2;
}

function multiPolygonCentroid(geom: GeoJSON.MultiPolygon): [number, number] {
  let best = [0, 0] as [number, number];
  let maxArea = 0;
  for (const poly of geom.coordinates) {
    const area = ringArea(poly[0]);
    if (area > maxArea) {
      maxArea = area;
      best = ringCentroid(poly[0]);
    }
  }
  return best;
}

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
              "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
            ],
            tileSize: 256,
            attribution: "© Google",
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

    if (window.innerWidth >= 640) {
      map.addControl(
        new maplibregl.NavigationControl({ visualizePitch: false }),
        "bottom-right",
      );
    }

    map.on("load", () => {
      // ── District boundary (bottom-most layer) ─────────────────────────
      map.addSource("district-boundary", {
        type: "geojson",
        data: "/api/geojson/districts",
      } as any);
      map.addLayer({
        id: "district-boundary-fill",
        type: "fill",
        source: "district-boundary",
        paint: {
          "fill-color": "#ffffff",
          "fill-opacity": 0.04,
        },
      });
      map.addLayer({
        id: "district-boundary-line",
        type: "line",
        source: "district-boundary",
        paint: {
          "line-color": "#ffffff",
          "line-width": 2,
          "line-opacity": 0.5,
          "line-dasharray": [4, 3],
        },
      });
      map.addLayer({
        id: "district-boundary-selected",
        type: "line",
        source: "district-boundary",
        filter: ["==", ["get", "ADM2_PCODE"], ""],
        paint: {
          "line-color": "#fbbf24",
          "line-width": 3.5,
          "line-opacity": 0.9,
        },
      });

      // ── User plot layers ──────────────────────────────────────────────
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
      map.addLayer({ id: "plots-boundary-fill", type: "fill", source: "plots-boundary", paint: { "fill-color": "#f97316", "fill-opacity": 0.12 } });
      map.addLayer({ id: "plots-boundary-line", type: "line", source: "plots-boundary", paint: { "line-color": "#ea580c", "line-width": 2.5 } });
      map.addSource("plots-detected", { type: "geojson", data: { type: "FeatureCollection", features: detectedFeatures } });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.addLayer({ id: "plots-detected-fill", type: "fill", source: "plots-detected", paint: {
        "fill-color": ["interpolate", ["linear"], ["get", "carbon"],
          0,   "#d1fae5",
          30,  "#6ee7b7",
          80,  "#34d399",
          150, "#10b981",
          280, "#059669",
          500, "#047857",
        ] as any,
        "fill-opacity": 0.85,
      } } as any); // eslint-disable-line
      map.addLayer({ id: "plots-detected-line", type: "line", source: "plots-detected", paint: { "line-color": "#065f46", "line-width": 0.6, "line-opacity": 0.45 } });

      // ── District markers with centroids from GeoJSON ──────────────────
      if (districts.length > 0) {
        // Load GeoJSON to compute centroids
        fetch("/api/geojson/districts")
          .then(r => r.json())
          .then((gj: GeoJSON.FeatureCollection) => {
            const centroidMap: Record<string, [number, number]> = {};
            for (const f of gj.features) {
              const pcode = f.properties?.ADM2_PCODE as string;
              if (!pcode) continue;
              if (f.geometry.type === "MultiPolygon") {
                centroidMap[pcode] = multiPolygonCentroid(f.geometry as GeoJSON.MultiPolygon);
              } else if (f.geometry.type === "Polygon") {
                const geom = f.geometry as GeoJSON.Polygon;
                centroidMap[pcode] = ringCentroid(geom.coordinates[0] as number[][]);
              }
            }

            const enriched = districts.map(d => {
              const pcode = DISTRICT_PCODES[d.id];
              const c = pcode ? centroidMap[pcode] : null;
              return { ...d, lng: c ? c[0] : d.lng, lat: c ? c[1] : d.lat };
            });

            const features: GeoJSON.Feature[] = enriched.map(d => ({
              type: "Feature",
              geometry: { type: "Point", coordinates: [d.lng, d.lat] } as GeoJSON.Point,
              properties: { id: d.id, name: d.name, carbon: d.carbon, areaRai: d.areaRai },
            }));

            map.addSource("districts", {
              type: "geojson",
              data: { type: "FeatureCollection", features },
            });

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            map.addLayer({
              id: "districts-glow",
              type: "circle",
              source: "districts",
              paint: {
                "circle-radius": ["interpolate", ["linear"], ["get", "carbon"], CARBON_MIN, 26, CARBON_MAX, 50],
                "circle-color": ["interpolate", ["linear"], ["get", "carbon"], CARBON_MIN, "#4ade80", 75000, "#16a34a", CARBON_MAX, "#14532d"],
                "circle-opacity": 0.2,
                "circle-blur": 1.4,
              },
            } as any); // eslint-disable-line

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            map.addLayer({
              id: "districts-circle",
              type: "circle",
              source: "districts",
              paint: {
                "circle-radius": ["interpolate", ["linear"], ["get", "carbon"],
                  CARBON_MIN, 13,
                  50000, 18,
                  80000, 24,
                  CARBON_MAX, 30,
                ],
                "circle-color": ["interpolate", ["linear"], ["get", "carbon"],
                  CARBON_MIN, "#4ade80",
                  40000, "#34d399",
                  60000, "#22c55e",
                  90000, "#16a34a",
                  CARBON_MAX, "#14532d",
                ],
                "circle-opacity": 0.92,
                "circle-stroke-width": 2.5,
                "circle-stroke-color": "#ffffff",
                "circle-stroke-opacity": 0.95,
              },
            } as any); // eslint-disable-line

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            map.addLayer({
              id: "districts-selected",
              type: "circle",
              source: "districts",
              filter: ["==", ["get", "id"], ""],
              paint: {
                "circle-radius": ["interpolate", ["linear"], ["get", "carbon"],
                  CARBON_MIN, 20, CARBON_MAX, 38,
                ],
                "circle-color": "rgba(0,0,0,0)",
                "circle-stroke-width": 3.5,
                "circle-stroke-color": "#fbbf24",
                "circle-stroke-opacity": 0.95,
              },
            } as any); // eslint-disable-line

            map.on("click", "districts-circle", (e) => {
              const props = e.features?.[0]?.properties as { id?: string } | undefined;
              if (props?.id) onSelectRef.current?.(props.id);
            });
            map.on("mouseenter", "districts-circle", () => { map.getCanvas().style.cursor = "pointer"; });
            map.on("mouseleave", "districts-circle", () => { map.getCanvas().style.cursor = ""; });

            for (const d of enriched) {
              const radius = Math.round(13 + 17 * (d.carbon - CARBON_MIN) / (CARBON_MAX - CARBON_MIN));
              const el = document.createElement("div");
              el.style.cssText = "text-align:center;pointer-events:none;";
              el.innerHTML = `
                <div style="font-size:11px;font-weight:800;color:#fff;text-shadow:0 1px 4px rgba(0,0,0,0.95),0 0 10px rgba(0,0,0,0.6);white-space:nowrap;line-height:1.4">${d.name}</div>
                <div style="font-size:9.5px;font-weight:700;color:#86efac;text-shadow:0 1px 3px rgba(0,0,0,0.95);white-space:nowrap">${(d.carbon / 1000).toFixed(0)}k tCO₂eq</div>
              `;
              new maplibregl.Marker({ element: el, anchor: "top", offset: [0, radius + 5] })
                .setLngLat([d.lng, d.lat])
                .addTo(map);
            }
          })
          .catch(() => {
            // Fallback: use hardcoded positions
            const features: GeoJSON.Feature[] = districts.map(d => ({
              type: "Feature",
              geometry: { type: "Point", coordinates: [d.lng, d.lat] } as GeoJSON.Point,
              properties: { id: d.id, name: d.name, carbon: d.carbon, areaRai: d.areaRai },
            }));

            map.addSource("districts", {
              type: "geojson",
              data: { type: "FeatureCollection", features },
            });

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            map.addLayer({
              id: "districts-glow",
              type: "circle",
              source: "districts",
              paint: {
                "circle-radius": ["interpolate", ["linear"], ["get", "carbon"], CARBON_MIN, 26, CARBON_MAX, 50],
                "circle-color": ["interpolate", ["linear"], ["get", "carbon"], CARBON_MIN, "#4ade80", 75000, "#16a34a", CARBON_MAX, "#14532d"],
                "circle-opacity": 0.2,
                "circle-blur": 1.4,
              },
            } as any); // eslint-disable-line

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            map.addLayer({
              id: "districts-circle",
              type: "circle",
              source: "districts",
              paint: {
                "circle-radius": ["interpolate", ["linear"], ["get", "carbon"],
                  CARBON_MIN, 13,
                  50000, 18,
                  80000, 24,
                  CARBON_MAX, 30,
                ],
                "circle-color": ["interpolate", ["linear"], ["get", "carbon"],
                  CARBON_MIN, "#4ade80",
                  40000, "#34d399",
                  60000, "#22c55e",
                  90000, "#16a34a",
                  CARBON_MAX, "#14532d",
                ],
                "circle-opacity": 0.92,
                "circle-stroke-width": 2.5,
                "circle-stroke-color": "#ffffff",
                "circle-stroke-opacity": 0.95,
              },
            } as any); // eslint-disable-line

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            map.addLayer({
              id: "districts-selected",
              type: "circle",
              source: "districts",
              filter: ["==", ["get", "id"], ""],
              paint: {
                "circle-radius": ["interpolate", ["linear"], ["get", "carbon"],
                  CARBON_MIN, 20, CARBON_MAX, 38,
                ],
                "circle-color": "rgba(0,0,0,0)",
                "circle-stroke-width": 3.5,
                "circle-stroke-color": "#fbbf24",
                "circle-stroke-opacity": 0.95,
              },
            } as any); // eslint-disable-line

            map.on("click", "districts-circle", (e) => {
              const props = e.features?.[0]?.properties as { id?: string } | undefined;
              if (props?.id) onSelectRef.current?.(props.id);
            });
            map.on("mouseenter", "districts-circle", () => { map.getCanvas().style.cursor = "pointer"; });
            map.on("mouseleave", "districts-circle", () => { map.getCanvas().style.cursor = ""; });

            for (const d of districts) {
              const radius = Math.round(13 + 17 * (d.carbon - CARBON_MIN) / (CARBON_MAX - CARBON_MIN));
              const el = document.createElement("div");
              el.style.cssText = "text-align:center;pointer-events:none;";
              el.innerHTML = `
                <div style="font-size:11px;font-weight:800;color:#fff;text-shadow:0 1px 4px rgba(0,0,0,0.95),0 0 10px rgba(0,0,0,0.6);white-space:nowrap;line-height:1.4">${d.name}</div>
                <div style="font-size:9.5px;font-weight:700;color:#86efac;text-shadow:0 1px 3px rgba(0,0,0,0.95);white-space:nowrap">${(d.carbon / 1000).toFixed(0)}k tCO₂eq</div>
              `;
              new maplibregl.Marker({ element: el, anchor: "top", offset: [0, radius + 5] })
                .setLngLat([d.lng, d.lat])
                .addTo(map);
            }
          });
      }

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

  // ── Update selected district ring + boundary when selection changes ──────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (map.getLayer("districts-selected")) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        map.setFilter("districts-selected", ["==", ["get", "id"], selectedDistrictId ?? ""] as any);
      }
      if (map.getLayer("district-boundary-selected")) {
        const pcode = selectedDistrictId ? DISTRICT_PCODES[selectedDistrictId] ?? "" : "";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        map.setFilter("district-boundary-selected", ["==", ["get", "ADM2_PCODE"], pcode] as any);
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
          background: "rgba(10,18,35,0.9)", backdropFilter: "blur(12px)",
          borderRadius: 13, padding: "12px 16px",
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 6px 24px rgba(0,0,0,0.4)",
          fontFamily: "'Noto Sans Thai','Inter',sans-serif", minWidth: 168,
        }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "#6ee7b7", marginBottom: 8, letterSpacing: 0.6 }}>
            ระดับคาร์บอนต่อแปลง (tCO₂eq)
          </div>
          {([
            { color: "#d1fae5", label: "ต่ำมาก",  range: "< 30" },
            { color: "#6ee7b7", label: "ต่ำ",      range: "30–80" },
            { color: "#34d399", label: "ปานกลาง", range: "80–150" },
            { color: "#10b981", label: "สูง",      range: "150–280" },
            { color: "#059669", label: "สูงมาก",  range: "> 280" },
          ] as const).map(s => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
              <div style={{ width: 12, height: 12, borderRadius: 3, flexShrink: 0, background: s.color, border: "1px solid rgba(255,255,255,0.15)" }} />
              <span style={{ fontSize: 10, color: "#94a3b8", flex: 1 }}>{s.label}</span>
              <span style={{ fontSize: 9, color: "#475569", fontWeight: 600 }}>{s.range}</span>
            </div>
          ))}
          <div style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "8px 0" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div style={{ width: 12, height: 12, borderRadius: "50%", flexShrink: 0, background: "linear-gradient(135deg,#4ade80,#14532d)", border: "1.5px solid rgba(255,255,255,0.6)" }} />
              <span style={{ fontSize: 10, color: "#94a3b8" }}>สรุปรายอำเภอ</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div style={{ width: 12, height: 12, borderRadius: "50%", flexShrink: 0, background: "transparent", border: "2px solid #fbbf24" }} />
              <span style={{ fontSize: 10, color: "#94a3b8" }}>อำเภอที่เลือก</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div style={{ width: 12, height: 2, flexShrink: 0, background: "#fff", opacity: 0.5 }} />
              <span style={{ fontSize: 10, color: "#94a3b8" }}>ขอบเขตอำเภอ</span>
            </div>
          </div>
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
          {legendOpen && (
            <div style={{
              background: "rgba(15,23,42,0.92)", backdropFilter: "blur(12px)",
              borderRadius: 14, padding: "12px 14px",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 8px 24px -4px rgba(0,0,0,0.5)",
              minWidth: 180,
              animation: "fadeIn 0.2s ease-out",
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#a7f3d0", marginBottom: 8, letterSpacing: 0.3 }}>
                คาร์บอนต่อแปลง (tCO₂eq)
              </div>

              <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", marginBottom: 5 }}>
                <div style={{ flex: 1, background: "#d1fae5" }} />
                <div style={{ flex: 1, background: "#6ee7b7" }} />
                <div style={{ flex: 1, background: "#34d399" }} />
                <div style={{ flex: 1, background: "#10b981" }} />
                <div style={{ flex: 1, background: "#059669" }} />
              </div>
              
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8.5, color: "#94a3b8", fontWeight: 600, marginBottom: 10 }}>
                <span>&lt;30</span>
                <span>150</span>
                <span>&gt;280</span>
              </div>

              <div style={{ height: 1, background: "rgba(255,255,255,0.08)", marginBottom: 10 }} />

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: "linear-gradient(135deg,#4ade80,#14532d)", border: "1px solid rgba(255,255,255,0.7)", flexShrink: 0 }} />
                  <span style={{ fontSize: 9.5, color: "#cbd5e1" }}>สรุปอำเภอ</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: "transparent", border: "1.5px solid #fbbf24", flexShrink: 0 }} />
                  <span style={{ fontSize: 9.5, color: "#cbd5e1" }}>เลือกอยู่</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 12, height: 2, flexShrink: 0, background: "#fff", opacity: 0.5 }} />
                  <span style={{ fontSize: 9.5, color: "#cbd5e1" }}>ขอบเขตอำเภอ</span>
                </div>
              </div>
            </div>
          )}

          <button
            onClick={() => setLegendOpen(o => !o)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: legendOpen ? "rgba(15,23,42,0.95)" : "rgba(15,23,42,0.85)", 
              backdropFilter: "blur(8px)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 20, padding: "6px 14px",
              color: "#a7f3d0", fontSize: 11, fontWeight: 600,
              cursor: "pointer", boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
              fontFamily: "inherit", transition: "all 0.2s",
            }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: "linear-gradient(135deg,#34d399,#059669)", flexShrink: 0 }} />
            สัญลักษณ์
            <span style={{ fontSize: 9, opacity: 0.6, marginLeft: 2, transform: legendOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▼</span>
          </button>
        </div>
      )}
    </div>
  );
}
