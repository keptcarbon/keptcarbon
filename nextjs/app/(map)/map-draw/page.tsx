"use client";

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import maplibregl, { type Map as MLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import JSZip from "jszip";
import { useAuth } from "@/lib/auth-context";
import {
  emptyFC,
  isMobile,
  polygonAreaM2,
  type LngLat,
  validateAndFixGeoJSON,
  detectUtmFromPrj,
  detectUtmZoneAuto,
  truncateCoords,
} from "@/lib/map-utils";
import { getPlantationInfo } from "@/lib/carbon-api";
import { ParcelResultsPanel } from "@/app/components/organisms";
import { useSearchParams } from "next/navigation";

type Tab = "draw" | "shp";
type NdviStatus = number | null | "loading" | "error";
type BfastStatus = {
  state: "idle" | "loading" | "done" | "error";
  plantingYear?: number | null;
  age?: number | null;
  confidence?: number;
  ndviLatest?: number | null;
};

function MapDrawContent() {
  const { user } = useAuth();

  // Toggle body class for full-screen layout
  useEffect(() => {
    document.body.classList.add("map-draw-active");
    return () => document.body.classList.remove("map-draw-active");
  }, []);

  // Map refs / state
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const mapLoadedRef = useRef(false);
  const searchAbortRef = useRef<AbortController | null>(null);
  
  const searchParams = useSearchParams();

  // Draw state
  const [drawing, setDrawing] = useState(false);
  const drawingRef = useRef(false);
  const vertsRef = useRef<LngLat[]>([]);
  const [vertCount, setVertCount] = useState(0);
  const finalGJRef = useRef<GeoJSON.Feature | null>(null);
  const [drawDone, setDrawDone] = useState(false);
  const [drawPreview, setDrawPreview] = useState("—");

  // Tab + UI
  const [tab, setTab] = useState<Tab>("draw");
  const [basemapOpen, setBasemapOpen] = useState(false);
  const [basemap, setBasemap] = useState<"sat" | "street" | "topo">("sat");
  const [status, setStatus] = useState("🌍 แผนที่ลูกโลก — กด \"เริ่มวาดแปลง\" เพื่อบินไปยังประเทศไทย");
  const [mapLoaded, setMapLoaded] = useState(false);

  // SHP state
  const [shpFile, setShpFile] = useState<File | null>(null);
  const [shpStatus, setShpStatus] = useState<{ msg: string; ok?: boolean } | null>(null);

  // Parcel DB search state (auto-runs ST_Intersects after geometry is set)
  const [hasGeom, setHasGeom] = useState(false);
  const [searchRunning, setSearchRunning] = useState(false);
  const [searchCount, setSearchCount] = useState<number | null>(null);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [searchTruncated, setSearchTruncated] = useState(false);
  const [parcelFeatures, setParcelFeatures] = useState<GeoJSON.Feature[]>([]);
  const [dragOver, setDragOver] = useState(false);

  // Search
  const [searchValue, setSearchValue] = useState("");
  const [searchResults, setSearchResults] = useState<{ display_name: string; lon: string; lat: string }[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  // Toast
  const [toast, setToast] = useState<string | null>(null);

  // Stepper state
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // Panel toggle state
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  // Area Validation State
  const [areaError, setAreaError] = useState<{ rai: number; sqm: number } | null>(null);

  // Drawn boundary geometry (set when search is confirmed)
  const [drawnGeometry, setDrawnGeometry] = useState<GeoJSON.Geometry | null>(null);
  const [selectedPlotIndex, setSelectedPlotIndex] = useState<number | "total">("total");
  const [projectType, setProjectType] = useState<"replanting" | "existing" | null>(null);

  // Multi-parcel support
  const [drawnParcels, setDrawnParcels] = useState<GeoJSON.Feature[]>([]);
  const drawnParcelsRef = useRef<GeoJSON.Feature[]>([]);
  
  useEffect(() => {
    drawnParcelsRef.current = drawnParcels;
    const map = mapRef.current;
    if (map && mapLoadedRef.current) {
      // Sync plot layer (fills and outlines)
      const plotSrc = map.getSource("plot") as maplibregl.GeoJSONSource | undefined;
      if (plotSrc) {
        plotSrc.setData({
          type: "FeatureCollection",
          features: drawnParcels,
        });
      }

      // Sync plot vertices (nodes)
      const vertFeatures: GeoJSON.Feature[] = [];
      drawnParcels.forEach((parcel, pIdx) => {
        if (parcel.geometry.type === "Polygon") {
          const coords = parcel.geometry.coordinates[0];
          coords.slice(0, -1).forEach((c, vIdx) => {
            vertFeatures.push({
              type: "Feature",
              geometry: { type: "Point", coordinates: c as [number, number] },
              properties: { pIdx, vIdx }
            });
          });
        }
      });
      const src = map.getSource("plot-verts") as maplibregl.GeoJSONSource | undefined;
      if (src) {
        src.setData({ type: "FeatureCollection", features: vertFeatures });
      }
    }
  }, [drawnParcels]);

  const totalDrawnArea = useMemo(() => {
    return drawnParcels.reduce((acc, p) => {
      if (p.geometry.type === "Polygon") {
        return acc + polygonAreaM2(p.geometry.coordinates[0] as LngLat[]);
      }
      return acc;
    }, 0);
  }, [drawnParcels]);

  const runPlantationInfoRef = useRef<(projType?: string | null) => void>(() => { });
  const needsPlantationSearchRef = useRef(false);

  // Editable polygon logic
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    let activePIdx = -1;
    let activeVIdx = -1;

    function onVertsTouchStart(e: maplibregl.MapTouchEvent) {
      const map = mapRef.current;
      if (!map || drawingRef.current) return;
      e.preventDefault();
      const features = map.queryRenderedFeatures(e.point, { layers: ['plot-verts-l'] });
      if (!features.length) return;
      activePIdx = features[0].properties.pIdx;
      activeVIdx = features[0].properties.vIdx;
      
      map.dragPan.disable();
      
      map.on('touchmove', onVertsTouchMove);
      map.on('touchend', onVertsTouchEnd);
    }

    function onVertsTouchMove(e: maplibregl.MapTouchEvent) {
      const map = mapRef.current;
      if (!map || activePIdx === -1) return;
      if (!e.lngLats || !e.lngLats.length) return;
      const parcels = [...drawnParcelsRef.current];
      const parcel = parcels[activePIdx];
      if (parcel && parcel.geometry.type === "Polygon") {
        const coords = [...parcel.geometry.coordinates[0]];
        const touch = e.lngLats[0];
        coords[activeVIdx] = [touch.lng, touch.lat];
        if (activeVIdx === 0) {
           coords[coords.length - 1] = [touch.lng, touch.lat];
        }
        parcel.geometry.coordinates[0] = coords;
        
        const srcPlot = map.getSource("plot") as maplibregl.GeoJSONSource | undefined;
        if (srcPlot) {
           srcPlot.setData({ type: "FeatureCollection", features: parcels });
        }
        
        const vertFeatures: GeoJSON.Feature[] = [];
        parcels.forEach((p, pIdx) => {
          if (p.geometry.type === "Polygon") {
            const cArr = p.geometry.coordinates[0];
            cArr.slice(0, -1).forEach((c, vIdx) => {
              vertFeatures.push({
                type: "Feature",
                geometry: { type: "Point", coordinates: c as [number, number] },
                properties: { pIdx, vIdx }
              });
            });
          }
        });
        const srcVerts = map.getSource("plot-verts") as maplibregl.GeoJSONSource | undefined;
        if (srcVerts) {
           srcVerts.setData({ type: "FeatureCollection", features: vertFeatures });
        }
      }
    }

    function onVertsTouchEnd() {
      const map = mapRef.current;
      if (!map || activePIdx === -1) return;
      map.off('touchmove', onVertsTouchMove);
      map.off('touchend', onVertsTouchEnd);
      
      map.dragPan.enable();
      
      const parcels = [...drawnParcelsRef.current];
      const parcel = parcels[activePIdx];
      if (parcel && parcel.geometry.type === "Polygon") {
        parcel.properties = parcel.properties || {};
        parcel.properties.rai = polygonAreaM2(parcel.geometry.coordinates[0] as LngLat[]) / 1600;
      }
      setDrawnParcels(parcels);
      needsPlantationSearchRef.current = true;
      if (runPlantationInfoRef.current) runPlantationInfoRef.current();
      activePIdx = -1;
    }

    const onVertsDown = (e: maplibregl.MapMouseEvent) => {
      if (drawingRef.current) return;

      // Detect Right-Click (button === 2) -> Delete Node
      if (e.originalEvent && e.originalEvent.button === 2) {
        e.preventDefault();
        const features = map.queryRenderedFeatures(e.point, { layers: ['plot-verts-l'] });
        if (!features.length) return;
        const pIdx = features[0].properties.pIdx;
        const vIdx = features[0].properties.vIdx;

        const parcels = [...drawnParcelsRef.current];
        const parcel = parcels[pIdx];
        if (parcel && parcel.geometry.type === "Polygon") {
          const coords = parcel.geometry.coordinates[0];
          if (coords.length <= 4) {
            setToast("แปลงที่ดินต้องมีอย่างน้อย 3 จุด");
            return;
          }

          const activeVerts = coords.slice(0, -1);
          activeVerts.splice(vIdx, 1);
          const newCoords = [...activeVerts, activeVerts[0]];

          parcel.geometry.coordinates[0] = newCoords;
          parcel.properties = parcel.properties || {};
          parcel.properties.rai = polygonAreaM2(newCoords as LngLat[]) / 1600;

          setDrawnParcels(parcels);
          needsPlantationSearchRef.current = true;
          if (runPlantationInfoRef.current) runPlantationInfoRef.current();
        }
        return;
      }

      // Only allow Left-Click (button === 0) for dragging
      if (e.originalEvent && e.originalEvent.button !== 0) return;

      e.preventDefault();
      const features = map.queryRenderedFeatures(e.point, { layers: ['plot-verts-l'] });
      if (!features.length) return;
      activePIdx = features[0].properties.pIdx;
      activeVIdx = features[0].properties.vIdx;
      map.getCanvas().style.cursor = 'grabbing';
      map.on('mousemove', onVertsMove);
      map.on('mouseup', onVertsUp);
    };

    const onVertsMove = (e: maplibregl.MapMouseEvent) => {
      if (activePIdx === -1) return;
      const parcels = [...drawnParcelsRef.current];
      const parcel = parcels[activePIdx];
      if (parcel && parcel.geometry.type === "Polygon") {
        const coords = [...parcel.geometry.coordinates[0]];
        coords[activeVIdx] = [e.lngLat.lng, e.lngLat.lat];
        if (activeVIdx === 0) {
           coords[coords.length - 1] = [e.lngLat.lng, e.lngLat.lat];
        }
        parcel.geometry.coordinates[0] = coords;
        
        const srcPlot = map.getSource("plot") as maplibregl.GeoJSONSource | undefined;
        if (srcPlot) {
           srcPlot.setData({ type: "FeatureCollection", features: parcels });
        }
        
        const vertFeatures: GeoJSON.Feature[] = [];
        parcels.forEach((p, pIdx) => {
          if (p.geometry.type === "Polygon") {
            const cArr = p.geometry.coordinates[0];
            cArr.slice(0, -1).forEach((c, vIdx) => {
              vertFeatures.push({
                type: "Feature",
                geometry: { type: "Point", coordinates: c as [number, number] },
                properties: { pIdx, vIdx }
              });
            });
          }
        });
        const srcVerts = map.getSource("plot-verts") as maplibregl.GeoJSONSource | undefined;
        if (srcVerts) {
           srcVerts.setData({ type: "FeatureCollection", features: vertFeatures });
        }
      }
    };

    const onVertsUp = () => {
      if (activePIdx !== -1) {
        map.getCanvas().style.cursor = '';
        map.off('mousemove', onVertsMove);
        map.off('mouseup', onVertsUp);
        const parcels = [...drawnParcelsRef.current];
        const parcel = parcels[activePIdx];
        if (parcel && parcel.geometry.type === "Polygon") {
          parcel.properties = parcel.properties || {};
          parcel.properties.rai = polygonAreaM2(parcel.geometry.coordinates[0] as LngLat[]) / 1600;
        }
        setDrawnParcels(parcels);
        needsPlantationSearchRef.current = true;
        if (runPlantationInfoRef.current) runPlantationInfoRef.current();
        activePIdx = -1;
      }
    };

    const onLineDown = (e: maplibregl.MapMouseEvent) => {
      if (drawingRef.current) return;
      
      // If clicked on a vertex, ignore to let onVertsDown handle it
      const vertsHit = map.queryRenderedFeatures(e.point, { layers: ['plot-verts-l'] });
      if (vertsHit.length > 0) return;

      // Only handle Left-Click for adding + dragging
      if (e.originalEvent && e.originalEvent.button !== 0) return;

      const clickPt = [e.lngLat.lng, e.lngLat.lat];
      let minD = Infinity;
      let bestPIdx = -1;
      let bestSIdx = -1;
      const p = map.project(clickPt as [number, number]);

      drawnParcelsRef.current.forEach((parcel, pIdx) => {
        if (parcel.geometry.type === "Polygon") {
          const coords = parcel.geometry.coordinates[0];
          for (let i = 0; i < coords.length - 1; i++) {
             const p1 = map.project(coords[i] as [number, number]);
             const p2 = map.project(coords[i+1] as [number, number]);
             const l2 = (p1.x - p2.x)**2 + (p1.y - p2.y)**2;
             let t = 0;
             if (l2 !== 0) {
                 t = Math.max(0, Math.min(1, ((p.x - p1.x)*(p2.x - p1.x) + (p.y - p1.y)*(p2.y - p1.y)) / l2));
             }
             const proj = { x: p1.x + t*(p2.x - p1.x), y: p1.y + t*(p2.y - p1.y) };
             const d = Math.hypot(p.x - proj.x, p.y - proj.y);
             if (d < minD) {
               minD = d;
               bestPIdx = pIdx;
               bestSIdx = i;
             }
          }
        }
      });

      if (minD < 15 && bestPIdx !== -1) {
         e.preventDefault();
         const newParcels = [...drawnParcelsRef.current];
         const parcel = { ...newParcels[bestPIdx] };
         if (parcel.geometry.type === "Polygon") {
            const coords = [...parcel.geometry.coordinates[0]];
            coords.splice(bestSIdx + 1, 0, clickPt);
            parcel.geometry.coordinates[0] = coords;
            parcel.properties = parcel.properties || {};
            parcel.properties.rai = polygonAreaM2(coords as LngLat[]) / 1600;
            newParcels[bestPIdx] = parcel;

            setDrawnParcels(newParcels);
            drawnParcelsRef.current = newParcels;

            // Set index of the new vertex for immediate dragging!
            activePIdx = bestPIdx;
            activeVIdx = bestSIdx + 1;

            map.getCanvas().style.cursor = 'grabbing';
            map.on('mousemove', onVertsMove);
            map.on('mouseup', onVertsUp);
         }
      }
    };

    const onVertsContextMenu = (e: maplibregl.MapMouseEvent) => {
      if (drawingRef.current) return;
      e.preventDefault();
      const features = map.queryRenderedFeatures(e.point, { layers: ['plot-verts-l'] });
      if (!features.length) return;
      const pIdx = features[0].properties.pIdx;
      const vIdx = features[0].properties.vIdx;

      const parcels = [...drawnParcelsRef.current];
      const parcel = parcels[pIdx];
      if (parcel && parcel.geometry.type === "Polygon") {
        const coords = parcel.geometry.coordinates[0];
        if (coords.length <= 4) {
          setToast("แปลงที่ดินต้องมีอย่างน้อย 3 จุด");
          return;
        }

        const activeVerts = coords.slice(0, -1);
        activeVerts.splice(vIdx, 1);
        const newCoords = [...activeVerts, activeVerts[0]];

        parcel.geometry.coordinates[0] = newCoords;
        parcel.properties = parcel.properties || {};
        parcel.properties.rai = polygonAreaM2(newCoords as LngLat[]) / 1600;

        setDrawnParcels(parcels);
        needsPlantationSearchRef.current = true;
        if (runPlantationInfoRef.current) runPlantationInfoRef.current();
        setToast("ลบจุด Node สำเร็จ");
      }
    };

    const mouseEnterVerts = () => { if (!drawingRef.current) map.getCanvas().style.cursor = 'move'; };
    const mouseLeaveVerts = () => { if (!drawingRef.current) map.getCanvas().style.cursor = ''; };
    const mouseEnterLine = () => { if (!drawingRef.current) map.getCanvas().style.cursor = 'crosshair'; };
    const mouseLeaveLine = () => { if (!drawingRef.current) map.getCanvas().style.cursor = ''; };

    map.on('mousedown', 'plot-verts-l', onVertsDown);
    map.on('touchstart', 'plot-verts-l', onVertsTouchStart);
    map.on('contextmenu', 'plot-verts-l', onVertsContextMenu);
    map.on('mouseenter', 'plot-verts-l', mouseEnterVerts);
    map.on('mouseleave', 'plot-verts-l', mouseLeaveVerts);
 
    map.on('mousedown', 'plot-line', onLineDown);
    map.on('mouseenter', 'plot-line', mouseEnterLine);
    map.on('mouseleave', 'plot-line', mouseLeaveLine);
 
    return () => {
      map.dragPan.enable();
      map.off('touchmove', onVertsTouchMove);
      map.off('touchend', onVertsTouchEnd);

      map.off('mousedown', 'plot-verts-l', onVertsDown);
      map.off('touchstart', 'plot-verts-l', onVertsTouchStart);
      map.off('contextmenu', 'plot-verts-l', onVertsContextMenu);
      map.off('mouseenter', 'plot-verts-l', mouseEnterVerts);
      map.off('mouseleave', 'plot-verts-l', mouseLeaveVerts);
      map.off('mousedown', 'plot-line', onLineDown);
      map.off('mouseenter', 'plot-line', mouseEnterLine);
      map.off('mouseleave', 'plot-line', mouseLeaveLine);
    };
  }, [mapLoaded]);

  // Tracks which lu_class values are checked in the panel (for map highlighting)
  const [visibleLuClasses, setVisibleLuClasses] = useState<Record<string, boolean>>({ A: true, A302: true });

  const handleLandUseChange = useCallback((checked: Record<string, boolean>) => {
    setVisibleLuClasses(checked);
    // Colors are now statically applied in addLayer, so no style updates needed here.
  }, []);

  // Map Effect: Grey out unticked Land Use features instead of hiding them
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;
    
    const checkedClasses = Object.entries(visibleLuClasses)
      .filter(([, on]) => on)
      .map(([cls]) => cls);

    // Remove any previous filter so all polygons render
    map.setFilter("matched-parcels-fill", null);
    map.setFilter("matched-parcels-line", null);

    if (checkedClasses.length === 0) {
      map.setPaintProperty("matched-parcels-fill", "fill-color", "#94a3b8");
      map.setPaintProperty("matched-parcels-fill", "fill-opacity", 0.2);
      map.setPaintProperty("matched-parcels-line", "line-color", "#94a3b8");
    } else {
      const colorMap = [
        "case",
        ["==", ["slice", ["to-string", ["coalesce", ["get", "lu_class"], ""]], 0, 1], "U"], "#ef4444",
        ["==", ["slice", ["to-string", ["coalesce", ["get", "lu_class"], ""]], 0, 1], "A"], "#84cc16",
        ["==", ["slice", ["to-string", ["coalesce", ["get", "lu_class"], ""]], 0, 1], "F"], "#166534",
        ["==", ["slice", ["to-string", ["coalesce", ["get", "lu_class"], ""]], 0, 1], "W"], "#3b82f6",
        ["==", ["slice", ["to-string", ["coalesce", ["get", "lu_class"], ""]], 0, 1], "M"], "#9ca3af",
        "#ff9100"
      ];
      
      const isCheckedExpr = ["match", ["coalesce", ["get", "lu_class"], ""], checkedClasses, true, false];
      
      map.setPaintProperty("matched-parcels-fill", "fill-color", ["case", isCheckedExpr, colorMap, "#94a3b8"] as unknown as maplibregl.ExpressionSpecification);
      map.setPaintProperty("matched-parcels-fill", "fill-opacity", ["case", isCheckedExpr, 0.65, 0.35] as unknown as maplibregl.ExpressionSpecification);
      map.setPaintProperty("matched-parcels-line", "line-color", ["case", isCheckedExpr, "#64748b", "#94a3b8"] as unknown as maplibregl.ExpressionSpecification);
    }
  }, [visibleLuClasses, parcelFeatures]);

  // ===== MAP INIT =====
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      pixelRatio: Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2),
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
          { id: "sat", type: "raster", source: "sat", layout: { visibility: "visible" } },
          { id: "street", type: "raster", source: "street", layout: { visibility: "none" } },
          { id: "topo", type: "raster", source: "topo", layout: { visibility: "none" } },
        ],
      },
      center: [101.258, 13.5],
      zoom: 2,
      minZoom: 1,
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

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      "bottom-right",
    );

    map.on("load", () => {
      map.setProjection({ type: "globe" });
      mapLoadedRef.current = true;
      setMapLoaded(true);

      // ── Rayong Province Boundary ──────────────────────────────────────────
      map.addSource("rayong-boundary", {
        type: "geojson",
        data: "/assets/rayong-boundary.geojson",
      });
      // Glow / halo layer (wider, semi-transparent)
      map.addLayer({
        id: "rayong-boundary-glow",
        type: "line",
        source: "rayong-boundary",
        paint: {
          "line-color": "#0a43ffff",
          "line-width": 8,
          "line-opacity": 0.25,
          "line-blur": 4,
        },
      });
      // Main deep-pink line
      map.addLayer({
        id: "rayong-boundary-line",
        type: "line",
        source: "rayong-boundary",
        paint: {
          "line-color": "#1845c2ff",
          "line-width": 2.5,
          "line-opacity": 0.95,
          "line-dasharray": [6, 3],
        },
      });
      // ─────────────────────────────────────────────────────────────────────

      map.addSource("draw-line", { type: "geojson", data: emptyFC() });
      map.addLayer({
        id: "draw-line-l",
        type: "line",
        source: "draw-line",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#3b82f6", "line-width": 2, "line-dasharray": [3, 2] },
      });
      map.addSource("draw-fill", { type: "geojson", data: emptyFC() });
      map.addLayer({
        id: "draw-fill-l",
        type: "fill",
        source: "draw-fill",
        paint: { "fill-color": "#3b82f6", "fill-opacity": 0.05 },
      });
      map.addSource("draw-verts", { type: "geojson", data: emptyFC() });
      map.addLayer({
        id: "draw-verts-l",
        type: "circle",
        source: "draw-verts",
        paint: {
          "circle-color": "#3b82f6",
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 4, 14, 6],
          "circle-stroke-color": "rgba(255,255,255,0.95)",
          "circle-stroke-width": 2,
        },
      });
      map.addSource("plot", { type: "geojson", data: emptyFC() });
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
        paint: { "line-color": "#3b82f6", "line-width": 2.5 },
      });



      map.addSource("matched-parcels", { type: "geojson", data: emptyFC() });
      map.addLayer({
        id: "matched-parcels-fill",
        type: "fill",
        source: "matched-parcels",
        paint: {
          "fill-color": [
            "case",
            ["==", ["slice", ["to-string", ["coalesce", ["get", "lu_class"], ""]], 0, 1], "U"], "#ef4444",
            ["==", ["slice", ["to-string", ["coalesce", ["get", "lu_class"], ""]], 0, 1], "A"], "#84cc16",
            ["==", ["slice", ["to-string", ["coalesce", ["get", "lu_class"], ""]], 0, 1], "F"], "#166534",
            ["==", ["slice", ["to-string", ["coalesce", ["get", "lu_class"], ""]], 0, 1], "W"], "#3b82f6",
            ["==", ["slice", ["to-string", ["coalesce", ["get", "lu_class"], ""]], 0, 1], "M"], "#9ca3af",
            "#ff9100" // default fallback
          ],
          "fill-opacity": 0.65
        },
      });
      map.addLayer({
        id: "matched-parcels-line",
        type: "line",
        source: "matched-parcels",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#64748b", "line-width": 2.2 },
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

      map.addSource("plot-verts", { type: "geojson", data: emptyFC() });
      map.addLayer({
        id: "plot-verts-l",
        type: "circle",
        source: "plot-verts",
        paint: {
          "circle-color": "#ffffff",
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 4, 14, 6],
          "circle-stroke-color": "#3b82f6",
          "circle-stroke-width": 2,
        },
      });

      const fmt = (v: unknown) => (v == null || v === "" ? "—" : String(v));
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
      map.remove();
      mapRef.current = null;
      mapLoadedRef.current = false;
    };
  }, []);

  // ===== AUTO-LOAD EXISTING PROJECT FOR CALCULATION =====
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !user) return;

    let projName = searchParams?.get("project");
    let action = searchParams?.get("action");
    
    // Fallback in case searchParams is not available
    if (!projName && typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      projName = params.get("project") || projName;
      action = params.get("action") || action;
    }

    console.log("[AUTO-LOAD] Effect triggered", { projName, action, currentDrawnCount: drawnParcels.length });

    if (projName && action === "calc" && drawnParcels.length === 0) {
      try {
        const key = `user_saved_plots_${user.id}`;
        const storedRaw = localStorage.getItem(key);
        console.log("[AUTO-LOAD] LocalStorage storedRaw:", storedRaw);
        const stored = JSON.parse(storedRaw || "[]");
        const projectPlots = stored.filter((p: any) => p.name === projName);
        console.log("[AUTO-LOAD] Filtered projectPlots for:", projName, projectPlots);

        if (projectPlots.length > 0) {
          const feats: GeoJSON.Feature[] = projectPlots.map((p: any, i: number) => ({
            type: "Feature",
            geometry: p.geojson,
            properties: {
              ...p,
              plot_index: String(i + 1),
              grow_area: p.areaRai,
              province: p.province
            }
          }));

          console.log("[AUTO-LOAD] Setting drawnParcels and parcelFeatures to feats:", feats);
          setDrawnParcels(feats);
          setParcelFeatures(feats);
          needsPlantationSearchRef.current = true;
          setSearchCount(feats.length);
          if (projectPlots[0].boundaryGeojson) {
            setDrawnGeometry(projectPlots[0].boundaryGeojson as GeoJSON.Geometry);
          }
          setCurrentStep(2);
          setStatus(`เตรียมประมวลผลคาร์บอนสำหรับโครงการ: ${projName}`);

          (map.getSource("matched-parcels") as maplibregl.GeoJSONSource)?.setData({ type: "FeatureCollection", features: feats });

          const bounds = new maplibregl.LngLatBounds();
          feats.forEach(f => {
            if (!f.geometry) return;
            const processCoords = (coords: any) => {
              if (typeof coords[0] === "number") bounds.extend(coords as [number, number]);
              else if (Array.isArray(coords)) coords.forEach(processCoords);
            };
            processCoords((f.geometry as any).coordinates);
          });
          if (!bounds.isEmpty()) {
            map.fitBounds(bounds, { padding: { top: 60, bottom: 60, left: 60, right: 60 }, duration: 1000, maxZoom: 16 });
          }

          setIsPanelOpen(true);
        }
      } catch (err) {
        console.error("Failed to auto-load project for calculation", err);
      }
    }
  }, [user, mapLoaded, searchParams]);

  // ===== DRAW HELPERS =====
  const previewDraw = useCallback(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;
    const verts = vertsRef.current;
    const lineSrc = map.getSource("draw-line") as maplibregl.GeoJSONSource | undefined;
    const fillSrc = map.getSource("draw-fill") as maplibregl.GeoJSONSource | undefined;
    const vertsSrc = map.getSource("draw-verts") as maplibregl.GeoJSONSource | undefined;
    if (!lineSrc || !fillSrc || !vertsSrc) return;
    if (verts.length) {
      vertsSrc.setData({
        type: "FeatureCollection",
        features: verts.map((v) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: v },
          properties: {},
        })),
      });
    } else {
      vertsSrc.setData(emptyFC());
    }
    if (verts.length < 2) {
      lineSrc.setData(emptyFC());
      fillSrc.setData(emptyFC());
      return;
    }
    const line = [...verts, verts.length >= 3 ? verts[0] : verts[verts.length - 1]];
    lineSrc.setData({
      type: "Feature",
      geometry: { type: "LineString", coordinates: line },
      properties: {},
    });
    if (verts.length >= 3) {
      fillSrc.setData({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [[...verts, verts[0]]] },
        properties: {},
      });
    }
  }, []);

  const fitPlot = useCallback(() => {
    const map = mapRef.current;
    const final = finalGJRef.current;
    if (!map || !final) return;
    let coords: LngLat[] = [];
    if (final.geometry.type === "Polygon") {
      coords = final.geometry.coordinates[0] as LngLat[];
    } else if (final.geometry.type === "MultiPolygon") {
      coords = (final.geometry.coordinates as GeoJSON.Position[][][]).flatMap((poly) => poly[0]) as LngLat[];
    }
    if (!coords.length) return;
    const lngs = coords.map((p) => p[0]);
    const lats = coords.map((p) => p[1]);
    map.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      {
        padding: { top: 60, bottom: 60, left: 60, right: 60 },
        duration: 900,
        pitch: 0,
      },
    );
  }, []);


  const finishDraw = useCallback((skipFit = false) => {
    const verts = vertsRef.current;
    if (verts.length < 3) return;

    const ring = [...verts, verts[0]];
    const sqm = polygonAreaM2(ring);
    const rai = sqm / 1600;

    if (rai > 500) {
      setAreaError({ rai, sqm });
      return; // Do not finish drawing if > 500 Rai
    }

    drawingRef.current = false;
    setDrawing(false);

    const map = mapRef.current;
    if (map) {
      map.getCanvas().style.cursor = "";
    }

    const newFeature: GeoJSON.Feature = {
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [ring] },
      properties: {
        id: Math.random().toString(36).substring(7),
        rai: rai,
        status: null, // "new" | "old"
        year: null,
        variety: null,
        trees: null,
        spacing: null,
        landUse: { A: true, A302: true } // Default
      },
    };

    setDrawnParcels(prev => {
      const next = [...prev, newFeature];
      const map = mapRef.current;
      if (map && mapLoadedRef.current) {
        (map.getSource("plot") as maplibregl.GeoJSONSource).setData({
          type: "FeatureCollection",
          features: next,
        });
        // Clear draw layers once added to plot list
        (map.getSource("draw-line") as maplibregl.GeoJSONSource).setData(emptyFC());
        (map.getSource("draw-fill") as maplibregl.GeoJSONSource).setData(emptyFC());
        (map.getSource("draw-verts") as maplibregl.GeoJSONSource).setData(emptyFC());
      }
      return next;
    });
    needsPlantationSearchRef.current = true;

    setDrawPreview(`${rai.toFixed(2)} ไร่ · ${verts.length} จุด`);
    setDrawDone(true);
    setHasGeom(true);
    setStatus(`✓ วาดแปลงเสร็จ — กำลังเข้าสู่ขั้นตอนกรอกข้อมูล`);

    // Transition to step 2 automatically to fill form
    setCurrentStep(2);
    setIsPanelOpen(true);


    // Reset current drawing vertices
    vertsRef.current = [];
    setVertCount(0);

    // Removed duplicate camera bounce (fitBounds) here to allow the subsequent plantation-info fetch to animate smoothly just once!
  }, []);

  // Map click / dblclick / Escape handlers — keep refs in sync
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onClick = (e: maplibregl.MapMouseEvent) => {
      if (!drawingRef.current) return;
      const pts = vertsRef.current;

      // Auto-close polygon if clicking near the first point
      if (pts.length >= 3) {
        const firstPt = map.project(pts[0] as [number, number]);
        const clickedPt = e.point;
        const dist = Math.hypot(firstPt.x - clickedPt.x, firstPt.y - clickedPt.y);
        if (dist < 20) {
          e.preventDefault();
          finishDraw();
          return;
        }
      }

      pts.push([e.lngLat.lng, e.lngLat.lat]);
      setVertCount(pts.length);
      previewDraw();
      setStatus(`จุดที่ ${pts.length}${pts.length >= 3 ? " — กดปุ่ม \"เสร็จสิ้น\" หรือ Double-click เพื่อจบการวาด" : " — คลิกต่อไปเพื่อเพิ่มจุด"}`);
    };
    const onDbl = (e: maplibregl.MapMouseEvent) => {
      if (!drawingRef.current || vertsRef.current.length < 3) return;
      e.preventDefault();
      finishDraw();
    };

    // Custom edit logic
    const onLineClick = (e: maplibregl.MapMouseEvent) => {
      // Edit logic is disabled for multi-parcel for now to keep it simple, 
      // but we could implement it by finding which parcel was clicked.
      if (drawingRef.current) return;
    };

    let dragIdx = -1;
    const onMove = (ev: maplibregl.MapMouseEvent) => {
      if (dragIdx === -1) return;
      vertsRef.current[dragIdx] = [ev.lngLat.lng, ev.lngLat.lat];
      previewDraw();
    };
    const onUp = () => {
      if (dragIdx !== -1) {
        dragIdx = -1;
        map.getCanvas().style.cursor = 'grab';
        map.off('mousemove', onMove);
        map.off('mouseup', onUp);
        if (!drawingRef.current && vertsRef.current.length >= 3) {
          finishDraw(true);
        }
      }
    };
    const onVertsDown = (e: maplibregl.MapMouseEvent) => {
      e.preventDefault();
      const pts = vertsRef.current;
      let minDist = Infinity;
      pts.forEach((p, i) => {
        const d = Math.hypot(p[0] - e.lngLat.lng, p[1] - e.lngLat.lat);
        if (d < minDist) { minDist = d; dragIdx = i; }
      });
      map.getCanvas().style.cursor = 'grabbing';
      map.on('mousemove', onMove);
      map.on('mouseup', onUp);
    };

    const onContextMenu = (e: maplibregl.MapMouseEvent) => {
      e.preventDefault();
      if (!drawingRef.current || vertsRef.current.length < 3) return;
      finishDraw();
    };

    map.on("click", onClick);
    map.on("dblclick", onDbl);
    map.on("contextmenu", onContextMenu);

    return () => {
      map.off("click", onClick);
      map.off("dblclick", onDbl);
      map.off("contextmenu", onContextMenu);
    };
  }, [previewDraw, finishDraw]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && drawingRef.current) {
        drawingRef.current = false;
        setDrawing(false);
        setStatus("ยกเลิกการวาด");
        if (mapRef.current) {
          mapRef.current.getCanvas().style.cursor = "";
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const startDrawFlow = () => {
    const map = mapRef.current;
    if (!map) return;
    if (isMobile()) {
      setIsPanelOpen(false);
    } else {
      setIsPanelOpen(true);
    }
    drawingRef.current = true;
    setDrawing(true);
    map.getCanvas().style.cursor = 'crosshair';
    setStatus("โหมดวาด — คลิกเพื่อเพิ่มจุด | คลิกขวา หรือ Double-click เพื่อปิดแปลง | Esc ยกเลิก");
    if (map.getZoom() < 8) {
      map.flyTo({ center: [101.258, 12.682], zoom: 10, pitch: 0, bearing: 0, duration: 2000 });
    }
  };

  const clearDraw = () => {
    vertsRef.current = [];
    finalGJRef.current = null;
    drawingRef.current = false;
    setDrawing(false);
    setDrawDone(false);
    setVertCount(0);
    setDrawPreview("—");
    setAreaError(null);
    setHasGeom(false);
    setDrawnGeometry(null);
    setSearchCount(null);
    setSearchErr(null);
    setSearchTruncated(false);
    setParcelFeatures([]);
    setShpFile(null);
    setShpStatus(null);
    setDrawnParcels([]);
    setProjectType(null);
    const map = mapRef.current;
    if (map && mapLoadedRef.current) {
      (map.getSource("draw-line") as maplibregl.GeoJSONSource | undefined)?.setData(emptyFC());
      (map.getSource("draw-fill") as maplibregl.GeoJSONSource | undefined)?.setData(emptyFC());
      (map.getSource("draw-verts") as maplibregl.GeoJSONSource | undefined)?.setData(emptyFC());
      (map.getSource("plot") as maplibregl.GeoJSONSource | undefined)?.setData(emptyFC());
      (map.getSource("matched-parcels") as maplibregl.GeoJSONSource | undefined)?.setData(emptyFC());
      map.getCanvas().style.cursor = "";
    }
    setCurrentStep(1);
    setIsPanelOpen(true);
  };

  const deleteParcel = useCallback((idx: number) => {
    setDrawnParcels(prev => {
      const next = prev.filter((_, i) => i !== idx);
      const map = mapRef.current;
      if (map && mapLoadedRef.current) {
        (map.getSource("plot") as maplibregl.GeoJSONSource).setData({
          type: "FeatureCollection",
          features: next,
        });
      }
      if (next.length === 0) {
        setHasGeom(false);
        setParcelFeatures([]);
        if (map && mapLoadedRef.current) {
          (map.getSource("matched-parcels") as maplibregl.GeoJSONSource)?.setData(emptyFC());
        }
      } else {
        needsPlantationSearchRef.current = true;
      }
      return next;
    });
  }, []);

  const cancelDrawMode = useCallback(() => {
    drawingRef.current = false;
    setDrawing(false);
    vertsRef.current = [];
    setStatus("ยกเลิกการวาด");
    setIsPanelOpen(true);
    const map = mapRef.current;
    if (map) {
      map.getCanvas().style.cursor = '';
      (map.getSource("draw-line") as maplibregl.GeoJSONSource).setData(emptyFC());
      (map.getSource("draw-fill") as maplibregl.GeoJSONSource).setData(emptyFC());
      (map.getSource("draw-verts") as maplibregl.GeoJSONSource).setData(emptyFC());
    }
  }, []);

  const cancelSearch = useCallback(() => {
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    setSearchRunning(false);
    setCurrentStep(1);
    setSearchCount(null);
    setSearchErr(null);
    setSearchTruncated(false);
    setParcelFeatures([]);
    const map = mapRef.current;
    if (map && mapLoadedRef.current) {
      (map.getSource("matched-parcels") as maplibregl.GeoJSONSource | undefined)?.setData(emptyFC());
    }
  }, []);


  // ===== PLANTATION INFO (rubber area search via backend) =====
  const runPlantationInfo = useCallback(async (projType?: string | null) => {
    const activeProjType = projType !== undefined ? projType : projectType;
    console.log("[runPlantationInfo] Called", {
      drawnParcelsLength: drawnParcels.length,
      totalDrawnArea,
      drawnParcels,
      activeProjType
    });
    if (drawnParcels.length === 0) {
      setSearchErr("กรุณาวาดแปลงหรืออัปโหลด Shapefile ก่อน");
      return;
    }

    const totalRai = totalDrawnArea / 1600;
    if (totalRai < 1) {
      setAreaError({ rai: totalRai, sqm: totalDrawnArea });
      return;
    }

    // Combine all drawn polygons into one MultiPolygon (handles Polygon and MultiPolygon features)
    const rings: GeoJSON.Position[][][] = drawnParcels.flatMap(p => {
      if (p.geometry.type === "Polygon") return [(p.geometry as GeoJSON.Polygon).coordinates];
      if (p.geometry.type === "MultiPolygon") return (p.geometry as GeoJSON.MultiPolygon).coordinates;
      return [];
    });
    const combinedGeom: GeoJSON.MultiPolygon = {
      type: "MultiPolygon",
      coordinates: rings,
    };

    setDrawnGeometry(combinedGeom);
    setSearchRunning(true);
    setSearchErr(null);
    setSearchCount(null);
    setSearchTruncated(false);

    try {
      const result = await getPlantationInfo({
        id: `search-${Date.now()}`,
        geometry: truncateCoords(combinedGeom),
        project_type: activeProjType,
        output_crs: "EPSG:4326",
      });
      console.log("[KeptCarbon] plantation-info response:", JSON.stringify(result, null, 2));

      // Show ALL lu_polygon features on map with lu_class for colour coding
      const allLU = result.lu_polygon ?? [];
      const features: GeoJSON.Feature[] = allLU.map((lu, i) => ({
        type: "Feature",
        geometry: lu.geometry,
        properties: {
          plot_index: String(i + 1),
          lu_class: lu.lu_class,
          lu_class_desc_th: lu.lu_class_desc_th,
          area_m2: lu.area_m2,
          area_percent: lu.area_percent,
        },
      }));

      const map = mapRef.current;
      if (map && mapLoadedRef.current) {
        (map.getSource("matched-parcels") as maplibregl.GeoJSONSource | undefined)
          ?.setData({ type: "FeatureCollection", features });

        // Apply initial lu checked state to map colors
        handleLandUseChange(visibleLuClasses);

        // Fit map to show all returned land-use polygons
        if (features.length > 0) {
          const bounds = new maplibregl.LngLatBounds();
          features.forEach(f => {
            const walk = (coords: unknown): void => {
              if (!Array.isArray(coords)) return;
              if (typeof coords[0] === "number") { bounds.extend(coords as [number, number]); return; }
              coords.forEach(walk);
            };
            walk((f.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon).coordinates);
          });
          if (!bounds.isEmpty()) {
            map.fitBounds(bounds, { padding: 60, duration: 700, maxZoom: 17 });
          }
        }
      }

      setParcelFeatures(features);

      // Count rubber (A302) specifically for status / error messages
      const rubberLU = allLU.filter(lu => lu.lu_class === "A302");

      if (result.status.status === "error" || allLU.length === 0) {
        const msg = result.status.status_code === "E01"
          ? "พื้นที่วาดอยู่นอกจังหวัดที่รองรับ กรุณาวาดในพื้นที่จังหวัดระยอง"
          : "ไม่พบข้อมูลการใช้ที่ดินในขอบเขตที่วาด กรุณาวาดใหม่";
        setSearchErr(msg);
        setSearchCount(0);
        setStatus("ไม่พบข้อมูล");
      } else {
        const rubberPct = rubberLU.reduce((s, lu) => s + lu.area_percent, 0);
        setSearchCount(allLU.length);
        const rubberNote = rubberLU.length > 0 ? ` · ยางพารา A302 ${rubberPct.toFixed(1)}%` : " · ไม่พบยางพารา";
        setStatus(`พบ ${allLU.length} พื้นที่ใช้ที่ดิน${rubberNote}`);
      }
    } catch (err) {
      setSearchErr(err instanceof Error ? err.message : String(err));
    } finally {
      setSearchRunning(false);
    }
  }, [drawnParcels, totalDrawnArea, handleLandUseChange, visibleLuClasses, projectType]);

  const handleProjectTypeChange = useCallback((type: "replanting" | "existing") => {
    setProjectType(type);
    runPlantationInfo(type);
  }, [runPlantationInfo]);

  useEffect(() => {
    runPlantationInfoRef.current = runPlantationInfo;
  }, [runPlantationInfo]);

  // Auto-trigger plantation info search when new parcels are drawn
  useEffect(() => {
    console.log("[AUTO-TRIGGER] Effect evaluated", {
      needsPlantationSearch: needsPlantationSearchRef.current,
      drawnParcelsLength: drawnParcels.length,
      drawnParcels
    });
    if (needsPlantationSearchRef.current && drawnParcels.length > 0) {
      needsPlantationSearchRef.current = false;
      console.log("[AUTO-TRIGGER] Launching runPlantationInfoRef.current()");
      runPlantationInfoRef.current(projectType);
    }
  }, [drawnParcels, projectType]);

  // Search is auto-triggered after finishDraw or loadShp


  // ===== SHP IMPORT =====
  const onShpSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    clearDraw();
    setShpFile(f);
    setShpStatus({ msg: `✓ เลือกไฟล์: ${f.name}`, ok: true });
    e.target.value = "";
  };

  const loadShp = async () => {
    if (!shpFile) return;
    setShpStatus({ msg: "กำลังอ่านไฟล์..." });
    try {
      const zip = await JSZip.loadAsync(shpFile);
      const fns = Object.keys(zip.files);
      const sk = fns.find((f) => f.toLowerCase().endsWith(".shp"));
      const dk = fns.find((f) => f.toLowerCase().endsWith(".dbf"));
      const pk = fns.find((f) => f.toLowerCase().endsWith(".prj"));
      if (!sk) throw new Error("ไม่พบไฟล์ .shp ใน zip");
      const shpBuf = await zip.files[sk].async("arraybuffer");
      const dbfBuf = dk ? await zip.files[dk].async("arraybuffer") : undefined;
      const shapefile = await import("shapefile");
      const src = await shapefile.open(shpBuf, dbfBuf);
      const rawFeats: GeoJSON.Feature[] = [];
      let r;
      while (!(r = await src.read()).done) rawFeats.push(r.value);
      if (!rawFeats.length) throw new Error("ไม่พบ Feature ในไฟล์");

      // Detect projection from .prj, or auto-detect UTM zone from coordinates
      let utm: { zone: number; isNorth: boolean } | undefined;
      if (pk) {
        const prjText = await zip.files[pk].async("string");
        utm = detectUtmFromPrj(prjText) ?? undefined;
      }
      // If no .prj or not parseable, check first coordinate for UTM range and auto-detect
      if (!utm) {
        const sample = (rawFeats[0]?.geometry as any)?.coordinates;
        const flat = (function first(c: any): [number, number] | null {
          if (!Array.isArray(c)) return null;
          if (typeof c[0] === "number") return c as [number, number];
          return first(c[0]);
        })(sample);
        if (flat && (Math.abs(flat[0]) > 2000 || Math.abs(flat[1]) > 2000)) {
          utm = detectUtmZoneAuto(flat[0], flat[1]) ?? undefined;
          if (!utm) throw new Error("ไม่สามารถตรวจจับระบบพิกัดได้ กรุณาใส่ไฟล์ .prj หรือแปลงเป็น WGS84 (EPSG:4326) ก่อน");
        }
      }

      const projLabel = utm ? ` (UTM Zone ${utm.zone}${utm.isNorth ? "N" : "S"} → WGS84)` : " (WGS84)";
      const feats = rawFeats.map((f) => validateAndFixGeoJSON(f, utm));

      // Collect ALL polygon features (not just the first one)
      const polyFeats = feats.filter(
        (f) => f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon",
      );
      if (!polyFeats.length) throw new Error("ไม่พบ Polygon");

      // Merge all rings into one MultiPolygon for the search query
      const allRings: GeoJSON.Position[][][] = [];
      for (const f of polyFeats) {
        if (f.geometry.type === "Polygon") {
          allRings.push(f.geometry.coordinates as GeoJSON.Position[][]);
        } else if (f.geometry.type === "MultiPolygon") {
          allRings.push(...(f.geometry.coordinates as GeoJSON.Position[][][]));
        }
      }
      const searchGeom: GeoJSON.MultiPolygon = { type: "MultiPolygon", coordinates: allRings };
      finalGJRef.current = { type: "Feature", geometry: searchGeom, properties: {} };

      // Calculate total area for validation
      let totalSqm = 0;
      for (const f of polyFeats) {
        if (f.geometry.type === "Polygon") {
          totalSqm += polygonAreaM2(f.geometry.coordinates[0] as LngLat[]);
        } else if (f.geometry.type === "MultiPolygon") {
          for (const poly of f.geometry.coordinates) {
            totalSqm += polygonAreaM2(poly[0] as LngLat[]);
          }
        }
      }
      const totalRai = totalSqm / 1600;
      if (totalRai < 1) {
        setAreaError({ rai: totalRai, sqm: totalSqm });
      } else {
        setAreaError(null);
      }

      setHasGeom(true);
      const map = mapRef.current;
      if (map && mapLoadedRef.current) {
        // Show all uploaded parcels on the map
        (map.getSource("plot") as maplibregl.GeoJSONSource).setData({
          type: "FeatureCollection",
          features: polyFeats,
        });
      }
      fitPlot();

      // Auto process - ONLY if total area is >= 1 Rai
      if (totalRai >= 1) {
        // Flatten MultiPolygon features into Polygon features for drawnParcels state
        const drawableFeats: GeoJSON.Feature[] = polyFeats.flatMap(f => {
          if (f.geometry.type === "Polygon") return [f];
          if (f.geometry.type === "MultiPolygon") {
            return (f.geometry as GeoJSON.MultiPolygon).coordinates.map(coords => ({
              ...f,
              geometry: { type: "Polygon" as const, coordinates: coords },
            }));
          }
          return [];
        });
        setDrawnParcels(drawableFeats);
        needsPlantationSearchRef.current = true;
      } else {
        setCurrentStep(1);
      }

      setShpStatus({
        msg: `✓ โหลดสำเร็จ — ${polyFeats.length} แปลง${projLabel}${totalRai < 1 ? " (พื้นที่น้อยกว่า 1 ไร่)" : ""}`,
        ok: totalRai >= 1,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setShpStatus({ msg: "✗ " + msg });
    }
  };

  // ===== BASEMAP SWITCH =====
  const switchBasemap = (mode: "sat" | "street" | "topo") => {
    setBasemap(mode);
    const map = mapRef.current;
    if (!map) return;
    (["sat", "street", "topo"] as const).forEach((m) => {
      if (map.getLayer(m)) {
        map.setLayoutProperty(m, "visibility", m === mode ? "visible" : "none");
      }
    });
  };

  // ===== SEARCH =====
  const searchLocation = async () => {
    const q = searchValue.trim();
    if (!q) {
      setSearchResults(null);
      return;
    }
    setSearchLoading(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&countrycodes=th&limit=5&q=${encodeURIComponent(q)}`,
      );
      const data = (await res.json()) as { display_name: string; lon: string; lat: string }[];
      setSearchResults(data);
    } catch {
      setSearchResults([]);
    }
    setSearchLoading(false);
  };

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") searchLocation();
  };

  const pickSearchResult = (item: { display_name: string; lon: string; lat: string }) => {
    const map = mapRef.current;
    if (map) {
      map.flyTo({
        center: [parseFloat(item.lon), parseFloat(item.lat)],
        zoom: 12,
        pitch: 0,
        duration: 2500,
      });
    }
    setSearchValue(item.display_name);
    setSearchResults(null);
  };

  // ===== Outside-click close (search) =====
  useEffect(() => {
    if (!searchResults) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      const sc = document.getElementById("search-container");
      if (searchResults && sc && !sc.contains(target)) setSearchResults(null);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [searchResults]);


  const flyToFeature = useCallback((feature: GeoJSON.Feature) => {
    const map = mapRef.current;
    if (!map || !feature.geometry) return;
    const coords = feature.geometry.type === "Polygon"
      ? (feature.geometry as GeoJSON.Polygon).coordinates[0]
      : feature.geometry.type === "MultiPolygon"
        ? (feature.geometry as GeoJSON.MultiPolygon).coordinates[0][0]
        : null;
    if (!coords?.length) return;
    const lngs = coords.map(([x]) => x);
    const lats = coords.map(([, y]) => y);
    map.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: 80, duration: 600, maxZoom: 18 },
    );
  }, []);


  return (
    <div className={`mds-shell${drawing ? " drawing" : ""}`}>

      {/* ══ LEFT: Map ══ */}
      <div className="mds-map-side">
        <div className="mds-map-container" ref={mapContainerRef} />

        {/* Floating search bar */}
        <div className="mds-search-wrap" id="search-container">
          <div className="mds-search-box">
            <input
              className="mds-search-input"
              type="text"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onKeyDown={onSearchKey}
              placeholder="ค้นหา จังหวัด, อำเภอ, ตำบล..."
            />
            <button className="mds-search-btn" onClick={searchLocation} disabled={searchLoading}>
              {searchLoading
                ? <div className="spinner-border spinner-border-sm" role="status" style={{ width: 16, height: 16, borderWidth: 2, color: "#fff" }} />
                : <i className="bi bi-search" />}
            </button>
          </div>
          {searchResults && (
            <div className="mds-search-results">
              {searchResults.length === 0 && (
                <div className="mds-search-item" style={{ color: "rgba(220,53,69,0.8)", textAlign: "center" }}>
                  ไม่พบสถานที่ที่ค้นหา
                </div>
              )}
              {searchResults.map((item, i) => (
                <div key={i} className="mds-search-item" onClick={() => pickSearchResult(item)}>
                  <i className="bi bi-compass me-2" style={{ color: "#2d9e5f" }} />
                  {item.display_name}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Layer switcher button */}
        <div className="mds-map-controls">
          <button
            className="mds-map-ctrl-btn"
            title="เปลี่ยนแผนที่ฐาน"
            onClick={() => setBasemapOpen((v) => !v)}
          >
            <i className="bi bi-layers" />
          </button>
        </div>

        {/* Basemap card */}
        <div className={`mds-basemap-card${basemapOpen ? " open" : ""}`}>
          <div className="mds-basemap-header">
            <span><i className="bi bi-layers me-1" /> แผนที่ฐาน</span>
            <i className="bi bi-x" style={{ cursor: "pointer", fontSize: 18 }} onClick={() => setBasemapOpen(false)} />
          </div>
          {(["sat", "street", "topo"] as const).map((m) => (
            <div
              key={m}
              className={`mds-basemap-option${basemap === m ? " active" : ""}`}
              onClick={() => switchBasemap(m)}
            >
              <i className={m === "sat" ? "bi bi-globe-asia-australia" : m === "street" ? "bi bi-map" : "bi bi-tree"} />
              {m === "sat" ? "ดาวเทียม" : m === "street" ? "ถนน (Street)" : "ภูมิประเทศ"}
            </div>
          ))}
        </div>

        {/* Mobile active drawing floating action bar */}
        {drawing && isMobile() && (
          <div
            style={{
              position: "fixed",
              bottom: "20px",
              left: "16px",
              right: "70px",
              zIndex: 100,
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              background: "rgba(255, 255, 255, 0.96)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              borderRadius: "14px",
              padding: "12px",
              boxShadow: "0 10px 25px -5px rgba(5, 150, 105, 0.15), 0 8px 16px -4px rgba(0, 0, 0, 0.05)",
              border: "1px solid rgba(16, 185, 129, 0.25)",
              boxSizing: "border-box",
              animation: "mdsFabIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)"
            }}
          >
            {/* Draw info label */}
            <div
              style={{
                fontSize: "11px",
                color: "#064e3b",
                textAlign: "center",
                fontWeight: "700",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "5px"
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  background: "#10b981",
                  boxShadow: "0 0 8px #10b981"
                }}
                className="mds-status-blink"
              />
              {vertCount === 0 ? "แตะบนแผนที่เพื่อเริ่มวาดแปลง" : `กำลังวาด: ${vertCount} จุด (ต้องการอย่างน้อย 3)`}
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", gap: "8px", width: "100%" }}>
              <button
                onClick={() => finishDraw()}
                disabled={vertCount < 3}
                style={{
                  flex: 1,
                  height: "36px",
                  borderRadius: "10px",
                  boxSizing: "border-box",
                  border: vertCount < 3 ? "1px solid #e2e8f0" : "1px solid transparent",
                  background: vertCount < 3 ? "#f1f5f9" : "linear-gradient(135deg, #10b981, #059669)",
                  color: vertCount < 3 ? "#94a3b8" : "#fff",
                  fontSize: "12px",
                  fontWeight: "700",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0 8px",
                  gap: "6px",
                  transition: "all 0.2s"
                }}
              >
                <i className="bi bi-check-circle-fill" /> เสร็จสิ้น
              </button>
              <button
                onClick={clearDraw}
                style={{
                  flex: 1,
                  height: "36px",
                  borderRadius: "10px",
                  boxSizing: "border-box",
                  border: "1px solid transparent",
                  background: "linear-gradient(135deg, #ef4444, #dc2626)",
                  color: "#fff",
                  fontSize: "12px",
                  fontWeight: "700",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0 8px",
                  gap: "6px",
                  transition: "all 0.2s"
                }}
              >
                <i className="bi bi-x-circle-fill" /> ยกเลิก
              </button>
            </div>
          </div>
        )}

      </div>

      {/* ── Toggle Panel Button (when closed) ── */}
      {!isPanelOpen && (
        <button
          className="mds-panel-toggle-btn"
          onClick={() => setIsPanelOpen(true)}
          title="เปิดแผงเครื่องมือ"
        >
          <i className="bi bi-clipboard2-data-fill" />
          <span className="mds-panel-toggle-text">กรอกข้อมูล</span>
        </button>
      )}

      {/* ══ RIGHT: Data Panel ══ */}
      <div className={`mds-panel-side ${isPanelOpen ? "open" : "closed"}`}>

        {/* Drag handle for mobile toggle */}
        <div className="mds-mobile-drag-handle" onClick={() => setIsPanelOpen(false)} />

        {/* ── Panel Mini Header ── */}
        <div className="mds-panel-topbar">
          <div className="mds-panel-topbar-left">
            <div className="mds-panel-topbar-icon">
              <i className="bi bi-geo-alt-fill" />
            </div>
            <div>
              <div className="mds-panel-topbar-title">วิเคราะห์แปลงยาง</div>
              <div className="mds-panel-topbar-sub">KeptCarbon · ระบบกำหนดขอบเขต</div>
            </div>
          </div>
          <button
            className="mds-panel-topbar-close"
            onClick={() => setIsPanelOpen(false)}
            title="ซ่อนแผง"
          >
            <i className="bi bi-x-lg" />
          </button>
        </div>

        {/* ── Step Tracker ── */}
        <div className="mds-stepper">
          <div className="mds-steps-row">
            <div className="mds-stepper-track">
              <div className="mds-stepper-fill" style={{ width: `${(currentStep - 1) * 50}%` }} />
            </div>
            {([
              { n: 1 as const, label: "กำหนดพื้นที่" },
              { n: 2 as const, label: "กรอกข้อมูล" },
              { n: 3 as const, label: "ผลคาร์บอน/บันทึก" },
            ]).map(({ n, label }) => {
              const isActive = currentStep === n;
              const isDone = currentStep > n;
              return (
                <div key={n} className={`mds-step${isActive ? " active" : isDone ? " done" : ""}`}>
                  <div className="mds-step-circle">
                    {isDone ? <i className="bi bi-check-lg" /> : n}
                  </div>
                  <span className="mds-step-label">{label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Scrollable Content ── */}
        <div className="mds-panel-body">

          {/* STEP 1: Draw / Upload */}
          {currentStep === 1 && (
            <div className="mds-s1">
              <div className="mds-s1-card">
                <div className="mds-s1-hd">
                  <div>

                    <h2 className="mds-s1-title">กำหนดขอบเขตแปลง</h2>
                    <p className="mds-s1-sub">
                      วาดหรือนำเข้าพื้นที่บนแผนที่เพื่อค้นหาแปลงยางในฐานข้อมูล
                    </p>
                  </div>

                </div>

                {/* Method selector */}
                <div className="mds-method-toggle">
                  <button
                    className={`mds-mtab${tab === "draw" ? " active" : ""}`}
                    onClick={() => setTab("draw")}
                  >
                    <i className="bi bi-pencil-square" /> วาดแปลง
                  </button>
                  <button
                    className={`mds-mtab${tab === "shp" ? " active" : ""}`}
                    onClick={() => setTab("shp")}
                  >
                    <i className="bi bi-file-earmark-zip" /> นำเข้า SHP
                  </button>
                </div>

                {/* ── Draw tab ── */}
                {tab === "draw" && (
                  <div className="mds-action-content">
                    {drawing ? (
                      /* ── Drawing in progress ── */
                      <>
                        <div className="mds-draw-hint">
                          <div className="mds-dot-pulse" />
                          คลิกบนแผนที่เพื่อเพิ่มจุด · <strong>Double-click</strong> หรือกดปุ่ม <strong>"เสร็จสิ้น"</strong> เพื่อจบการวาด
                        </div>
                        <div style={{ display: "flex", gap: "8px", marginTop: "10px", flexWrap: "wrap" }}>
                          <button
                            className="mds-btn mds-btn-solid mds-finish-btn-mobile"
                            style={{ flex: 1 }}
                            onClick={() => finishDraw()}
                            disabled={vertCount < 3}
                          >
                            <i className="bi bi-check-circle" /> เสร็จสิ้น วาดแปลง
                          </button>
                          <button className="mds-btn mds-btn-danger" onClick={clearDraw}>
                            <i className="bi bi-x-circle" /> ยกเลิก
                          </button>
                        </div>
                      </>
                    ) : (
                      /* ── Default: show instructions + start button ── */
                      <>

                        {drawnParcels.length === 0 && (
                          <ol className="mds-instr-list">
                            <li>คลิกปุ่ม <strong>&ldquo;เริ่มวาดแปลง&rdquo;</strong></li>
                            <li>คลิกบนแผนที่เพื่อเพิ่มจุดขอบเขต (อย่างน้อย 3 จุด)</li>
                            <li>กดปุ่ม <strong>&ldquo;เสร็จสิ้น วาดแปลง&rdquo;</strong> หรือ Double-click เพื่อจบการวาด</li>
                          </ol>
                        )}

                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <button className="mds-btn mds-btn-solid" onClick={startDrawFlow}>
                            <i className="bi bi-pencil" /> {drawnParcels.length > 0 ? "วาดแปลงเพิ่ม" : "เริ่มวาดแปลง"}
                          </button>
                          {drawnParcels.length > 0 && (
                            <button
                              className="mds-btn"
                              style={{
                                background: "linear-gradient(135deg, #0d9488, #0f766e)",
                                color: "#fff",
                                border: "none",
                                boxShadow: "0 4px 10px rgba(13,148,136,0.25)"
                              }}
                              onClick={() => setCurrentStep(2)}
                            >
                              <i className="bi bi-arrow-right-circle" /> กรอกข้อมูลแปลง (ขั้นตอนถัดไป)
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* ── SHP tab ── */}
                {tab === "shp" && (
                  <div className="mds-action-content">
                    <div
                      className={`mds-dropzone${dragOver ? " drag-over" : ""}${shpFile ? " has-file" : ""}`}
                      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOver(false);
                        const f = e.dataTransfer.files[0];
                        if (f) { setShpFile(f); setShpStatus({ msg: `✓ เลือกไฟล์: ${f.name}`, ok: true }); }
                      }}
                      onClick={() => document.getElementById("shp-file-input-split")?.click()}
                    >
                      <i className={`bi ${shpFile ? "bi-file-zip-fill" : "bi-cloud-upload"}`} />
                      <p>{shpFile ? shpFile.name : "ลาก .zip มาวาง หรือคลิกเลือก"}</p>
                      <span>ต้องมี .shp .shx .dbf ใน ZIP · WGS84 (EPSG:4326)</span>
                    </div>
                    <input
                      id="shp-file-input-split"
                      type="file"
                      accept=".zip"
                      style={{ display: "none" }}
                      onChange={onShpSelected}
                    />
                    {shpStatus && (
                      <div className={`mds-shp-msg${shpStatus.ok ? " ok" : ""}`}>
                        {shpStatus.msg}
                      </div>
                    )}
                    <button
                      className="mds-btn mds-btn-solid"
                      onClick={loadShp}
                      disabled={!shpFile}
                    >
                      <i className="bi bi-upload" /> โหลดและแสดงบนแผนที่
                    </button>
                    {hasGeom && !drawing && (
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <button className="mds-btn mds-btn-soft" style={{ flex: 1 }} onClick={clearDraw}>
                          <i className="bi bi-trash" /> ล้างแปลง
                        </button>
                        <button
                          className="mds-btn"
                          style={{
                            flex: 1.5,
                            background: "linear-gradient(135deg, #0d9488, #0f766e)",
                            color: "#fff",
                            border: "none",
                            boxShadow: "0 4px 10px rgba(13,148,136,0.25)"
                          }}
                          onClick={() => setCurrentStep(2)}
                        >
                          <i className="bi bi-arrow-right-circle" /> กรอกข้อมูลแปลง
                        </button>
                      </div>
                    )}
                  </div>
                )}

              </div>{/* /mds-s1-card */}
            </div>
          )}

          {/* STEPS 2 & 3: Results + Save */}
          {(currentStep >= 2 || searchRunning || searchErr) && (
            <div className="mds-results-container">
              <ParcelResultsPanel
                searchRunning={searchRunning}
                searchErr={searchErr}
                searchCount={searchCount}
                searchTruncated={searchTruncated}
                parcelFeatures={drawnParcels}
                luFeatures={parcelFeatures}
                userDisplayName={user?.fullname ?? ""}
                drawnGeometry={drawnGeometry}
                onFlyTo={flyToFeature}
                onReset={clearDraw}
                onBack={clearDraw}
                onCancel={cancelSearch}
                currentStep={currentStep}
                onStepChange={setCurrentStep}
                selectedMapPlotIndex={selectedPlotIndex}
                onMapPlotSelected={setSelectedPlotIndex}
                onDeleteParcel={deleteParcel}
                onDrawMore={startDrawFlow}
                isDrawing={drawing}
                onFinishDraw={() => finishDraw()}
                onCancelDraw={cancelDrawMode}
                onLandUseChange={handleLandUseChange}
                onProjectTypeChange={handleProjectTypeChange}
              />
            </div>
          )}

        </div>
      </div>

      {/* Toast notification */}
      {toast && (
        <div className="mds-toast">
          <i className="bi bi-check-circle me-2" />
          {toast}
        </div>
      )}

      {/* Area Validation Popup */}
      {areaError && (
        <div className="mds-area-popup-overlay" onClick={() => setAreaError(null)}>
          <div className="mds-area-popup" onClick={(e) => e.stopPropagation()}>
            <div className="mds-area-popup-icon">
              <i className="bi bi-exclamation-triangle-fill" />
            </div>
            <div className="mds-area-popup-content">
              <h3>พื้นที่แปลงใหญ่เกินไป</h3>
              <p>
                ขนาดแปลงที่วาดคือ <strong>{areaError.rai.toFixed(2)} ไร่</strong> ({Math.round(areaError.sqm).toLocaleString()} ตร.ม.)
                ซึ่งเกินกว่าเกณฑ์สูงสุด <strong>500 ไร่</strong>
              </p>
              <div className="mds-area-popup-hint">
                กรุณาปรับลดขอบเขตแปลง หรือแบ่งเป็นหลายแปลง
              </div>
            </div>
            <button className="mds-area-popup-close" onClick={() => setAreaError(null)}>
              ตกลง
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MapDrawPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fdfb" }}><div className="spinner-border" style={{ color: "#10b981" }} /></div>}>
      <MapDrawContent />
    </Suspense>
  );
}

