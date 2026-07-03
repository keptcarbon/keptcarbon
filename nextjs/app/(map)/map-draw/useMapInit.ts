"use client";

import { useEffect, type MutableRefObject, type RefObject } from "react";
import maplibregl, { type Map as MLMap } from "maplibre-gl";

/**
 * Creates the MapLibre map instance once on mount: base style (hybrid/sat/street/topo
 * raster sources), all boundary/drawing/parcel sources+layers, and the click/hover
 * handlers for the matched-parcels-fill layer. Mirrors the original inline effect
 * verbatim — only the closed-over values were threaded through as parameters.
 */
export function useMapInit({
  mapContainerRef,
  mapRef,
  mapLoadedRef,
  setMapLoaded,
  boundaryAnimRef,
  drawingRef,
  setSelectedPlotIndex,
}: {
  mapContainerRef: RefObject<HTMLDivElement | null>;
  mapRef: MutableRefObject<MLMap | null>;
  mapLoadedRef: MutableRefObject<boolean>;
  setMapLoaded: (v: boolean) => void;
  boundaryAnimRef: MutableRefObject<number>;
  drawingRef: MutableRefObject<boolean>;
  setSelectedPlotIndex: (v: number | "total") => void;
}) {
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      pixelRatio: Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2),
      style: {
        version: 8,
        glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
        sources: {
          hybrid: {
            type: "raster",
            tiles: ["https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"],
            tileSize: 256,
            minzoom: 1,
            maxzoom: 20,
            attribution: "© Google",
          },
          sat: {
            type: "raster",
            tiles: ["https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"],
            tileSize: 256,
            minzoom: 1,
            maxzoom: 20,
            attribution: "© Google",
          },
          street: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            minzoom: 1,
            maxzoom: 19,
            attribution: "",
          },
          topo: {
            type: "raster",
            tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"],
            tileSize: 256,
            minzoom: 1,
            maxzoom: 19,
            attribution: "",
          },
        },
        layers: [
          { id: "background", type: "background", paint: { "background-color": "#ffffff" } },
          { id: "hybrid", type: "raster", source: "hybrid", layout: { visibility: "visible" } },
          { id: "sat", type: "raster", source: "sat", layout: { visibility: "none" } },
          { id: "street", type: "raster", source: "street", layout: { visibility: "none" } },
          { id: "topo", type: "raster", source: "topo", layout: { visibility: "none" } },
        ],
      },
      center: [101.258, 13.0],
      zoom: typeof window !== "undefined" ? (window.innerWidth < 768 ? 1.5 : 2.2) : 2.2,
      minZoom: 0.5,
      maxZoom: 19,
      pitch: 0,
      bearing: 0,
      maxPitch: 0,
      pitchWithRotate: false,
      dragRotate: false,
      touchPitch: false,
      attributionControl: false,
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ showCompass: false, showZoom: true }), "bottom-right");
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      "bottom-right",
    );
    // เพิ่มปุ่มเข็มทิศแยกต่างหาก เพื่อให้อยู่ด้านบนสุด (ลำดับการแอดหลังสุดสำหรับ bottom-right จะอยู่บนสุด)
    map.addControl(new maplibregl.NavigationControl({ showCompass: true, showZoom: false }), "bottom-right");

    map.on("load", () => {
      map.setProjection({ type: "globe" });
      mapLoadedRef.current = true;
      setMapLoaded(true);


      // ── Thailand Country Boundary (shown on load, before any selection) ───
      map.addSource("th-boundary", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "th-boundary-fill",
        type: "fill",
        source: "th-boundary",
        paint: { "fill-color": "#22c55e", "fill-opacity": 0.04 },
      });
      map.addLayer({
        id: "th-boundary-glow",
        type: "line",
        source: "th-boundary",
        paint: {
          "line-color": "#22c55e",
          "line-width": ["interpolate", ["linear"], ["zoom"], 4, 4, 8, 8, 12, 14],
          "line-opacity": ["interpolate", ["linear"], ["zoom"], 4, 0.15, 12, 0.28],
          "line-blur": ["interpolate", ["linear"], ["zoom"], 4, 3, 12, 7],
        },
      });
      map.addLayer({
        id: "th-boundary-line",
        type: "line",
        source: "th-boundary",
        paint: {
          "line-color": "#16a34a",
          "line-width": ["interpolate", ["linear"], ["zoom"], 4, 1, 8, 1.8, 12, 2.8],
          "line-opacity": 0.9,
        },
      });

      // ── Region Boundaries (shown when region is selected) ──────────────────
      map.addSource("region-boundary", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "region-boundary-fill",
        type: "fill",
        source: "region-boundary",
        paint: { "fill-color": "#f59e0b", "fill-opacity": 0.06 },
      });
      map.addLayer({
        id: "region-boundary-glow",
        type: "line",
        source: "region-boundary",
        paint: {
          "line-color": "#f59e0b",
          "line-width": ["interpolate", ["linear"], ["zoom"], 5, 4, 9, 8, 13, 14],
          "line-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0.12, 13, 0.22],
          "line-blur": ["interpolate", ["linear"], ["zoom"], 5, 2, 13, 7],
        },
      });
      map.addLayer({
        id: "region-boundary-line",
        type: "line",
        source: "region-boundary",
        paint: {
          "line-color": "#d97706",
          "line-width": ["interpolate", ["linear"], ["zoom"], 5, 1, 9, 1.8, 13, 3.5],
          "line-opacity": 0.95,
        },
      });

      // Fetch Thailand boundary on initial load
      fetch('/api/geojson/th-boundary')
        .then(r => r.json())
        .then(fc => {
          const src = map.getSource("th-boundary") as maplibregl.GeoJSONSource | undefined;
          if (src) src.setData(fc);
        })
        .catch(console.error);

      // ── Province Boundaries ───────────────────────────────────────────────
      map.addSource("province-boundary", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      // Glow — expands as you zoom in
      map.addLayer({
        id: "province-boundary-glow",
        type: "line",
        source: "province-boundary",
        paint: {
          "line-color": "#ec4899", // pink-500
          "line-width": ["interpolate", ["linear"], ["zoom"], 6, 4, 10, 8, 14, 14],
          "line-opacity": ["interpolate", ["linear"], ["zoom"], 6, 0.12, 14, 0.22],
          "line-blur": ["interpolate", ["linear"], ["zoom"], 6, 2, 14, 7],
        },
      });
      // Main solid line — thickens on zoom
      map.addLayer({
        id: "province-boundary-line",
        type: "line",
        source: "province-boundary",
        paint: {
          "line-color": "#db2777", // pink-600
          "line-width": ["interpolate", ["linear"], ["zoom"], 6, 1, 10, 1.8, 14, 3.5],
          "line-opacity": 0.95,
        },
      });

      // ── District Boundaries ───────────────────────────────────────────────
      map.addSource("district-boundary", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "district-boundary-glow",
        type: "line",
        source: "district-boundary",
        paint: {
          "line-color": "#06b6d4",
          "line-width": ["interpolate", ["linear"], ["zoom"], 6, 4, 10, 8, 14, 14],
          "line-opacity": ["interpolate", ["linear"], ["zoom"], 6, 0.12, 14, 0.22],
          "line-blur": ["interpolate", ["linear"], ["zoom"], 6, 2, 14, 7],
        },
      });
      map.addLayer({
        id: "district-boundary-line",
        type: "line",
        source: "district-boundary",
        paint: {
          "line-color": "#06b6d4",
          "line-width": ["interpolate", ["linear"], ["zoom"], 6, 1, 10, 1.8, 14, 3.5],
          "line-opacity": 0.95,
        },
      });

      // ── Tambon Boundaries ─────────────────────────────────────────────────
      map.addSource("tambon-boundary", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "tambon-boundary-glow",
        type: "line",
        source: "tambon-boundary",
        paint: {
          "line-color": "#a855f7",
          "line-width": ["interpolate", ["linear"], ["zoom"], 6, 4, 10, 8, 14, 14],
          "line-opacity": ["interpolate", ["linear"], ["zoom"], 6, 0.12, 14, 0.22],
          "line-blur": ["interpolate", ["linear"], ["zoom"], 6, 2, 14, 7],
        },
      });
      map.addLayer({
        id: "tambon-boundary-line",
        type: "line",
        source: "tambon-boundary",
        paint: {
          "line-color": "#a855f7",
          "line-width": ["interpolate", ["linear"], ["zoom"], 6, 1, 10, 1.8, 14, 3.5],
          "line-opacity": 0.95,
        },
      });
      // ─────────────────────────────────────────────────────────────────────

      map.addSource("draw-line", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "draw-line-l",
        type: "line",
        source: "draw-line",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#3b82f6", "line-width": 2, "line-dasharray": [3, 2] },
      });
      map.addSource("draw-fill", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "draw-fill-l",
        type: "fill",
        source: "draw-fill",
        paint: { "fill-color": "#3b82f6", "fill-opacity": 0.05 },
      });
      map.addSource("draw-verts", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "draw-verts-l",
        type: "circle",
        source: "draw-verts",
        paint: {
          "circle-color": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
            [
              "case",
              ["==", ["get", "isMid"], true], "#3b82f6",
              "#2563eb"
            ],
            [
              "case",
              ["==", ["get", "isMid"], true], "rgba(255, 255, 255, 0.75)",
              "#3b82f6"
            ]
          ],
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            4,
            [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              ["case", ["==", ["get", "isMid"], true], 3.5, 4.5],
              ["case", ["==", ["get", "isMid"], true], 2, 3]
            ],
            14,
            [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              ["case", ["==", ["get", "isMid"], true], 6, 7.5],
              ["case", ["==", ["get", "isMid"], true], 4, 5.5]
            ]
          ],
          "circle-stroke-color": [
            "case",
            ["boolean", ["feature-state", "hover"], false], "#ffffff",
            [
              "case",
              ["==", ["get", "isMid"], true], "#3b82f6",
              "rgba(255,255,255,0.95)"
            ]
          ],
          "circle-stroke-width": [
            "case",
            ["boolean", ["feature-state", "hover"], false], 1.5,
            [
              "case",
              ["==", ["get", "isMid"], true], 1,
              1.5
            ]
          ],
          "circle-opacity": [
            "case",
            ["boolean", ["feature-state", "hover"], false], 1.0,
            [
              "case",
              ["==", ["get", "isMid"], true], 0.5,
              1.0
            ]
          ],
          "circle-stroke-opacity": [
            "case",
            ["boolean", ["feature-state", "hover"], false], 1.0,
            [
              "case",
              ["==", ["get", "isMid"], true], 0.6,
              1.0
            ]
          ]
        },
      });
      map.addSource("plot", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "plot-fill",
        type: "fill",
        source: "plot",
        paint: { "fill-color": "#3b82f6", "fill-opacity": 0.05 },
      });
      map.addLayer({
        id: "plot-line",
        type: "line",
        source: "plot",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#3b82f6", "line-width": ["interpolate", ["linear"], ["zoom"], 4, 1, 14, 2] },
      });



      map.addSource("matched-parcels", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "matched-parcels-fill",
        type: "fill",
        source: "matched-parcels",
        paint: {
          "fill-color": [
            "case",
            ["==", ["to-string", ["coalesce", ["get", "lu_class"], ""]], "A302"], "#84cc16",
            "rgba(0,0,0,0)"
          ],
          "fill-opacity": 0
        },
      });
      map.addLayer({
        id: "matched-parcels-line",
        type: "line",
        source: "matched-parcels",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": [
            "case",
            ["==", ["to-string", ["coalesce", ["get", "lu_class"], ""]], "A302"], "#84cc16",
            "#64748b"
          ],
          "line-width": 2.2,
          "line-opacity": 1
        },
      });
      map.addLayer({
        id: "matched-parcels-label",
        type: "symbol",
        source: "matched-parcels",
        layout: {
          "text-field": ["coalesce", ["get", "lu_class"], ["get", "plot_index"]],
          "text-size": 13,
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "#0f172a",
          "text-halo-width": 2,
        },
      });

      // Reference layer: existing project plots shown when adding a new plot
      map.addSource("ref-project-plots", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "ref-project-plots-fill",
        type: "fill",
        source: "ref-project-plots",
        paint: { "fill-color": "#64748b", "fill-opacity": 0.05 },
      });
      map.addLayer({
        id: "ref-project-plots-line",
        type: "line",
        source: "ref-project-plots",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#334155", "line-width": 1.5 },
      });

      map.addSource("plot-verts", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "plot-verts-l",
        type: "circle",
        source: "plot-verts",
        paint: {
          "circle-color": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
            [
              "case",
              ["==", ["get", "isMid"], true], "#3b82f6",
              "#2563eb"
            ],
            [
              "case",
              ["==", ["get", "isMid"], true], "rgba(255, 255, 255, 0.75)",
              "#ffffff"
            ]
          ],
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            4,
            [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              ["case", ["==", ["get", "isMid"], true], 3.5, 4.5],
              ["case", ["==", ["get", "isMid"], true], 2, 3]
            ],
            14,
            [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              ["case", ["==", ["get", "isMid"], true], 6, 7.5],
              ["case", ["==", ["get", "isMid"], true], 4, 5.5]
            ]
          ],
          "circle-stroke-color": [
            "case",
            ["boolean", ["feature-state", "hover"], false], "#ffffff",
            [
              "case",
              ["==", ["get", "isMid"], true], "#3b82f6",
              "#2563eb"
            ]
          ],
          "circle-stroke-width": [
            "case",
            ["boolean", ["feature-state", "hover"], false], 1.5,
            [
              "case",
              ["==", ["get", "isMid"], true], 1,
              2
            ]
          ],
          "circle-opacity": [
            "case",
            ["boolean", ["feature-state", "hover"], false], 1.0,
            [
              "case",
              ["==", ["get", "isMid"], true], 0.5,
              1.0
            ]
          ],
          "circle-stroke-opacity": [
            "case",
            ["boolean", ["feature-state", "hover"], false], 1.0,
            [
              "case",
              ["==", ["get", "isMid"], true], 0.6,
              1.0
            ]
          ]
        },
      });

      // Snap indicator — shown when dragging a vertex near another polygon's vertex
      map.addSource("snap-indicator", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "snap-indicator-glow",
        type: "circle",
        source: "snap-indicator",
        paint: {
          "circle-color": "rgba(245, 158, 11, 0.22)",
          "circle-radius": 20,
          "circle-blur": 0.7,
          "circle-stroke-width": 0,
        },
      });
      map.addLayer({
        id: "snap-indicator-ring",
        type: "circle",
        source: "snap-indicator",
        paint: {
          "circle-color": "rgba(0,0,0,0)",
          "circle-radius": 12,
          "circle-stroke-color": "#f59e0b",
          "circle-stroke-width": 2.5,
          "circle-opacity": 0,
          "circle-stroke-opacity": 1,
        },
      });

      map.on("click", "matched-parcels-fill", (e) => {
        if (drawingRef.current) return;
        if (!e.features?.length) return;
        const p = (e.features[0].properties ?? {}) as Record<string, unknown>;
        if (p.plot_index) {
          const idx = parseInt(String(p.plot_index), 10) - 1;
          setSelectedPlotIndex(idx);
        }
      });
      map.on("mouseenter", "matched-parcels-fill", () => {
        if (!drawingRef.current) map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "matched-parcels-fill", () => {
        if (!drawingRef.current) map.getCanvas().style.cursor = "";
      });
    });

    return () => {
      cancelAnimationFrame(boundaryAnimRef.current);
      map.remove();
      mapRef.current = null;
      mapLoadedRef.current = false;
    };
  }, []);
}