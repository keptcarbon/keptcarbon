"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { type Map as MLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MAP_VIEW_ANIMATION_DURATION } from "@/lib/map-utils";

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

// District bubbles are scaled to the carbon range of the districts on screen
// (there is no fixed carbon scale): the lowest district gets BUBBLE_R_MIN and
// the lightest colour, the highest gets BUBBLE_R_MAX and the darkest.
const BUBBLE_R_MIN = 12;
const BUBBLE_R_MAX = 30;
const BUBBLE_COLOR_STOPS: [number, string][] = [
  [0, "#4ade80"], [0.25, "#22c55e"], [0.5, "#16a34a"], [0.75, "#15803d"], [1, "#14532d"],
];

type CarbonRange = { min: number; max: number };

function carbonRange(districts: { carbon: number }[]): CarbonRange {
  const v = districts.map(d => d.carbon);
  return { min: Math.min(...v), max: Math.max(...v) };
}

/** Position of `carbon` within the range, 0–1 (0.5 when every district is equal). */
function carbonT(carbon: number, { min, max }: CarbonRange) {
  return max > min ? (carbon - min) / (max - min) : 0.5;
}

/** Bubble area (not radius) grows linearly with carbon, so big values don't look exaggerated. */
function bubbleRadius(t: number) {
  return Math.sqrt(BUBBLE_R_MIN ** 2 + t * (BUBBLE_R_MAX ** 2 - BUBBLE_R_MIN ** 2));
}


