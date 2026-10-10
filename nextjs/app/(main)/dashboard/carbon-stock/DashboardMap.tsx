"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { type Map as MLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MAP_VIEW_ANIMATION_DURATION } from "@/lib/map-utils";

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

const NO_DISTRICTS: DistrictMarker[] = [];

/** District polygons per province, fetched once per page session. */
const boundaryCache = new Map<string, Promise<GeoJSON.Feature[]>>();
function loadDistrictBoundaries(province: string): Promise<GeoJSON.Feature[]> {
  let p = boundaryCache.get(province);
  if (!p) {
    p = fetch(`/api/geojson/districts?province=${encodeURIComponent(province)}&shape=polygon`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((gj: GeoJSON.FeatureCollection) => gj.features ?? []);
    p.catch(() => boundaryCache.delete(province)); // retry on the next visit
    boundaryCache.set(province, p);
  }
  return p;
}

/**
 * The map is created once; province and district changes only swap its
 * sources and move the view. The first province fit is instant (behind a
 * loading veil); later province switches animate to the new extent.
 */
export default function DashboardMap({
  provinceName,
  flyToCenter,
  flyZoom = 11,
  districts = NO_DISTRICTS,
  selectedDistrictId,
  onSelectDistrict,
}: {
  /** Thai province name (geo_district.province_th) whose districts the view is locked to; undefined while unknown. */
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
  // Province extent the view is locked to (refit on resize).
  const boundsRef = useRef<maplibregl.LngLatBounds | null>(null);
  const hasFitRef = useRef(false);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [fitted, setFitted] = useState(false);
  const [boundary, setBoundary] = useState<GeoJSON.Feature[] | null>(null);
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

  // ── Create the map and its (empty) layers once ───────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

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
      center: [100.5, 13.0],
      zoom: 5,
      attributionControl: { compact: true },
      // View is locked to the province (see boundsRef); clicks still work.
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

    map.on("resize", () => {
      if (boundsRef.current) map.fitBounds(boundsRef.current, { padding: 24, duration: 0 });
    });

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
        filter: districtFilter("") as any,
        paint: {
          "line-color": "#fbbf24",
          "line-width": 3.5,
          "line-opacity": 0.9,
        },
      });

      // ── District bubbles ──────────────────────────────────────────────
      const color = ["interpolate", ["linear"], ["get", "t"], ...BUBBLE_COLOR_STOPS.flat()];
      map.addSource("districts", { type: "geojson", data: { type: "FeatureCollection", features: [] } });

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
        filter: ["==", ["get", "id"], ""],
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

      setMapReady(true);
    });

    return () => {
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
      boundsRef.current = null;
      hasFitRef.current = false;
      setMapReady(false);
      setFitted(false);
    };
  }, []);

  /** Locks the view to `b`: instant the first time, animated afterwards. */
  const fitTo = (map: MLMap, b: maplibregl.LngLatBounds) => {
    boundsRef.current = b;
    map.fitBounds(b, { padding: 24, duration: hasFitRef.current ? MAP_VIEW_ANIMATION_DURATION : 0 });
    hasFitRef.current = true;
    setFitted(true);
  };

  // ── Province boundary: fetch (cached) when the province changes ──────────
  useEffect(() => {
    if (!provinceName) return;
    let cancelled = false;
    loadDistrictBoundaries(provinceName)
      .then(features => { if (!cancelled) setBoundary(features); })
      .catch(() => { if (!cancelled) setBoundary([]); });
    return () => { cancelled = true; };
  }, [provinceName]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !boundary) return;
    (map.getSource("district-boundary") as maplibregl.GeoJSONSource).setData({ type: "FeatureCollection", features: boundary });
    const b = coordBounds(boundary.map(f => (f.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon).coordinates));
    if (b) fitTo(map, b);
    else boundsRef.current = null; // no boundary: the bubbles set the extent instead
  }, [boundary, mapReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── District bubbles + labels ─────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const range = carbonRange(districts);
    const features: GeoJSON.Feature[] = districts.map(d => {
      const t = carbonT(d.carbon, range);
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [d.lng, d.lat] } as GeoJSON.Point,
        properties: { id: d.id, name: d.name, carbon: d.carbon, areaRai: d.areaRai, t, r: bubbleRadius(t) },
      };
    });
    (map.getSource("districts") as maplibregl.GeoJSONSource).setData({ type: "FeatureCollection", features });

    markersRef.current.forEach(m => m.remove());
    markersRef.current = districts.map(d => {
      const radius = Math.round(bubbleRadius(carbonT(d.carbon, range)));
      const el = document.createElement("div");
      el.style.cssText = "text-align:center;pointer-events:none;";
      el.innerHTML = `
        <div style="font-size:11px;font-weight:800;color:#fff;text-shadow:0 1px 4px rgba(0,0,0,0.95),0 0 10px rgba(0,0,0,0.6);white-space:nowrap;line-height:1.4">${d.name}</div>
        <div style="font-size:9.5px;font-weight:700;color:#86efac;text-shadow:0 1px 3px rgba(0,0,0,0.95);white-space:nowrap">${compactCarbon(d.carbon)} tCO₂eq</div>
      `;
      return new maplibregl.Marker({ element: el, anchor: "top", offset: [0, radius + 5] })
        .setLngLat([d.lng, d.lat])
        .addTo(map);
    });

    // Boundary unavailable: lock to the district centres instead.
    if (!boundsRef.current && districts.length && boundary?.length === 0) {
      const b = coordBounds(districts.map(d => [d.lng, d.lat]));
      if (b) fitTo(map, b);
    }
  }, [districts, mapReady, boundary]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Selected district ring + boundary ─────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const name = districts.find(d => d.id === selectedDistrictId)?.name ?? "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map.setFilter("districts-selected", ["==", ["get", "id"], selectedDistrictId ?? ""] as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map.setFilter("district-boundary-selected", districtFilter(name) as any);
  }, [selectedDistrictId, districts, mapReady]);

  // ── Fly to selected district ──────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !flyToCenter) return;
    mapRef.current.flyTo({ center: flyToCenter, zoom: flyZoom, duration: MAP_VIEW_ANIMATION_DURATION, essential: true });
  }, [flyToCenter, flyZoom]);

  return (
    <div style={{ position: "relative", height: "100%" }}>
      <div ref={containerRef} style={{ height: "100%" }} />

      {/* Veil until the first province fit, so the default view never shows. */}
      <div aria-hidden={fitted} style={{
        position: "absolute", inset: 0, zIndex: 5,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "#0f172a", color: "#a7f3d0", fontSize: 14, fontWeight: 600,
        fontFamily: "'Noto Sans Thai','Inter',sans-serif",
        opacity: fitted ? 0 : 1, pointerEvents: fitted ? "none" : "auto",
        transition: "opacity 0.35s ease-out",
      }}>
        กำลังโหลดแผนที่...
      </div>

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