/** Short bubble label: 3.41M / 812k / 950. */
const compactCarbon = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${Math.round(n)}`;

/** Boundary features are matched to districts by Thai name (geo_district.name_th). */
const districtFilter = (name: string) => ["==", ["get", "amphoe_t"], name];

/** Bounds of any nesting of [lng, lat] positions (points, rings, polygons…); null if empty. */
function coordBounds(coords: unknown[]): maplibregl.LngLatBounds | null {
  const b = new maplibregl.LngLatBounds();
  let found = false;
  const walk = (c: unknown) => {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === "number") { b.extend(c as [number, number]); found = true; }
    else c.forEach(walk);
  };
  walk(coords);
  return found ? b : null;
}

export default function DashboardMap({
  plots,
  provinceName,
  flyToCenter,
  flyZoom = 11,
  districts = [],
  selectedDistrictId,
  onSelectDistrict,
}: {
  plots: MapPlot[];
  /** Thai province name (geo_district.province_th) whose districts the view is locked to. */
  provinceName?: string;
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
  const selectedRef = useRef(selectedDistrictId);
  selectedRef.current = selectedDistrictId;
  const districtsRef = useRef(districts);
  districtsRef.current = districts;
  const selectedName = () => districtsRef.current.find(d => d.id === selectedRef.current)?.name ?? "";
  const [isMobile, setIsMobile] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    setLegendOpen(window.innerWidth >= 640); // open on desktop, collapsed on mobile
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
            attribution: "Map data © Google",
            maxzoom: 18,
          },
        },
        layers: [{ id: "satellite", type: "raster", source: "satellite" }],
      },
      center: [101.2587, 12.6819],
      zoom: 8,
      attributionControl: { compact: true },
      // View is locked to the province (see lockToBounds); clicks still work.
      dragPan: false,
      scrollZoom: false,
      boxZoom: false,
      doubleClickZoom: false,
      dragRotate: false,
      keyboard: false,
      touchZoomRotate: false,
      touchPitch: false,
    });
    mapRef.current = map;

    // Fit the whole province edge to edge, and refit whenever the map resizes.
    const lockToBounds = (b: maplibregl.LngLatBounds | null) => {
      if (!b) return;
      const fit = () => map.fitBounds(b, { padding: 24, duration: 0 });
      fit();
      map.on("resize", fit);
    };

    map.on("load", () => {
      // ── District boundary (bottom-most layer) ─────────────────────────
      map.addSource("district-boundary", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
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
        // Same cyan as the district boundary in map-draw (useMapInit.ts).
        paint: {
          "line-color": "#06b6d4",
          "line-width": ["interpolate", ["linear"], ["zoom"], 6, 1, 10, 1.8, 14, 3.5],
          "line-opacity": 0.95,
        },
      });
      map.addLayer({
        id: "district-boundary-selected",
        type: "line",
        source: "district-boundary",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        filter: districtFilter(selectedName()) as any,
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

      // ── District bubbles ──────────────────────────────────────────────
      const addDistrictLayers = (points: DistrictMarker[]) => {
        const range = carbonRange(points);
        const features: GeoJSON.Feature[] = points.map(d => {
          const t = carbonT(d.carbon, range);
          return {
            type: "Feature",
            geometry: { type: "Point", coordinates: [d.lng, d.lat] } as GeoJSON.Point,
            properties: { id: d.id, name: d.name, carbon: d.carbon, areaRai: d.areaRai, t, r: bubbleRadius(t) },
          };
        });
        const color = ["interpolate", ["linear"], ["get", "t"], ...BUBBLE_COLOR_STOPS.flat()];

        map.addSource("districts", { type: "geojson", data: { type: "FeatureCollection", features } });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        map.addLayer({
          id: "districts-glow",
          type: "circle",
          source: "districts",
          paint: {
            "circle-radius": ["*", ["get", "r"], 1.7],
            "circle-color": color,
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
            "circle-radius": ["get", "r"],
            "circle-color": color,
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
          filter: ["==", ["get", "id"], selectedRef.current ?? ""],
          paint: {
            "circle-radius": ["+", ["get", "r"], 7],
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

        for (const d of points) {
          const radius = Math.round(bubbleRadius(carbonT(d.carbon, range)));
          const el = document.createElement("div");
          el.style.cssText = "text-align:center;pointer-events:none;";
          el.innerHTML = `
            <div style="font-size:11px;font-weight:800;color:#fff;text-shadow:0 1px 4px rgba(0,0,0,0.95),0 0 10px rgba(0,0,0,0.6);white-space:nowrap;line-height:1.4">${d.name}</div>
            <div style="font-size:9.5px;font-weight:700;color:#86efac;text-shadow:0 1px 3px rgba(0,0,0,0.95);white-space:nowrap">${compactCarbon(d.carbon)} tCO₂eq</div>
          `;
          new maplibregl.Marker({ element: el, anchor: "top", offset: [0, radius + 5] })
            .setLngLat([d.lng, d.lat])
            .addTo(map);
        }
      };

      // One fetch feeds the boundary layer, the locked extent, and the bubble
      // positions (district centres). If it fails, fit to the hardcoded
      // district positions instead.
      fetch("/api/geojson/districts")
        .then(r => r.json())
        .then((gj: GeoJSON.FeatureCollection) => {
          const inProvince = gj.features.filter(f => f.properties?.prov_nam_t === provinceName);
          const features = inProvince.length ? inProvince : gj.features;
          (map.getSource("district-boundary") as maplibregl.GeoJSONSource).setData({ type: "FeatureCollection", features });
          lockToBounds(coordBounds(features.map(f => (f.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon).coordinates)));

          // Bubble at each district's centre (geo_district.cen_lon/cen_lat);
          // districts not found in the boundaries keep their own position.
          const centres = new Map(features.map(f => [f.properties?.amphoe_t as string, f.properties]));
          return districts.map(d => {
            const c = centres.get(d.name);
            return c?.cen_lon != null ? { ...d, lng: Number(c.cen_lon), lat: Number(c.cen_lat) } : d;
          });
        })
        .catch(() => {
          lockToBounds(coordBounds(districts.map(d => [d.lng, d.lat])));
          return districts;
        })
        .then(points => { if (points.length) addDistrictLayers(points); });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [plots, districts, provinceName]); // eslint-disable-line react-hooks/exhaustive-deps

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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        map.setFilter("district-boundary-selected", districtFilter(selectedName()) as any);
      }
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [selectedDistrictId, districts]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fly to selected district ──────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !flyToCenter) return;
    mapRef.current.flyTo({ center: flyToCenter, zoom: flyZoom, duration: MAP_VIEW_ANIMATION_DURATION, essential: true });
  }, [flyToCenter, flyZoom]);

  return (
    <div style={{ position: "relative", height: "100%" }}>
      <div ref={containerRef} style={{ height: "100%" }} />

      {/* ── Legend (collapsible; the view is locked, so it can be tucked away
             to reach bubbles underneath) ──────────────────────────────────── */}
      {mounted && (
        <div style={{
          position: "absolute", bottom: 12, left: 12,
          fontFamily: "'Noto Sans Thai','Inter',sans-serif",
          display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8,
          zIndex: 10,
        }}>
          {legendOpen && (
            <div style={{
              background: "rgba(15,23,42,0.92)", backdropFilter: "blur(12px)",
              borderRadius: isMobile ? 14 : 13, padding: isMobile ? "12px 14px" : "12px 16px",
              border: "1px solid rgba(255,255,255,0.1)",
              boxShadow: "0 8px 24px -4px rgba(0,0,0,0.5)",
              minWidth: isMobile ? 160 : 180,
              animation: "fadeIn 0.2s ease-out",
            }}>
              <div style={{ fontSize: isMobile ? 10 : 12, fontWeight: 800, color: "#6ee7b7", letterSpacing: 0.4 }}>
                คาร์บอนสะสมรายอำเภอ (tCO₂eq)
              </div>
              <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "8px 0" }} />
              <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 6 : 5 }}>
                {[
                  { label: "สรุปรายอำเภอ", swatch: { width: 12, height: 12, borderRadius: "50%", background: "linear-gradient(135deg,#4ade80,#14532d)", border: "1.5px solid rgba(255,255,255,0.6)" } },
                  { label: "อำเภอที่เลือก", swatch: { width: 12, height: 12, borderRadius: "50%", background: "transparent", border: "2px solid #fbbf24" } },
                  { label: "ขอบเขตอำเภอ", swatch: { width: 12, height: 2, background: "#06b6d4", opacity: 0.8 } },
                ].map(({ label, swatch }) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <div style={{ flexShrink: 0, ...swatch }} />
                    <span style={{ fontSize: isMobile ? 10 : 12, color: "#cbd5e1" }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => setLegendOpen(o => !o)}
            aria-expanded={legendOpen}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: legendOpen ? "rgba(15,23,42,0.95)" : "rgba(15,23,42,0.85)",
              backdropFilter: "blur(8px)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 20, padding: isMobile ? "6px 14px" : "7px 16px",
              color: "#a7f3d0", fontSize: isMobile ? 11 : 12, fontWeight: 600,
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

