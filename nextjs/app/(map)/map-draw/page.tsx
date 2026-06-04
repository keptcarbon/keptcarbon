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
  sanitizePolygonForApi,
} from "@/lib/map-utils";
import { getPlantationInfo } from "@/lib/carbon-api";
import { ParcelResultsPanel } from "@/app/components/organisms";
import { useSearchParams } from "next/navigation";

type Tab = "draw" | "shp";

const REGIONS_DATA = [
  { name: "ภาคตะวันออกเฉียงเหนือ", provinces: ["บึงกาฬ"] },
  { name: "ภาคตะวันออก", provinces: ["ระยอง"] },
  { name: "ภาคใต้", provinces: ["สุราษฎร์ธานี"] },
];

const zoomToGeoJSONFeatures = (features: GeoJSON.Feature[], map: maplibregl.Map) => {
  if (!features || !features.length || !map) return;
  let minLng = 180, maxLng = -180, minLat = 90, maxLat = -90;
  let hasCoords = false;

  const updateBounds = (ring: number[][]) => {
    ring.forEach(([lng, lat]) => {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      hasCoords = true;
    });
  };

  features.forEach(feature => {
    if (!feature.geometry) return;
    if (feature.geometry.type === "Polygon") {
      (feature.geometry as GeoJSON.Polygon).coordinates.forEach(updateBounds);
    } else if (feature.geometry.type === "MultiPolygon") {
      (feature.geometry as GeoJSON.MultiPolygon).coordinates.forEach(poly => poly.forEach(updateBounds));
    }
  });

  if (hasCoords) {
    // Adding checks to prevent identical bounds error
    if (minLng === maxLng) { minLng -= 0.01; maxLng += 0.01; }
    if (minLat === maxLat) { minLat -= 0.01; maxLat += 0.01; }
    map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { 
      padding: 60, 
      duration: 2500, // Slower, smoother animation
      essential: true 
    });
  }
};


const AMPHOE_DATA: Record<string, string[]> = {
  "บึงกาฬ": ["เมืองบึงกาฬ", "พรเจริญ", "โซ่พิสัย", "เซกา", "ปากคาด", "บึงโขงหลง", "ศรีวิไล", "บุ้งคล้า"],
  "ระยอง": ["เมืองระยอง", "บ้านฉาง", "แกลง", "วังจันทร์", "บ้านค่าย", "ปลวกแดง", "เขาชะเมา", "นิคมพัฒนา"],
  "สุราษฎร์ธานี": ["เมืองสุราษฎร์ธานี", "กาญจนดิษฐ์", "ดอนสัก", "เกาะสมุย", "เกาะพะงัน", "ไชยา", "ท่าชนะ", "คีรีรัฐนิคม", "บ้านตาขุน", "พนม", "ท่าฉาง", "บ้านนาสาร", "บ้านนาเดิม", "เคียนซา", "เวียงสระ", "พระแสง", "พุนพิน", "ชัยบุรี", "วิภาวดี"],
};

// UTM Zone 47N/48N → WGS84
function utmToLatLng(easting: number, northing: number, zone: number, isNorth = true) {
  const a = 6378137.0, f = 1 / 298.257223563;
  const b = a * (1 - f);
  const e2 = 1 - (b * b) / (a * a);
  const ep2 = e2 / (1 - e2);
  const k0 = 0.9996, E0 = 500000, N0 = isNorth ? 0 : 10000000;
  const lam0 = ((zone - 1) * 6 - 180 + 3) * (Math.PI / 180);
  const x = easting - E0, y = northing - N0;
  const M = y / k0;
  const mu = M / (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const phi1 = mu
    + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
    + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu);
  const sp = Math.sin(phi1), cp = Math.cos(phi1), tp = Math.tan(phi1);
  const N1 = a / Math.sqrt(1 - e2 * sp * sp);
  const T1 = tp * tp, C1 = ep2 * cp * cp;
  const R1 = a * (1 - e2) / (1 - e2 * sp * sp) ** 1.5;
  const D = x / (N1 * k0);
  const lat = phi1 - (N1 * tp / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4 / 24 + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6 / 720);
  const lon = lam0 + (D - (1 + 2 * T1 + C1) * D ** 3 / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5 / 120) / cp;
  return { lat: lat * 180 / Math.PI, lng: lon * 180 / Math.PI };
}

const cursorAddNode = "cell";

const SNAP_PX = 15;

function MapDrawContent() {
  const { user } = useAuth();

  const [selectedRegion, setSelectedRegion] = useState("");
  const [selectedProvince, setSelectedProvince] = useState("");
  const [selectedAmphoe, setSelectedAmphoe] = useState("");
  const [selectedTambon, setSelectedTambon] = useState("");
  const [locationMethod, setLocationMethod] = useState<"area" | "coord">("area");
  const [amphoesFromDb, setAmphoesFromDb] = useState<string[]>([]);
  const [tambonsFromDb, setTambonsFromDb] = useState<string[]>([]);
  const [tambonsLoading, setTambonsLoading] = useState(false);
  const [coordMode, setCoordMode] = useState<"latlng" | "utm">("latlng");
  const [coordLat, setCoordLat] = useState("");
  const [coordLng, setCoordLng] = useState("");
  const [coordUtmZone, setCoordUtmZone] = useState<47 | 48>(47);
  const [coordE, setCoordE] = useState("");
  const [coordN, setCoordN] = useState("");
  const boundaryAnimRef = useRef<number>(0);

  useEffect(() => {
    document.body.classList.add("map-draw-active");
    return () => document.body.classList.remove("map-draw-active");
  }, []);

  // Map refs / state
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const mapLoadedRef = useRef(false);
  const searchAbortRef = useRef<AbortController | null>(null);
  const refPlotsLoadedRef = useRef(false);

  const searchParams = useSearchParams();

  const projNameParam = useMemo(() => {
    let pName = searchParams?.get("project");
    if (!pName && typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      pName = params.get("project");
    }
    return pName || "";
  }, [searchParams]);

  const isEditingPlotParam = useMemo(() => {
    let pId = searchParams?.get("plotId");
    if (!pId && typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      pId = params.get("plotId");
    }
    return !!pId;
  }, [searchParams]);

  const handleExitProject = useCallback(() => {
    window.location.href = "/map-draw";
  }, []);

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
  const [basemap, setBasemap] = useState<"hybrid" | "sat" | "street" | "topo">("hybrid");
  const [status, setStatus] = useState("🇹🇭 แผนที่ประเทศไทย — เลือกภาค จังหวัด อำเภอ หรือตำบล แล้วกด \"เริ่มวาดแปลง\"");
  const [mapLoaded, setMapLoaded] = useState(false);



  // SHP state
  const [shpFile, setShpFile] = useState<File | null>(null);
  const [shpStatus, setShpStatus] = useState<{ msg: string; ok?: boolean } | null>(null);

  // Parcel DB search state (auto-runs ST_Intersects after geometry is set)
  const [hasGeom, setHasGeom] = useState(false);
  const [searchRunning, setSearchRunning] = useState(false);
  const [searchCount, setSearchCount] = useState<number | null>(null);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [errorPopup, setErrorPopup] = useState<{ title: string; desc: string; } | null>(null);
  const [searchTruncated, setSearchTruncated] = useState(false);
  const [rawPlantationInfo, setRawPlantationInfo] = useState<any[]>([]);
  const [parcelFeatures, setParcelFeatures] = useState<GeoJSON.Feature[]>([]);
  const [dragOver, setDragOver] = useState(false);

  // Search
  const [searchValue, setSearchValue] = useState("");
  const [searchResults, setSearchResults] = useState<{ display_name: string; lon: string; lat: string }[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  // Toast
  const [toast, setToast] = useState<string | null>(null);
  const toastTimeRef = useRef<number>(0);

  // Minimum-points warning popup
  const [nodeWarningPopup, setNodeWarningPopup] = useState(false);

  // Auto-dismiss success toast after 2.5 s
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  // Stepper state
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // Panel toggle state
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [showWelcomeHint, setShowWelcomeHint] = useState(true);

  // Area Validation State
  const [areaError, setAreaError] = useState<{ rai: number; sqm: number; tooSmall?: boolean } | null>(null);

  // Drawn boundary geometry (set when search is confirmed)
  const [drawnGeometry, setDrawnGeometry] = useState<GeoJSON.Geometry | null>(null);
  const [selectedPlotIndex, setSelectedPlotIndex] = useState<number | "total">("total");
  const [projectType, setProjectType] = useState<"replanting" | "existing" | null>(null);
  const [projectName, setProjectName] = useState(projNameParam || "");
  const [stepWarningPopup, setStepWarningPopup] = useState<boolean>(false);
  const [plotsSaved, setPlotsSaved] = useState(false);

  const [hiddenProjectPlots, setHiddenProjectPlots] = useState<GeoJSON.Feature[]>([]);
  const [existingProjectPlots, setExistingProjectPlots] = useState<any[]>([]);
  const [editingPlotId, setEditingPlotId] = useState<string | null>(null);
  const [autoProcessTrigger, setAutoProcessTrigger] = useState(0);

  const [existingProjectNames, setExistingProjectNames] = useState<Set<string>>(new Set());

  useEffect(() => {
    let url = "";
    if (user) {
      url = "/api/plots";
    } else {
      const guestId = typeof window !== "undefined" ? localStorage.getItem("guest_user_id") : null;
      if (guestId) url = `/api/plots?guest_user_id=${guestId}`;
    }

    if (!url) return;

    fetch(url)
      .then(res => res.ok ? res.json() : { plots: [] })
      .then(data => {
        const plots = Array.isArray(data.plots) ? data.plots : [];
        const names = new Set<string>();
        plots.forEach((p: any) => {
          if (p.name) names.add(String(p.name).trim().toLowerCase());
        });
        setExistingProjectNames(names);
      })
      .catch(console.error);
  }, [user]);

  const isDuplicateProjectName = useMemo(() => {
    if (!projectName.trim()) return false;
    if (projNameParam && projectName.trim().toLowerCase() === projNameParam.trim().toLowerCase()) {
      return false;
    }
    return existingProjectNames.has(projectName.trim().toLowerCase());
  }, [projectName, projNameParam, existingProjectNames]);

  const handleStepClick = (n: number) => {
    if (n === currentStep) return;

    if (n === 1) {
      if (drawnParcels.length > 0) {
        setStepWarningPopup(true);
      } else {
        setCurrentStep(1);
      }
    } else if (n === 2) {
      if (currentStep === 3) {
        setCurrentStep(2);
      } else if (currentStep === 1) {
        if (drawnParcels.length > 0 && !(user && (!projectName.trim() || isDuplicateProjectName))) {
          setCurrentStep(2);
        }
      }
    } else if (n === 3) {
      // Step 3 can only be reached via processing button in Step 2.
    }
  };

  const handleConfirmStep1 = () => {
    setStepWarningPopup(false);
    clearDraw();
    setCurrentStep(1);
    setProjectName("");
  };

  // Multi-parcel support
  const [drawnParcels, setDrawnParcels] = useState<GeoJSON.Feature[]>([]);
  const drawnParcelsRef = useRef<GeoJSON.Feature[]>([]);

  const findSnapTarget = useCallback((
    screenPt: { x: number; y: number },
    excludePIdx: number
  ): [number, number] | null => {
    const map = mapRef.current;
    if (!map) return null;
    let bestDist = SNAP_PX;
    let snapCoord: [number, number] | null = null;
    drawnParcelsRef.current.forEach((parcel, pIdx) => {
      if (excludePIdx !== -1 && pIdx === excludePIdx) return;
      if (parcel.geometry.type !== "Polygon") return;
      const coords = parcel.geometry.coordinates[0];
      for (let i = 0; i < coords.length - 1; i++) {
        const sp = map.project(coords[i] as [number, number]);
        const d = Math.hypot(screenPt.x - sp.x, screenPt.y - sp.y);
        if (d < bestDist) { bestDist = d; snapCoord = coords[i] as [number, number]; }
      }
    });
    return snapCoord;
  }, []);

  const setSnapIndicator = useCallback((coord: [number, number] | null) => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource("snap-indicator") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData(coord
      ? { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Point", coordinates: coord }, properties: {} }] }
      : { type: "FeatureCollection", features: [] });
  }, []);

  const getVertFeatures = useCallback((parcels: GeoJSON.Feature[]) => {
    const vertFeatures: GeoJSON.Feature[] = [];
    parcels.forEach((p, pIdx) => {
      if (p.geometry.type === "Polygon") {
        const coords = p.geometry.coordinates[0];
        coords.slice(0, -1).forEach((c, vIdx) => {
          // Real node
          vertFeatures.push({
            type: "Feature",
            id: pIdx * 1000 + vIdx * 2,
            geometry: { type: "Point", coordinates: c as [number, number] },
            properties: { pIdx, vIdx, isMid: false }
          });
          // Midpoint node (ghost)
          const nextC = coords[vIdx + 1];
          if (nextC) {
            vertFeatures.push({
              type: "Feature",
              id: pIdx * 1000 + vIdx * 2 + 1,
              geometry: { type: "Point", coordinates: [(c[0] + nextC[0]) / 2, (c[1] + nextC[1]) / 2] },
              properties: { pIdx, vIdx, isMid: true }
            });
          }
        });
      }
    });
    return vertFeatures;
  }, []);

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
      const src = map.getSource("plot-verts") as maplibregl.GeoJSONSource | undefined;
      if (src) {
        src.setData({ type: "FeatureCollection", features: getVertFeatures(drawnParcels) });
      }
    }
  }, [drawnParcels, getVertFeatures]);



  // Thailand boundary: show when no region/province selected, hide otherwise
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;
    const src = map.getSource("th-boundary") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    if (selectedRegion || selectedProvince) {
      src.setData({ type: "FeatureCollection", features: [] });
      return;
    }
    fetch('/api/geojson/th-boundary')
      .then(r => r.json())
      .then(fc => { src.setData(fc); })
      .catch(console.error);
  }, [selectedRegion, selectedProvince, mapLoaded]);

  // Region boundary: show only the selected region, hide when province chosen
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;
    const src = map.getSource("region-boundary") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    if (!selectedRegion || selectedProvince) {
      src.setData({ type: "FeatureCollection", features: [] });
      return;
    }
    fetch('/api/geojson/regions')
      .then(r => r.json())
      .then((fc: GeoJSON.FeatureCollection) => {
        const filtered: GeoJSON.FeatureCollection = {
          type: "FeatureCollection",
          features: (fc.features || []).filter(f => f.properties?.name_th === selectedRegion),
        };
        src.setData(filtered);
        if (filtered.features.length) zoomToGeoJSONFeatures(filtered.features, map);
      })
      .catch(console.error);
  }, [selectedRegion, selectedProvince, mapLoaded]);

  // Update province boundary to show only the selected province
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;
    const src = map.getSource("province-boundary") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    if (!selectedProvince || selectedAmphoe) {
      src.setData({ type: "FeatureCollection", features: [] });
      return;
    }
    fetch(`/api/geojson/boundary?province=${encodeURIComponent(selectedProvince)}`)
      .then(r => r.json())
      .then(fc => {
        src.setData(fc);
        if (fc.features) zoomToGeoJSONFeatures(fc.features, map);
      })
      .catch(console.error);
  }, [selectedProvince, selectedAmphoe, mapLoaded]);

  // Fetch amphoe list from DB when province changes
  useEffect(() => {
    if (!selectedProvince) { setAmphoesFromDb([]); setTambonsFromDb([]); return; }
    fetch(`/api/geojson/districts?province=${encodeURIComponent(selectedProvince)}`)
      .then(r => r.json())
      .then((fc: GeoJSON.FeatureCollection) => {
        const names = Array.from(new Set(
          (fc.features || []).map((f: GeoJSON.Feature) => f.properties?.amphoe_t as string).filter(Boolean)
        )).sort((a, b) => a.localeCompare(b, 'th'));
        setAmphoesFromDb(names);
      })
      .catch(console.error);
  }, [selectedProvince]);

  // Fetch tambon list from DB when amphoe changes
  useEffect(() => {
    if (!selectedAmphoe) { setTambonsFromDb([]); setTambonsLoading(false); return; }
    setTambonsLoading(true);
    setTambonsFromDb([]);
    fetch(`/api/geojson/tambon?district=${encodeURIComponent(selectedAmphoe)}`)
      .then(r => r.json())
      .then((fc: GeoJSON.FeatureCollection) => {
        const names = Array.from(new Set(
          (fc.features || []).map((f: GeoJSON.Feature) => f.properties?.tambon_t as string).filter(Boolean)
        )).sort((a, b) => a.localeCompare(b, 'th'));
        setTambonsFromDb(names);
      })
      .catch(console.error)
      .finally(() => setTambonsLoading(false));
  }, [selectedAmphoe]);

  // Update district boundary layer when amphoe changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;
    const src = map.getSource("district-boundary") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    if (!selectedAmphoe || !selectedProvince || selectedTambon) { src.setData({ type: "FeatureCollection", features: [] }); return; }
    fetch(`/api/geojson/districts?district=${encodeURIComponent(selectedAmphoe)}&province=${encodeURIComponent(selectedProvince)}`)
      .then(r => r.json())
      .then(fc => {
        src.setData(fc);
        if (fc.features) zoomToGeoJSONFeatures(fc.features, map);
      })
      .catch(console.error);
  }, [selectedAmphoe, selectedProvince, selectedTambon, mapLoaded]);

  // Update tambon boundary layer when tambon changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;
    const src = map.getSource("tambon-boundary") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    if (!selectedTambon || !selectedAmphoe) { src.setData({ type: "FeatureCollection", features: [] }); return; }
    fetch(`/api/geojson/tambon?tambon=${encodeURIComponent(selectedTambon)}&district=${encodeURIComponent(selectedAmphoe)}`)
      .then(r => r.json())
      .then(fc => {
        src.setData(fc);
        if (fc.features) zoomToGeoJSONFeatures(fc.features, map);
      })
      .catch(console.error);
  }, [selectedTambon, selectedAmphoe, mapLoaded]);

  // Hide vertex nodes when not on step 1 (not editable at step 2/3)
  // Also hide existing polygon vertices while drawing to prevent accidental snapping
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;
    const vis = currentStep >= 3 ? "none" : "visible";
    const plotVertsVis = (currentStep >= 3 || drawing) ? "none" : "visible";
    if (map.getLayer("plot-verts-l")) map.setLayoutProperty("plot-verts-l", "visibility", plotVertsVis);
    if (map.getLayer("draw-verts-l")) map.setLayoutProperty("draw-verts-l", "visibility", vis);
  }, [currentStep, drawing]);

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

      // Use manual proximity check with large finger-friendly hit radius
      const TOUCH_RADIUS = 30;
      const touchPt = e.point;
      let bestDist = TOUCH_RADIUS;
      let bestPIdx = -1;
      let bestVIdx = -1;
      let bestIsMid = false;

      const vertFeats = getVertFeatures(drawnParcelsRef.current);
      for (const vf of vertFeats) {
        if (vf.geometry.type !== "Point") continue;
        const screenPt = map.project(vf.geometry.coordinates as [number, number]);
        const d = Math.hypot(touchPt.x - screenPt.x, touchPt.y - screenPt.y);
        if (d < bestDist && vf.properties) {
          bestDist = d;
          bestPIdx = vf.properties.pIdx;
          bestVIdx = vf.properties.vIdx;
          bestIsMid = vf.properties.isMid;
        }
      }

      if (bestPIdx === -1) return;

      e.preventDefault();
      const pIdx = bestPIdx;
      const vIdx = bestVIdx;
      const isMid = bestIsMid;
      const touch = (e.lngLats && e.lngLats.length > 0) ? e.lngLats[0] : e.lngLat;

      if (isMid) {
        const parcels = [...drawnParcelsRef.current];
        const parcel = { ...parcels[pIdx] };
        if (parcel.geometry.type === "Polygon") {
          const coords = [...parcel.geometry.coordinates[0]];
          coords.splice(vIdx + 1, 0, [touch.lng, touch.lat]);
          parcel.geometry.coordinates[0] = coords;
          parcels[pIdx] = parcel;
          setDrawnParcels(parcels);
          drawnParcelsRef.current = parcels;
          activePIdx = pIdx;
          activeVIdx = vIdx + 1;
        }
      } else {
        activePIdx = pIdx;
        activeVIdx = vIdx;
      }

      map.dragPan.disable();

      map.on('touchmove', onVertsTouchMove);
      map.on('touchend', onVertsTouchEnd);
    }

    function onVertsTouchMove(e: maplibregl.MapTouchEvent) {
      const map = mapRef.current;
      if (!map || activePIdx === -1) return;
      const touch = (e.lngLats && e.lngLats.length > 0) ? e.lngLats[0] : e.lngLat;
      if (!touch) return;
      const parcels = [...drawnParcelsRef.current];
      const parcel = parcels[activePIdx];
      if (parcel && parcel.geometry.type === "Polygon") {
        const coords = [...parcel.geometry.coordinates[0]];
        const screenPt = map.project([touch.lng, touch.lat] as [number, number]);
        const snapCoord = findSnapTarget(screenPt, activePIdx);
        const newCoord: [number, number] = snapCoord ?? [touch.lng, touch.lat];
        
        const testCoords = [...coords];
        testCoords[activeVIdx] = newCoord;
        if (activeVIdx === 0) {
          testCoords[testCoords.length - 1] = newCoord;
        }
        const oldRai = polygonAreaM2(coords as LngLat[]) / 1600;
        const newRai = polygonAreaM2(testCoords as LngLat[]) / 1600;
        if (newRai > 500 && newRai > oldRai) {
           setAreaError({ rai: newRai, sqm: newRai * 1600 });
           onVertsTouchEnd();
           return;
        }

        setSnapIndicator(snapCoord);
        coords[activeVIdx] = newCoord;
        if (activeVIdx === 0) {
          coords[coords.length - 1] = newCoord;
        }
        parcel.geometry.coordinates[0] = coords;

        const srcPlot = map.getSource("plot") as maplibregl.GeoJSONSource | undefined;
        if (srcPlot) {
          srcPlot.setData({ type: "FeatureCollection", features: parcels });
        }

        const srcVerts = map.getSource("plot-verts") as maplibregl.GeoJSONSource | undefined;
        if (srcVerts) {
          srcVerts.setData({ type: "FeatureCollection", features: getVertFeatures(parcels) });
        }
      }
    }

    function onVertsTouchEnd() {
      const map = mapRef.current;
      if (!map || activePIdx === -1) return;
      map.off('touchmove', onVertsTouchMove);
      map.off('touchend', onVertsTouchEnd);

      map.dragPan.enable();
      setSnapIndicator(null);

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
        const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
          [e.point.x - 15, e.point.y - 15],
          [e.point.x + 15, e.point.y + 15]
        ];
        const features = map.queryRenderedFeatures(bbox, { layers: ['plot-verts-l'] });
        if (!features.length) return;
        const pIdx = features[0].properties.pIdx;
        const vIdx = features[0].properties.vIdx;

        const parcels = [...drawnParcelsRef.current];
        const parcel = parcels[pIdx];
        if (parcel && parcel.geometry.type === "Polygon") {
          const coords = parcel.geometry.coordinates[0];
          if (coords.length <= 4) {
            setNodeWarningPopup(true);
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
      const f = features[0];
      const { pIdx, vIdx, isMid } = f.properties;

      if (isMid) {
        const parcels = [...drawnParcelsRef.current];
        const parcel = { ...parcels[pIdx] };
        if (parcel.geometry.type === "Polygon") {
          const coords = [...parcel.geometry.coordinates[0]];
          coords.splice(vIdx + 1, 0, [e.lngLat.lng, e.lngLat.lat]);
          parcel.geometry.coordinates[0] = coords;
          parcels[pIdx] = parcel;
          setDrawnParcels(parcels);
          drawnParcelsRef.current = parcels;
          activePIdx = pIdx;
          activeVIdx = vIdx + 1;
        }
      } else {
        activePIdx = pIdx;
        activeVIdx = vIdx;
      }

      map.getCanvas().style.cursor = 'grabbing';
      map.on('mousemove', onVertsMove);
      map.on('mouseup', onVertsUp);
    };

    const onVertsMove = (e: maplibregl.MapMouseEvent) => {
      if (activePIdx === -1) return;
      const parcels = [...drawnParcelsRef.current];
      const originalParcel = parcels[activePIdx];
      if (originalParcel && originalParcel.geometry.type === "Polygon") {
        const parcel = { ...originalParcel };
        const geom = parcel.geometry as GeoJSON.Polygon;
        const coords = [...geom.coordinates[0]];
        const snapCoord = findSnapTarget(e.point, activePIdx);
        const newCoord: [number, number] = snapCoord ?? [e.lngLat.lng, e.lngLat.lat];
        
        const testCoords = [...coords];
        testCoords[activeVIdx] = newCoord;
        if (activeVIdx === 0) {
          testCoords[testCoords.length - 1] = newCoord;
        }
        const oldRai = polygonAreaM2(coords as LngLat[]) / 1600;
        const newRai = polygonAreaM2(testCoords as LngLat[]) / 1600;
        if (newRai > 500 && newRai > oldRai) {
           setAreaError({ rai: newRai, sqm: newRai * 1600 });
           onVertsUp();
           return;
        }

        setSnapIndicator(snapCoord);
        coords[activeVIdx] = newCoord;
        if (activeVIdx === 0) {
          coords[coords.length - 1] = newCoord;
        }
        parcel.geometry = { ...geom, type: "Polygon", coordinates: [coords] };
        parcel.properties = { ...parcel.properties };
        parcel.properties.rai = polygonAreaM2(coords as LngLat[]) / 1600;

        parcels[activePIdx] = parcel;

        const srcPlot = map.getSource("plot") as maplibregl.GeoJSONSource | undefined;
        if (srcPlot) {
          srcPlot.setData({ type: "FeatureCollection", features: parcels });
        }

        const srcVerts = map.getSource("plot-verts") as maplibregl.GeoJSONSource | undefined;
        if (srcVerts) {
          srcVerts.setData({ type: "FeatureCollection", features: getVertFeatures(parcels) });
        }

        setDrawnParcels(parcels);
      }
    };

    const onVertsUp = () => {
      if (activePIdx !== -1) {
        map.getCanvas().style.cursor = 'grab';
        map.off('mousemove', onVertsMove);
        map.off('mouseup', onVertsUp);
        setSnapIndicator(null);
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
            const p2 = map.project(coords[i + 1] as [number, number]);
            const l2 = (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2;
            let t = 0;
            if (l2 !== 0) {
              t = Math.max(0, Math.min(1, ((p.x - p1.x) * (p2.x - p1.x) + (p.y - p1.y) * (p2.y - p1.y)) / l2));
            }
            const proj = { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
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

    const onLineTouchStart = (e: maplibregl.MapTouchEvent) => {
      if (drawingRef.current) return;
      e.preventDefault();
      const vertsHit = map.queryRenderedFeatures(e.point, { layers: ['plot-verts-l'] });
      if (vertsHit.length > 0) return;

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
            const p2 = map.project(coords[i + 1] as [number, number]);
            const l2 = (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2;
            let t = 0;
            if (l2 !== 0) {
              t = Math.max(0, Math.min(1, ((p.x - p1.x) * (p2.x - p1.x) + (p.y - p1.y) * (p2.y - p1.y)) / l2));
            }
            const proj = { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
            const d = Math.hypot(p.x - proj.x, p.y - proj.y);
            if (d < minD) {
              minD = d;
              bestPIdx = pIdx;
              bestSIdx = i;
            }
          }
        }
      });

      if (minD < 30 && bestPIdx !== -1) {
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

          activePIdx = bestPIdx;
          activeVIdx = bestSIdx + 1;

          map.on('touchmove', onVertsTouchMove);
          map.on('touchend', onVertsTouchEnd);
        }
      }
    };

    const onVertsContextMenu = (e: maplibregl.MapMouseEvent) => {
      if (drawingRef.current) return;
      e.preventDefault();
      const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
        [e.point.x - 15, e.point.y - 15],
        [e.point.x + 15, e.point.y + 15]
      ];
      const features = map.queryRenderedFeatures(bbox, { layers: ['plot-verts-l'] });
      if (!features.length) return;
      const pIdx = features[0].properties.pIdx;
      const vIdx = features[0].properties.vIdx;

      const parcels = [...drawnParcelsRef.current];
      const parcel = parcels[pIdx];
      if (parcel && parcel.geometry.type === "Polygon") {
        const coords = parcel.geometry.coordinates[0];
        if (coords.length <= 4) {
          setNodeWarningPopup(true);
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
    };

    let hoveredVertId: number | null = null;

    const mouseEnterVerts = (e: maplibregl.MapMouseEvent) => {
      if (!drawingRef.current) {
        const features = map.queryRenderedFeatures(e.point, { layers: ['plot-verts-l'] });
        if (features.length) {
          const f = features[0];
          const isMid = f.properties?.isMid;
          if (isMid) {
            map.getCanvas().style.cursor = cursorAddNode;
          } else {
            map.getCanvas().style.cursor = 'grab';
          }

          if (f.id !== undefined) {
            if (hoveredVertId !== null) {
              map.setFeatureState({ source: 'plot-verts', id: hoveredVertId }, { hover: false });
            }
            hoveredVertId = f.id as number;
            map.setFeatureState({ source: 'plot-verts', id: hoveredVertId }, { hover: true });
          }
        }
      }
    };

    const mouseMoveVerts = (e: maplibregl.MapMouseEvent) => {
      if (drawingRef.current) return;
      const features = map.queryRenderedFeatures(e.point, { layers: ['plot-verts-l'] });
      if (features.length) {
        const f = features[0];
        const isMid = f.properties?.isMid;
        if (isMid) {
          map.getCanvas().style.cursor = cursorAddNode;
        } else {
          map.getCanvas().style.cursor = 'grab';
        }

        if (f.id !== undefined && f.id !== hoveredVertId) {
          if (hoveredVertId !== null) {
            map.setFeatureState({ source: 'plot-verts', id: hoveredVertId }, { hover: false });
          }
          hoveredVertId = f.id as number;
          map.setFeatureState({ source: 'plot-verts', id: hoveredVertId }, { hover: true });
        }
      }
    };

    const mouseLeaveVerts = () => {
      if (!drawingRef.current) {
        map.getCanvas().style.cursor = '';
        if (hoveredVertId !== null) {
          map.setFeatureState({ source: 'plot-verts', id: hoveredVertId }, { hover: false });
          hoveredVertId = null;
        }
      }
    };

    const mouseEnterLine = () => {
      if (!drawingRef.current) {
        map.getCanvas().style.cursor = cursorAddNode;
      }
    };

    const mouseLeaveLine = () => {
      if (!drawingRef.current) {
        map.getCanvas().style.cursor = '';
      }
    };

    map.on('mousedown', 'plot-verts-l', onVertsDown);
    map.on('touchstart', onVertsTouchStart);
    map.on('contextmenu', 'plot-verts-l', onVertsContextMenu);
    map.on('mouseenter', 'plot-verts-l', mouseEnterVerts);
    map.on('mousemove', 'plot-verts-l', mouseMoveVerts);
    map.on('mouseleave', 'plot-verts-l', mouseLeaveVerts);

    map.on('mousedown', 'plot-line', onLineDown);
    map.on('touchstart', 'plot-line', onLineTouchStart);
    map.on('mouseenter', 'plot-line', mouseEnterLine);
    map.on('mouseleave', 'plot-line', mouseLeaveLine);

    return () => {
      map.dragPan.enable();
      map.off('touchmove', onVertsTouchMove);
      map.off('touchend', onVertsTouchEnd);

      map.off('mousedown', 'plot-verts-l', onVertsDown);
      map.off('touchstart', onVertsTouchStart);
      map.off('contextmenu', 'plot-verts-l', onVertsContextMenu);
      map.off('mouseenter', 'plot-verts-l', mouseEnterVerts);
      map.off('mousemove', 'plot-verts-l', mouseMoveVerts);
      map.off('mouseleave', 'plot-verts-l', mouseLeaveVerts);
      map.off('mousedown', 'plot-line', onLineDown);
      map.off('touchstart', 'plot-line', onLineTouchStart);
      map.off('mouseenter', 'plot-line', mouseEnterLine);
      map.off('mouseleave', 'plot-line', mouseLeaveLine);
    };
  }, [mapLoaded]);

  // Per-plot LU checked state ref — updated by the panel via onLandUseChange
  const allPlotsCheckedRef = useRef<Record<number, Record<string, boolean>>>({});

  const handleLandUseChange = useCallback((allPlotsChecked: Record<number, Record<string, boolean>>, focusedPlotIdx?: number | null) => {
    allPlotsCheckedRef.current = allPlotsChecked;
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;

    // Define fill colors for all LU type groups (opacity expression controls visibility)
    const fillColorMap = [
      "case",
      ["==", ["to-string", ["coalesce", ["get", "lu_class"], ""]], "A302"], "#84cc16",
      ["==", ["slice", ["coalesce", ["get", "lu_class"], ""], 0, 1], "F"], "#166534",
      ["==", ["slice", ["coalesce", ["get", "lu_class"], ""], 0, 1], "W"], "#3b82f6",
      ["==", ["slice", ["coalesce", ["get", "lu_class"], ""], 0, 1], "M"], "#9ca3af",
      ["==", ["slice", ["coalesce", ["get", "lu_class"], ""], 0, 1], "U"], "#ef4444",
      ["==", ["slice", ["coalesce", ["get", "lu_class"], ""], 0, 1], "A"], "#84cc16",
      "rgba(0,0,0,0)"
    ] as unknown as maplibregl.ExpressionSpecification;

    const lineColorMap = "#334155" as unknown as maplibregl.ExpressionSpecification;

    map.setPaintProperty("matched-parcels-fill", "fill-color", fillColorMap);
    map.setPaintProperty("matched-parcels-line", "line-color", lineColorMap);
    map.setPaintProperty("matched-parcels-line", "line-width", 1.5);

    // A302 must always show fill+line when detected, regardless of checkbox state.
    const isA302 = ["==", ["to-string", ["coalesce", ["get", "lu_class"], ""]], "A302"];

    // Always show ALL plots' checked LU polygons so previously checked data
    // remains visible when switching between plots in the panel.
    const keysToProcess = Object.keys(allPlotsChecked);

    const plotConditions: unknown[] = [];
    for (const plotIdxStr of keysToProcess) {
      const checked = allPlotsChecked[parseInt(plotIdxStr)];
      if (!checked) continue;
      const checkedClasses = Object.entries(checked).filter(([, on]) => on).map(([cls]) => cls);
      if (checkedClasses.length === 0) continue;
      plotConditions.push([
        "all",
        ["==", ["get", "plot_index"], String(parseInt(plotIdxStr, 10) + 1)],
        ["match", ["coalesce", ["get", "lu_class"], ""], checkedClasses, true, false]
      ]);
    }

    // Line: always visible for all detected polygons (shows boundaries without color)
    map.setPaintProperty("matched-parcels-line", "line-opacity", 1);

    // Fill: A302 always shows color; other types get fill only when checkbox is checked
    if (plotConditions.length > 0) {
      const checkedExpr = plotConditions.length === 1 ? plotConditions[0] : ["any", ...plotConditions];
      map.setPaintProperty("matched-parcels-fill", "fill-opacity",
        ["case",
          isA302, 0.65,
          checkedExpr, 0.65,
          0
        ] as unknown as maplibregl.ExpressionSpecification);
    } else {
      map.setPaintProperty("matched-parcels-fill", "fill-opacity",
        ["case", isA302, 0.65, 0] as unknown as maplibregl.ExpressionSpecification);
    }
  }, []);

  // Re-apply LU fills when new parcel data arrives
  useEffect(() => {
    handleLandUseChange(allPlotsCheckedRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parcelFeatures, handleLandUseChange]);

  // ===== MAP INIT =====
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
          "line-width": ["interpolate", ["linear"], ["zoom"], 4, 6, 8, 12, 12, 20],
          "line-opacity": ["interpolate", ["linear"], ["zoom"], 4, 0.2, 12, 0.35],
          "line-blur": ["interpolate", ["linear"], ["zoom"], 4, 4, 12, 10],
        },
      });
      map.addLayer({
        id: "th-boundary-line",
        type: "line",
        source: "th-boundary",
        paint: {
          "line-color": "#16a34a",
          "line-width": ["interpolate", ["linear"], ["zoom"], 4, 1.5, 8, 2.5, 12, 4],
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
          "line-width": ["interpolate", ["linear"], ["zoom"], 5, 6, 9, 12, 13, 20],
          "line-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0.15, 13, 0.3],
          "line-blur": ["interpolate", ["linear"], ["zoom"], 5, 3, 13, 10],
        },
      });
      map.addLayer({
        id: "region-boundary-line",
        type: "line",
        source: "region-boundary",
        paint: {
          "line-color": "#d97706",
          "line-width": ["interpolate", ["linear"], ["zoom"], 5, 1.5, 9, 2.5, 13, 5],
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
          "line-width": ["interpolate", ["linear"], ["zoom"], 6, 6, 10, 12, 14, 20],
          "line-opacity": ["interpolate", ["linear"], ["zoom"], 6, 0.15, 14, 0.3],
          "line-blur": ["interpolate", ["linear"], ["zoom"], 6, 3, 14, 10],
        },
      });
      // Main solid line — thickens on zoom
      map.addLayer({
        id: "province-boundary-line",
        type: "line",
        source: "province-boundary",
        paint: {
          "line-color": "#db2777", // pink-600
          "line-width": ["interpolate", ["linear"], ["zoom"], 6, 1.5, 10, 2.5, 14, 5],
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
          "line-width": ["interpolate", ["linear"], ["zoom"], 6, 6, 10, 12, 14, 20],
          "line-opacity": ["interpolate", ["linear"], ["zoom"], 6, 0.15, 14, 0.3],
          "line-blur": ["interpolate", ["linear"], ["zoom"], 6, 3, 14, 10],
        },
      });
      map.addLayer({
        id: "district-boundary-line",
        type: "line",
        source: "district-boundary",
        paint: {
          "line-color": "#06b6d4",
          "line-width": ["interpolate", ["linear"], ["zoom"], 6, 1.5, 10, 2.5, 14, 5],
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
          "line-width": ["interpolate", ["linear"], ["zoom"], 6, 6, 10, 12, 14, 20],
          "line-opacity": ["interpolate", ["linear"], ["zoom"], 6, 0.15, 14, 0.3],
          "line-blur": ["interpolate", ["linear"], ["zoom"], 6, 3, 14, 10],
        },
      });
      map.addLayer({
        id: "tambon-boundary-line",
        type: "line",
        source: "tambon-boundary",
        paint: {
          "line-color": "#a855f7",
          "line-width": ["interpolate", ["linear"], ["zoom"], 6, 1.5, 10, 2.5, 14, 5],
          "line-opacity": 0.95,
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
        paint: { "line-color": "#3b82f6", "line-width": ["interpolate", ["linear"], ["zoom"], 4, 1, 14, 2] },
      });



      map.addSource("matched-parcels", { type: "geojson", data: emptyFC() });
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
      map.addSource("ref-project-plots", { type: "geojson", data: emptyFC() });
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

      map.addSource("plot-verts", { type: "geojson", data: emptyFC() });
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
      cancelAnimationFrame(boundaryAnimRef.current);
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
    let plotId = searchParams?.get("plotId");

    // Fallback in case searchParams is not available
    if (!projName && typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      projName = params.get("project") || projName;
      action = params.get("action") || action;
      plotId = params.get("plotId") || plotId;
    }

    console.log("[AUTO-LOAD] Effect triggered", { projName, action, plotId, currentDrawnCount: drawnParcels.length });

    // Add-plot mode: project specified but no action/plotId — load existing plots into step 2
    if (projName && !action && !plotId && !refPlotsLoadedRef.current) {
      refPlotsLoadedRef.current = true;
      const loadForDisplay = async () => {
        try {
          const apiRes = await fetch(`/api/plots?name=${encodeURIComponent(projName!)}`);
          const apiData = apiRes.ok ? await apiRes.json() : { plots: [] };
          // Filter client-side by project name as safety net
          const allProjectPlots: any[] = (Array.isArray(apiData.plots) ? apiData.plots : [])
            .filter((p: any) => String(p.name || "").toLowerCase() === String(projName).toLowerCase());
          if (allProjectPlots.length > 0) {
            // Load with full properties so form data (plantStatus, plantYear, etc.) is pre-populated
            const feats: GeoJSON.Feature[] = allProjectPlots.map((p: any, i: number) => ({
              type: "Feature",
              geometry: p.geojson,
              properties: {
                ...p,
                plot_index: String(i + 1),
                grow_area: p.areaRai,
                grow_year: p.plantYearBE,
                province: p.province,
              },
            }));

            // Load into drawnParcels → existing plots appear in step 2 with form data intact
            setDrawnParcels(feats);
            setCurrentStep(2);
            setIsPanelOpen(true);
            setSearchCount(feats.length);
            setStatus(`เตรียมประมวลผลคาร์บอนสำหรับโครงการ: ${projName}`);

            const hasExistingLuData = allProjectPlots.some(p =>
              Array.isArray(p.backendData?.lu_polygon) && p.backendData.lu_polygon.length > 0
            );

            const initialParcelFeatures: GeoJSON.Feature[] = [];
            allProjectPlots.forEach((p: any, i: number) => {
              const luPolys = p.backendData?.lu_polygon;
              if (Array.isArray(luPolys) && luPolys.length > 0) {
                luPolys.forEach((lf: any) => {
                  if (lf && lf.geometry) {
                    initialParcelFeatures.push({
                      type: "Feature",
                      geometry: lf.geometry,
                      properties: { ...(lf.properties || {}), plot_index: String(i + 1) },
                    });
                  }
                });
              } else {
                initialParcelFeatures.push(feats[i]);
              }
            });

            if (hasExistingLuData) {
              const initialChecked: Record<number, Record<string, boolean>> = {};
              allProjectPlots.forEach((_: any, idx: number) => {
                const savedLU = allProjectPlots[idx]?.luChecked;
                initialChecked[idx] = (savedLU && typeof savedLU === "object" && !Array.isArray(savedLU))
                  ? savedLU
                  : { A: true, A302: true };
              });
              allPlotsCheckedRef.current = initialChecked;
              handleLandUseChange(initialChecked);
            } else {
              needsPlantationSearchRef.current = true;
            }

            setParcelFeatures(initialParcelFeatures);

            const refMap = mapRef.current;
            if (refMap) {
              if (refMap.getSource("matched-parcels")) {
                const sourceFeats = hasExistingLuData ? initialParcelFeatures : feats;
                (refMap.getSource("matched-parcels") as maplibregl.GeoJSONSource).setData({
                  type: "FeatureCollection",
                  features: sourceFeats,
                });
              }

              const bounds = new maplibregl.LngLatBounds();
              feats.forEach(f => {
                const geom = f.geometry as any;
                const coords = geom.type === "Polygon" ? geom.coordinates[0] : geom.coordinates[0][0];
                coords.forEach((coord: any) => bounds.extend(coord));
              });
              if (!bounds.isEmpty()) {
                const isMob = typeof window !== "undefined" && window.innerWidth < 768;
                const pad = isMob
                  ? { top: 60, bottom: 350, left: 60, right: 60 }
                  : { top: 80, bottom: 80, left: 80, right: 420 };
                try {
                  refMap.fitBounds(bounds, { padding: pad, duration: 700, maxZoom: 17 });
                } catch (e) {
                  refMap.fitBounds(bounds, { padding: 60, duration: 700, maxZoom: 17 });
                }
              }
            }
          }
        } catch (err) {
          console.error("Failed to load project plots for add-plot mode", err);
        }
      };
      loadForDisplay();
    }

    if (projName && (action || plotId) && drawnParcels.length === 0) {
      const load = async () => {
        try {
          const apiUrl = `/api/plots?name=${encodeURIComponent(projName!)}`;
          const apiRes = await fetch(apiUrl);
          const apiData = apiRes.ok ? await apiRes.json() : { plots: [] };
          // Filter client-side by project name as safety net
          const allProjectPlots: any[] = (Array.isArray(apiData.plots) ? apiData.plots : [])
            .filter((p: any) => String(p.name || "").toLowerCase() === String(projName).toLowerCase());
          console.log("[AUTO-LOAD] API plots for:", projName, allProjectPlots);
          const projectPlots = allProjectPlots;
          console.log("[AUTO-LOAD] projectPlots for:", projName, projectPlots);

          if (projectPlots.length > 0) {
            const feats: GeoJSON.Feature[] = projectPlots.map((p: any, i: number) => ({
              type: "Feature",
              geometry: p.geojson,
              properties: {
                ...p,
                plot_index: String(i + 1),
                grow_area: p.areaRai,
                grow_year: p.plantYearBE,
                province: p.province
              }
            }));

            let visibleFeats = feats;
            let hiddenFeats: GeoJSON.Feature[] = [];

            if (plotId) {
              // Try to find by exact id match first
              let editedPlot = feats.find(f => (f.properties as any).id === plotId);
              // Fallback: try matching by string comparison
              if (!editedPlot) {
                editedPlot = feats.find(f => String((f.properties as any).id) === String(plotId));
              }
              if (editedPlot) {
                visibleFeats = [editedPlot];
                hiddenFeats = feats.filter(f => (f.properties as any).id !== (editedPlot as GeoJSON.Feature).properties?.id);
                // Store original project plots so save can merge only the edited one
                const rawPlots = allProjectPlots.map(({ dbProjectId: _ignore, ...rest }: any) => rest);
                setExistingProjectPlots(rawPlots);
                setEditingPlotId(plotId);
              } else {
                // plotId specified but no match found — show only first plot to avoid showing all
                console.warn("[AUTO-LOAD] plotId not found in project plots, showing first plot. plotId:", plotId, "available ids:", feats.map(f => (f.properties as any).id));
                visibleFeats = feats.slice(0, 1);
                hiddenFeats = feats.slice(1);
                const rawPlots = allProjectPlots.map(({ dbProjectId: _ignore, ...rest }: any) => rest);
                setExistingProjectPlots(rawPlots);
                const firstId = (feats[0]?.properties as any)?.id ?? null;
                setEditingPlotId(firstId);
              }
            }

            setDrawnParcels(visibleFeats);

            const hasExistingLuData = visibleFeats.some(f => {
              const luPolys = (f.properties as any)?.backendData?.lu_polygon;
              return Array.isArray(luPolys) && luPolys.length > 0;
            });

            const initialParcelFeatures: GeoJSON.Feature[] = [];
            visibleFeats.forEach(f => {
              const luPolys = (f.properties as any)?.backendData?.lu_polygon;
              if (Array.isArray(luPolys) && luPolys.length > 0) {
                initialParcelFeatures.push(...luPolys);
              } else {
                initialParcelFeatures.push(f);
              }
            });

            if (hasExistingLuData) {
              // Restore per-plot LU checked state from saved data so fills render immediately
              const initialChecked: Record<number, Record<string, boolean>> = {};
              visibleFeats.forEach((f, idx) => {
                const saved = (f.properties as any)?.luChecked;
                initialChecked[idx] = (saved && typeof saved === 'object' && !Array.isArray(saved))
                  ? saved
                  : { A: true, A302: true };
              });
              allPlotsCheckedRef.current = initialChecked;
            } else {
              needsPlantationSearchRef.current = true;
            }

            setParcelFeatures(initialParcelFeatures);
            setHiddenProjectPlots(hiddenFeats);
            setSearchCount(visibleFeats.length);
            if (projectPlots[0].boundaryGeojson) {
              setDrawnGeometry(projectPlots[0].boundaryGeojson as GeoJSON.Geometry);
            }
            setCurrentStep(2);
            setIsPanelOpen(true);
            setStatus(`เตรียมประมวลผลคาร์บอนสำหรับโครงการ: ${projName}`);

            const map = mapRef.current;
            if (map) {
              if (map.getSource("matched-parcels")) {
                // Use LU features (with lu_class) when cached data exists, else plot boundaries
                const sourceFeats = hasExistingLuData ? initialParcelFeatures : visibleFeats;
                (map.getSource("matched-parcels") as maplibregl.GeoJSONSource).setData({ type: "FeatureCollection", features: sourceFeats });
              }

              const bounds = new maplibregl.LngLatBounds();
              visibleFeats.forEach(f => {
                const geom = f.geometry as any;
                const coords = geom.type === 'Polygon'
                  ? geom.coordinates[0]
                  : geom.coordinates[0][0];
                coords.forEach((coord: any) => bounds.extend(coord));
              });
              if (!bounds.isEmpty()) {
                const isMob = typeof window !== "undefined" && window.innerWidth < 768;
                const pad = isMob
                  ? { top: 60, bottom: 350, left: 60, right: 60 }
                  : { top: 80, bottom: 80, left: 80, right: 420 };
                try {
                  map.fitBounds(bounds, { padding: pad, duration: 700, maxZoom: 17 });
                } catch (e) {
                  map.fitBounds(bounds, { padding: 60, duration: 700, maxZoom: 17 });
                }
              }
            }
          }
        } catch (err) {
          console.error("Failed to auto-load project for calculation", err);
        }
      };
      load();
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
      const features: GeoJSON.Feature[] = [];
      verts.forEach((v, vIdx) => {
        // Real vertex
        features.push({
          type: "Feature",
          id: vIdx * 2,
          geometry: { type: "Point", coordinates: v },
          properties: { isMid: false, vIdx }
        });

        // Midpoint between this and next vertex
        if (vIdx < verts.length - 1) {
          const nextV = verts[vIdx + 1];
          features.push({
            type: "Feature",
            id: vIdx * 2 + 1,
            geometry: { type: "Point", coordinates: [(v[0] + nextV[0]) / 2, (v[1] + nextV[1]) / 2] },
            properties: { isMid: true, vIdx }
          });
        } else if (verts.length >= 3) {
          // Close the loop midpoint
          const firstV = verts[0];
          features.push({
            type: "Feature",
            id: vIdx * 2 + 1,
            geometry: { type: "Point", coordinates: [(v[0] + firstV[0]) / 2, (v[1] + firstV[1]) / 2] },
            properties: { isMid: true, vIdx }
          });
        }
      });

      vertsSrc.setData({
        type: "FeatureCollection",
        features,
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

    setPlotsSaved(false);
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

    if (map && !skipFit) {
      const bounds = new maplibregl.LngLatBounds();
      ring.forEach(c => bounds.extend(c as [number, number]));
      if (!bounds.isEmpty()) {
        const isMob = typeof window !== "undefined" && window.innerWidth < 768;
        const pad = isMob
          ? { top: 60, bottom: 350, left: 60, right: 60 }
          : { top: 60, bottom: 60, left: 60, right: 380 };

        try {
          map.fitBounds(bounds, { padding: pad, duration: 700, maxZoom: 17 });
        } catch (e) {
          // fallback if padding exceeds container dimensions
          map.fitBounds(bounds, { padding: 40, duration: 700, maxZoom: 17 });
        }
      }
    }

    // Reset current drawing vertices
    vertsRef.current = [];
    setVertCount(0);
  }, []);

  // Map click / dblclick / Escape handlers — keep refs in sync
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onClick = (e: maplibregl.MapMouseEvent) => {
      if (!drawingRef.current) return;
      // skip click if it was the end of a vertex drag (mouse or touch)
      if (wasDragging) { wasDragging = false; return; }
      if (drawTouchWasDragging) { drawTouchWasDragging = false; return; }
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

    const onContextMenu = (e: maplibregl.MapMouseEvent) => {
      e.preventDefault();
      if (!drawingRef.current) return;

      const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
        [e.point.x - 15, e.point.y - 15],
        [e.point.x + 15, e.point.y + 15]
      ];
      const features = map.queryRenderedFeatures(bbox, { layers: ['draw-verts-l'] });
      if (features.length) {
        const f = features[0];
        const isMid = f.properties?.isMid;
        const vIdx = f.properties?.vIdx;

        if (!isMid && vIdx !== undefined && vertsRef.current.length > 0) {
          const newPts = [...vertsRef.current];
          newPts.splice(vIdx, 1);
          vertsRef.current = newPts;
          setVertCount(newPts.length);
          previewDraw();

          // Check if area is now <= 500 rai, if so, clear area error
          if (newPts.length >= 3) {
            const sqm = polygonAreaM2([...newPts, newPts[0]]);
            if ((sqm / 1600) <= 500) {
              setAreaError(null);
            }
          } else {
            setAreaError(null);
          }
          return;
        }
      }

      if (vertsRef.current.length < 3) return;
      finishDraw();
    };

    // ── Vertex drag during drawing mode ──────────────────────────────────────
    let dragIdx = -1;
    let wasDragging = false;
    let hoveredDrawVertId: number | null = null;

    // Touch drag for drawing-mode vertices (mobile)
    let drawTouchDragIdx = -1;
    let drawTouchWasDragging = false;

    const onDrawTouchStart = (e: maplibregl.MapTouchEvent) => {
      if (!drawingRef.current) return;
      const TOUCH_RADIUS = 30;
      const touchPt = e.point;
      let bestDist = TOUCH_RADIUS;
      let bestIdx = -1;
      vertsRef.current.forEach((v, idx) => {
        const screenPt = map.project(v as [number, number]);
        const d = Math.hypot(touchPt.x - screenPt.x, touchPt.y - screenPt.y);
        if (d < bestDist) { bestDist = d; bestIdx = idx; }
      });
      if (bestIdx === -1) return;
      e.preventDefault();
      drawTouchDragIdx = bestIdx;
      drawTouchWasDragging = false;
      map.dragPan.disable();
      map.on('touchmove', onDrawTouchMove);
      map.on('touchend', onDrawTouchEnd);
    };

    const onDrawTouchMove = (e: maplibregl.MapTouchEvent) => {
      if (!drawingRef.current || drawTouchDragIdx === -1) return;
      const touch = (e.lngLats && e.lngLats.length > 0) ? e.lngLats[0] : e.lngLat;
      if (!touch) return;
      drawTouchWasDragging = true;
      const screenPt = map.project([touch.lng, touch.lat] as [number, number]);
      const snapCoord = findSnapTarget(screenPt, -1);
      const newCoord = snapCoord ?? [touch.lng, touch.lat];

      if (vertsRef.current.length >= 3) {
         const oldRai = polygonAreaM2([...vertsRef.current, vertsRef.current[0]]) / 1600;
         const testPts = [...vertsRef.current];
         testPts[drawTouchDragIdx] = newCoord as [number, number];
         const newRai = polygonAreaM2([...testPts, testPts[0]]) / 1600;
         if (newRai > 500 && newRai > oldRai) {
            setAreaError({ rai: newRai, sqm: newRai * 1600 });
            onDrawTouchEnd();
            return;
         }
      }

      vertsRef.current[drawTouchDragIdx] = newCoord as [number, number];
      setSnapIndicator(snapCoord);
      previewDraw();
    };

    const onDrawTouchEnd = () => {
      if (drawTouchDragIdx !== -1) {
        map.dragPan.enable();
        map.off('touchmove', onDrawTouchMove);
        map.off('touchend', onDrawTouchEnd);
        drawTouchDragIdx = -1;
        setSnapIndicator(null);
      }
    };

    const onDrawMouseMove = (ev: maplibregl.MapMouseEvent) => {
      if (!drawingRef.current) return;
      if (dragIdx !== -1) {
        // actively dragging
        wasDragging = true;
        const snapCoord = findSnapTarget(ev.point, -1);
        const newCoord = snapCoord ?? [ev.lngLat.lng, ev.lngLat.lat];

        if (vertsRef.current.length >= 3) {
           const oldRai = polygonAreaM2([...vertsRef.current, vertsRef.current[0]]) / 1600;
           const testPts = [...vertsRef.current];
           testPts[dragIdx] = newCoord as [number, number];
           const newRai = polygonAreaM2([...testPts, testPts[0]]) / 1600;
           if (newRai > 500 && newRai > oldRai) {
              setAreaError({ rai: newRai, sqm: newRai * 1600 });
              onDrawMouseUp();
              return;
           }
        }

        vertsRef.current[dragIdx] = newCoord as [number, number];
        setSnapIndicator(snapCoord);
        previewDraw();
        return;
      }

      // Query draw-verts-l layer
      const features = map.queryRenderedFeatures(ev.point, { layers: ['draw-verts-l'] });
      if (features.length) {
        const f = features[0];
        const isMid = f.properties?.isMid;
        if (isMid) {
          map.getCanvas().style.cursor = cursorAddNode;
        } else {
          map.getCanvas().style.cursor = 'grab';
        }

        if (f.id !== undefined && f.id !== hoveredDrawVertId) {
          if (hoveredDrawVertId !== null) {
            map.setFeatureState({ source: 'draw-verts', id: hoveredDrawVertId }, { hover: false });
          }
          hoveredDrawVertId = f.id as number;
          map.setFeatureState({ source: 'draw-verts', id: hoveredDrawVertId }, { hover: true });
        }
      } else {
        map.getCanvas().style.cursor = 'crosshair';
        if (hoveredDrawVertId !== null) {
          map.setFeatureState({ source: 'draw-verts', id: hoveredDrawVertId }, { hover: false });
          hoveredDrawVertId = null;
        }
      }
    };

    const onDrawMouseDown = (e: maplibregl.MapMouseEvent) => {
      if (!drawingRef.current) return;

      // Only allow Left-Click (button === 0) for dragging in drawing mode
      if (e.originalEvent && e.originalEvent.button !== 0) return;

      const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
        [e.point.x - 15, e.point.y - 15],
        [e.point.x + 15, e.point.y + 15]
      ];
      const features = map.queryRenderedFeatures(bbox, { layers: ['draw-verts-l'] });
      if (features.length) {
        const f = features[0];
        const isMid = f.properties?.isMid;
        const vIdx = f.properties?.vIdx;

        if (isMid) {
          const newPts = [...vertsRef.current];
          const ptCoords = f.geometry.type === "Point" ? (f.geometry.coordinates as [number, number]) : null;
          if (ptCoords) {
            newPts.splice(vIdx + 1, 0, ptCoords);
            vertsRef.current = newPts;
            setVertCount(newPts.length);
            previewDraw();

            // Drag this new node immediately
            dragIdx = vIdx + 1;
            wasDragging = false;
            map.getCanvas().style.cursor = 'grabbing';
            map.dragPan.disable();
            e.preventDefault();
          }
        } else {
          dragIdx = vIdx;
          wasDragging = false;
          map.getCanvas().style.cursor = 'grabbing';
          map.dragPan.disable();
          e.preventDefault();
        }
      }
    };

    const onDrawMouseUp = () => {
      if (dragIdx !== -1) {
        dragIdx = -1;
        map.getCanvas().style.cursor = 'grab';
        map.dragPan.enable();
        setSnapIndicator(null);
      }
    };

    map.on("click", onClick);
    map.on("dblclick", onDbl);
    map.on("contextmenu", onContextMenu);
    map.on("mousemove", onDrawMouseMove);
    map.on("mousedown", onDrawMouseDown);
    map.on("mouseup", onDrawMouseUp);
    map.on("touchstart", onDrawTouchStart);

    return () => {
      map.off("click", onClick);
      map.off("dblclick", onDbl);
      map.off("contextmenu", onContextMenu);
      map.off("mousemove", onDrawMouseMove);
      map.off("mousedown", onDrawMouseDown);
      map.off("mouseup", onDrawMouseUp);
      map.off("touchstart", onDrawTouchStart);
      map.off("touchmove", onDrawTouchMove);
      map.off("touchend", onDrawTouchEnd);
      map.dragPan.enable();
      if (hoveredDrawVertId !== null) {
        map.setFeatureState({ source: 'draw-verts', id: hoveredDrawVertId }, { hover: false });
      }
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

  const startDrawFlow = async () => {
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

    if (drawnParcels.length === 0) {
      if (locationMethod === "coord") {
        if (coordMode === "latlng") {
          const la = parseFloat(coordLat.replace(/,/g, '')), lo = parseFloat(coordLng.replace(/,/g, ''));
          if (!isNaN(la) && !isNaN(lo) && la >= -90 && la <= 90 && lo >= -180 && lo <= 180) {
            map.flyTo({ center: [lo, la], zoom: 15, duration: 1800, essential: true });
          }
        } else {
          const ev = parseFloat(coordE.replace(/,/g, '')), nv = parseFloat(coordN.replace(/,/g, ''));
          if (!isNaN(ev) && !isNaN(nv)) {
            try {
              const { lat: la, lng: lo } = utmToLatLng(ev, nv, coordUtmZone, true);
              if (la >= -90 && la <= 90 && lo >= -180 && lo <= 180) {
                map.flyTo({ center: [lo, la], zoom: 15, duration: 1800, essential: true });
              }
            } catch { /* ignore invalid coords */ }
          }
        }
      }
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
    setPlotsSaved(false);
    setProjectType(null);
    setCoordLat("");
    setCoordLng("");
    setCoordE("");
    setCoordN("");
    setCoordUtmZone(47);
    setSelectedRegion("");
    setSelectedProvince("");
    setSelectedAmphoe("");
    setSelectedTambon("");
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
      const featToDelete = prev[idx];
      const dbId = featToDelete?.properties?.dbProjectId;
      if (dbId) {
        fetch(`/api/plots/${dbId}`, { method: 'DELETE' }).catch(console.error);
      }

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
      setAreaError({ rai: totalRai, sqm: totalDrawnArea, tooSmall: true });
      return;
    }

    // Build combined geometry only for drawnGeometry state tracking
    const rings: GeoJSON.Position[][][] = drawnParcels.flatMap(p => {
      if (p.geometry.type === "Polygon") return [(p.geometry as GeoJSON.Polygon).coordinates];
      if (p.geometry.type === "MultiPolygon") return (p.geometry as GeoJSON.MultiPolygon).coordinates;
      return [];
    });
    setDrawnGeometry({ type: "MultiPolygon", coordinates: rings });
    setSearchRunning(true);
    setSearchErr(null);
    setSearchCount(null);
    setSearchTruncated(false);

    try {
      const allFeatures: GeoJSON.Feature[] = [];
      const allLUStats: { lu_class: string; area_percent: number }[] = [];
      const allRawPlantationInfo: any[] = [];

      // Send one request per parcel — avoids 500 errors from combined MultiPolygon
      // and ensures each parcel's LU data is assigned directly by index
      for (let pi = 0; pi < drawnParcels.length; pi++) {
        const parcel = drawnParcels[pi];
        const plotIndexStr = (parcel.properties as any)?.plot_index || String(pi + 1);
        try {
          const result = await getPlantationInfo({
            id: `parcel-${pi}-${Date.now()}`,
            geometry: sanitizePolygonForApi(parcel.geometry),
            project_type: activeProjType,
            output_crs: "EPSG:4326",
          });
          console.log(`[KeptCarbon] plantation-info parcel ${pi}:`, JSON.stringify(result, null, 2));
          allRawPlantationInfo.push(result);

          const luPolygons = result.lu_polygon ?? [];
          if (luPolygons.length > 0) {
            luPolygons.forEach(lu => {
              allLUStats.push({ lu_class: lu.lu_class, area_percent: lu.area_percent });
              allFeatures.push({
                type: "Feature",
                geometry: lu.geometry,
                properties: {
                  plot_index: plotIndexStr,
                  lu_class: lu.lu_class,
                  lu_class_desc_th: lu.lu_class_desc_th,
                  area_m2: lu.area_m2,
                  area_percent: lu.area_percent,
                },
              });
            });
          } else {
            // No LU data returned — use the drawn parcel as a fallback feature
            allFeatures.push({
              type: "Feature",
              geometry: parcel.geometry,
              properties: {
                plot_index: plotIndexStr,
                lu_class: null,
                lu_class_desc_th: null,
                area_m2: null,
                area_percent: null,
              },
            });
          }
          if (result.status.status === "error") {
            const sc = result.status.status_code;
            throw new Error(`[API_ERR]${sc || ""}|${result.status.message || ""}`);
          }
        } catch (parcelErr) {
          console.error(`[KeptCarbon] plantation-info error parcel ${pi}:`, parcelErr);

          const errMsg = parcelErr instanceof Error ? parcelErr.message : String(parcelErr);

          let sc = "";
          let backendMessage = "";

          if (errMsg.startsWith("[API_ERR]")) {
            const parts = errMsg.substring(9).split("|");
            sc = parts[0];
            backendMessage = parts[1] || "";
          } else {
            let backendErrData: any = null;
            const jsonMatch = errMsg.match(/Backend API error: \d+ (\{.*\})/);
            if (jsonMatch && jsonMatch[1]) {
              try { backendErrData = JSON.parse(jsonMatch[1]); } catch (e) { }
            }
            sc = backendErrData?.status_code || backendErrData?.status?.status_code || "";
            backendMessage = backendErrData?.message || backendErrData?.status?.message || "";
          }

          if (sc === "E01" || errMsg.includes('"status_code":"E01"') || errMsg.includes('"E01"')) {
            throw new Error("พื้นที่ไม่อยู่ในขอบเขตประเทศไทย กรุณาระบุพื้นที่ใหม่");
          }
          if (sc === "E02" || errMsg.includes('"status_code":"E02"') || errMsg.includes('"E02"')) {
            throw new Error("พื้นที่ที่กำหนดไม่อยู่ในพื้นที่ที่ให้บริการ กรุณาระบุพื้นที่ใหม่");
          }
          if (sc === "E04" || errMsg.includes('"status_code":"E04"') || errMsg.includes('"E04"')) {
            throw new Error("ไม่พบข้อมูลปีปลูกในฐานข้อมูล กรุณาระบุปีปลูก (พ.ศ.) ในช่องกรอกข้อมูล");
          }

          // If it's a validation error or known English error, we should probably throw it too, 
          // but for general errors, maybe we can fallback to allow the user to manually enter data
          const engMsg = backendMessage.toLowerCase();
          if (engMsg.includes("invalid") && engMsg.includes("polygon") || errMsg.toLowerCase().includes("invalid polygon")) {
            throw new Error("รูปทรงหรือขอบเขตพื้นที่ไม่ถูกต้อง กรุณาลบแล้ววาดแปลงใหม่");
          }
          if (engMsg.includes("geometry") || errMsg.toLowerCase().includes("geometry")) {
            throw new Error("ข้อมูลพิกัดพื้นที่ไม่ถูกต้อง กรุณาลบแล้ววาดแปลงใหม่");
          }

          // Fallback: use drawn parcel geometry when API fails for other unknown reasons
          allFeatures.push({
            type: "Feature",
            geometry: parcel.geometry,
            properties: {
              plot_index: plotIndexStr,
              lu_class: null,
              lu_class_desc_th: null,
              area_m2: null,
              area_percent: null,
            },
          });

          allRawPlantationInfo.push({
            polygon_id: `parcel-${pi}-${Date.now()}`,
            province_code: "",
            geometry: sanitizePolygonForApi(parcel.geometry),
            area_m2: polygonAreaM2((parcel.geometry as any).coordinates[0] as any),
            status: { status: "error", status_code: sc, message: backendMessage },
            lu_polygon: []
          });
        }
      }

      setRawPlantationInfo(allRawPlantationInfo);

      const map = mapRef.current;
      if (map && mapLoadedRef.current) {
        (map.getSource("matched-parcels") as maplibregl.GeoJSONSource | undefined)
          ?.setData({ type: "FeatureCollection", features: allFeatures });
        handleLandUseChange(allPlotsCheckedRef.current);
        if (allFeatures.length > 0) {
          // Zoom to perfectly fit the newly drawn plot (the last one in drawnParcels)
          const lastParcel = drawnParcels[drawnParcels.length - 1];
          if (lastParcel) {
            const bounds = new maplibregl.LngLatBounds();
            const geom = lastParcel.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon;
            if (geom.type === 'Polygon') {
              geom.coordinates[0].forEach((coord: any) => bounds.extend(coord));
            } else if (geom.type === 'MultiPolygon') {
              geom.coordinates[0][0].forEach((coord: any) => bounds.extend(coord));
            }
            if (!bounds.isEmpty()) {
              map.fitBounds(bounds, {
                padding: 60,
                duration: 1600,
                easing: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
              });
            }
          }
        }
      }

      setParcelFeatures(allFeatures);

      if (allLUStats.length === 0) {
        const hasRealLU = allFeatures.some(f => f.properties?.lu_class != null);
        if (hasRealLU) {
          setSearchCount(allFeatures.length);
          setStatus("พบข้อมูลบางส่วน");
        } else {
          // No LU data back from API — proceed with empty data so the form still opens
          setSearchCount(0);
          setStatus("ไม่พบข้อมูลการใช้ที่ดิน — สามารถกรอกข้อมูลแปลงต่อได้");
        }
      } else {
        const rubberStats = allLUStats.filter(lu => lu.lu_class === "A302");
        const rubberPct = drawnParcels.length > 0
          ? rubberStats.reduce((s, lu) => s + lu.area_percent, 0) / drawnParcels.length
          : 0;
        setSearchCount(allLUStats.length);
        const rubberNote = rubberStats.length > 0 ? ` · ยางพารา A302 ${rubberPct.toFixed(1)}%` : " · ไม่พบยางพารา";
        setStatus(`พบ ${allLUStats.length} พื้นที่ใช้ที่ดิน${rubberNote}`);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);

      if (errorMsg === "พื้นที่ที่ระบุไม่อยู่ในขอบเขตประเทศไทย กรุณาลบแล้ววาดแปลงใหม่" ||
        errorMsg === "พื้นที่ที่ระบุไม่อยู่ในจังหวัดที่ให้บริการ กรุณาลบแล้ววาดแปลงใหม่" ||
        errorMsg === "รูปทรงหรือขอบเขตพื้นที่ไม่ถูกต้อง กรุณาลบแล้ววาดแปลงใหม่" ||
        errorMsg === "ข้อมูลพิกัดพื้นที่ไม่ถูกต้อง กรุณาลบแล้ววาดแปลงใหม่") {

        setErrorPopup({
          title: "ไม่สามารถดำเนินการได้",
          desc: errorMsg
        });
      } else if (errorMsg === "ไม่พบข้อมูลปีปลูกในฐานข้อมูล กรุณาระบุปีปลูก (พ.ศ.) ในช่องกรอกข้อมูล") {
        setErrorPopup({
          title: "แจ้งเตือนข้อมูล",
          desc: errorMsg
        });
      } else {
        setSearchErr(errorMsg);
      }
    } finally {
      setSearchRunning(false);
    }
  }, [drawnParcels, totalDrawnArea, handleLandUseChange, projectType]);

  const handleProjectTypeChange = useCallback((type: "replanting" | "existing") => {
    setProjectType(type);
  }, []);

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
        setAreaError({ rai: totalRai, sqm: totalSqm, tooSmall: true });
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
  const switchBasemap = (mode: "hybrid" | "sat" | "street" | "topo") => {
    setBasemap(mode);
    const map = mapRef.current;
    if (!map) return;
    (["hybrid", "sat", "street", "topo"] as const).forEach((m) => {
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
      { padding: 80, duration: 1800, maxZoom: 18, easing: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t },
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
            title="เปลี่ยนแผนที่"
            onClick={() => setBasemapOpen((v) => !v)}
          >
            <i className="bi bi-layers" />
          </button>
        </div>

        {/* Basemap card */}
        <div className={`mds-basemap-card${basemapOpen ? " open" : ""}`}>
          <div className="mds-basemap-header">
            <span><i className="bi bi-layers me-1" /> แผนที่</span>
            <i className="bi bi-x" style={{ cursor: "pointer", fontSize: 18 }} onClick={() => setBasemapOpen(false)} />
          </div>
          {(["hybrid", "sat", "street", "topo"] as const).map((m) => (
            <div
              key={m}
              className={`mds-basemap-option${basemap === m ? " active" : ""}`}
              onClick={() => switchBasemap(m)}
            >
              <i className={(m === "hybrid" || m === "sat") ? "bi bi-globe-asia-australia" : m === "street" ? "bi bi-map" : "bi bi-tree"} />
              {m === "hybrid" ? (
                <span>ดาวเทียม <br/>(Google map)</span>
              ) : m === "sat" ? "ดาวเทียม (ดั้งเดิม)" : m === "street" ? "ถนน " : "ภูมิประเทศ"}
            </div>
          ))}
        </div>

        {/* Welcome hint card — points at the green panel toggle button */}
        {!isPanelOpen && showWelcomeHint && (
          <div
            style={{
              position: "fixed",
              top: "168px",
              right: "8px",
              zIndex: 9000,
              width: "220px",
              background: "#fff",
              borderRadius: "16px",
              boxShadow: "0 12px 40px rgba(5,150,105,0.2), 0 2px 8px rgba(0,0,0,0.1)",
              border: "1.5px solid rgba(16,185,129,0.3)",
              padding: "16px",
              animation: "welcomeCardIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)"
            }}
          >
            {/* Arrow pointing up toward the green toggle button */}
            <div style={{
              position: "absolute", top: -9, right: 22,
              width: 0, height: 0,
              borderLeft: "9px solid transparent",
              borderRight: "9px solid transparent",
              borderBottom: "9px solid rgba(16,185,129,0.3)"
            }} />
            <div style={{
              position: "absolute", top: -8, right: 23,
              width: 0, height: 0,
              borderLeft: "8px solid transparent",
              borderRight: "8px solid transparent",
              borderBottom: "8px solid #fff"
            }} />

            {/* Close */}
            <button
              onClick={() => setShowWelcomeHint(false)}
              style={{
                position: "absolute", top: 8, right: 8,
                background: "none", border: "none", cursor: "pointer",
                color: "#94a3b8", fontSize: 13, padding: "2px 4px",
                lineHeight: 1, borderRadius: 4
              }}
            >
              <i className="bi bi-x-lg" />
            </button>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={{
                width: 38, height: 38, borderRadius: "50%",
                background: "linear-gradient(135deg, #10b981, #059669)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontSize: 17, flexShrink: 0,
                boxShadow: "0 4px 12px rgba(5,150,105,0.35)"
              }}>
                <i className="bi bi-hand-index-thumb-fill" />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#065f46", lineHeight: 1.2 }}>
                  เริ่มต้นที่นี่!
                </div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>ขั้นตอนแรก</div>
              </div>
            </div>

            <p style={{ fontSize: 12.5, color: "#475569", lineHeight: 1.6, margin: "0 0 14px", paddingRight: 8 }}>
              กดปุ่ม{" "}
              <span style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                background: "linear-gradient(135deg, #2d9e5f, #0d9488)",
                color: "#fff", borderRadius: "50%", width: 18, height: 18,
                fontSize: 9, verticalAlign: "middle"
              }}>
                <i className="bi bi-clipboard2-data-fill" />
              </span>{" "}
              <strong style={{ color: "#059669" }}>สีเขียว</strong> ด้านบนขวา<br />
              เพื่อเปิดแผงและเริ่มวาดแปลง
            </p>

            <button
              onClick={() => { setShowWelcomeHint(false); setIsPanelOpen(true); }}
              style={{
                width: "100%", padding: "9px 0", borderRadius: 10,
                background: "linear-gradient(135deg, #10b981, #059669)",
                color: "#fff", border: "none", fontSize: 12.5, fontWeight: 700,
                cursor: "pointer", display: "flex", alignItems: "center",
                justifyContent: "center", gap: 6,
                boxShadow: "0 4px 12px rgba(5,150,105,0.3)"
              }}
            >
              <i className="bi bi-clipboard2-data-fill" /> เปิดแผงเครื่องมือ
            </button>

            <style>{`
              @keyframes welcomeCardIn {
                from { opacity: 0; transform: translateY(-10px) scale(0.92); }
                to { opacity: 1; transform: translateY(0) scale(1); }
              }
            `}</style>
          </div>
        )}

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
              <div className="mds-panel-topbar-title">KeptCarbon</div>
              <div className="mds-panel-topbar-sub">ระบบประเมินคาร์บอนเครดิต</div>
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

        {/* ── Custom Stepper Styles Override ── */}
        <style>{`
          .mds-stepper .mds-step-circle {
            width: 30px !important;
            height: 30px !important;
            min-width: 30px !important;
            font-size: 11.5px !important;
          }
          .mds-stepper .mds-step:not(:last-of-type)::after {
            top: 15px !important;
            left: calc(50% + 15px) !important;
            right: calc(-50% + 15px) !important;
          }
          .mds-stepper .mds-step.active .mds-step-circle {
            transform: scale(1.1) !important;
          }
          .mds-stepper .mds-step-label {
            font-size: 10.5px !important;
            font-weight: 700 !important;
          }
          /* Clickable steps */
          .mds-stepper .mds-step.clickable {
            cursor: pointer !important;
          }
          .mds-stepper .mds-step.clickable:hover .mds-step-circle {
            box-shadow: 0 0 0 6px rgba(31,174,89,0.18) !important;
            transform: scale(1.13) !important;
          }
          .mds-stepper .mds-step.clickable:hover .mds-step-label {
            color: #16a34a !important;
            text-decoration: underline !important;
          }
          /* Locked step (not yet reachable) */
          .mds-stepper .mds-step.locked {
            cursor: not-allowed !important;
            opacity: 0.4 !important;
          }
        `}</style>


        {/* ── Step Tracker ── */}
        <div className="mds-stepper">
          <div className="mds-steps-row">
            <div className="mds-stepper-track">
              <div className="mds-stepper-fill" style={{ width: `${(currentStep - 1) * 50}%` }} />
            </div>
            {([
              { n: 1 as const, label: "เริ่มกำหนดพื้นที่" },
              { n: 2 as const, label: "กรอกข้อมูล" },
              { n: 3 as const, label: "ประเมิน/บันทึก" },
            ]).map(({ n, label }) => {
              const isActive = currentStep === n;
              const isDone = currentStep > n;

              const step2Ready = drawnParcels.length > 0 && !(user && (!projectName.trim() || isDuplicateProjectName));
              const isClickable =
                (n === 1 && currentStep !== 1) ||
                (n === 2 && (currentStep === 3 || (currentStep === 1 && step2Ready)));
              const isLocked = n === 2 && currentStep === 1 && !step2Ready;

              const tooltip =
                n === 1
                  ? currentStep === 1 ? "ขั้นตอนปัจจุบัน" : "กลับไปวาดแปลง (ข้อมูลที่วาดจะถูกลบ)"
                  : n === 2
                    ? currentStep === 3 ? "กลับไปกรอกข้อมูล"
                      : step2Ready ? "ไปกรอกข้อมูลแปลง"
                        : "วาดพื้นที่บนแผนที่ก่อน"
                    : undefined;

              const cls = [
                "mds-step",
                isActive ? "active" : isDone ? "done" : "",
                isClickable ? "clickable" : "",
                isLocked ? "locked" : "",
              ].filter(Boolean).join(" ");

              return (
                <div
                  key={n}
                  className={cls}
                  title={tooltip}
                  onClick={isClickable ? () => handleStepClick(n) : undefined}
                >
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
                {!drawing && (
                  <div style={{ marginBottom: 16 }}>
                    {/* Province / Amphoe / Tambon + Coordinate */}
                    {drawnParcels.length === 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: user ? 16 : 0 }}>

                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                          {/* Tabs for Location Method */}
                          {/*
                          <div style={{ display: "flex", background: "#f1f5f9", borderRadius: 10, padding: 4 }}>
                            <button
                              onClick={() => setLocationMethod("area")}
                              style={{
                                flex: 1, padding: "8px", borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: "pointer", border: "none",
                                background: locationMethod === "area" ? "#fff" : "transparent",
                                color: locationMethod === "area" ? "#059669" : "#64748b",
                                boxShadow: locationMethod === "area" ? "0 2px 5px rgba(0,0,0,0.05)" : "none",
                                transition: "all 0.2s"
                              }}
                            >
                              <i className="bi bi-pin-map me-1" /> ค้นหาจากพื้นที่
                            </button>
                            <button
                              onClick={() => setLocationMethod("coord")}
                              style={{
                                flex: 1, padding: "8px", borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: "pointer", border: "none",
                                background: locationMethod === "coord" ? "#fff" : "transparent",
                                color: locationMethod === "coord" ? "#059669" : "#64748b",
                                boxShadow: locationMethod === "coord" ? "0 2px 5px rgba(0,0,0,0.05)" : "none",
                                transition: "all 0.2s"
                              }}
                            >
                              <i className="bi bi-crosshair2 me-1" /> กรอกค่าพิกัด
                            </button>
                          </div>
                          */}

                          {locationMethod === "area" ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                              {/* ภาค (Region) */}
                              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                <label style={{ fontSize: 14, fontWeight: 600, color: "#64748b" }}>ภาค</label>
                                <select className="prp-input" style={{ padding: "8px 5px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 15, background: "#fff", width: "100%" }} value={selectedRegion} onChange={(e) => { setSelectedRegion(e.target.value); setSelectedProvince(""); setSelectedAmphoe(""); setSelectedTambon(""); }}>
                                  <option value="">เลือกภาค...</option>
                                  {REGIONS_DATA.map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
                                </select>
                              </div>

                              {/* 3-column: Province / Amphoe / Tambon */}
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                  <label style={{ fontSize: 14, fontWeight: 600, color: "#64748b" }}>จังหวัด</label>
                                  <select className="prp-input" style={{ padding: "8px 5px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 15, background: selectedRegion ? "#fff" : "#f8fafc", color: selectedRegion ? "#0f172a" : "#94a3b8", width: "100%" }} value={selectedProvince} onChange={(e) => { setSelectedProvince(e.target.value); setSelectedAmphoe(""); setSelectedTambon(""); }} disabled={!selectedRegion}>
                                    <option value="">เลือกจังหวัด...</option>
                                    {selectedRegion && REGIONS_DATA.find(r => r.name === selectedRegion)?.provinces.map(p => <option key={p} value={p}>{p}</option>)}
                                  </select>
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                  <label style={{ fontSize: 14, fontWeight: 600, color: "#64748b" }}>อำเภอ</label>
                                  {amphoesFromDb.length > 0 ? (
                                    <select className="prp-input" style={{ padding: "8px 5px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 15, background: selectedProvince ? "#fff" : "#f8fafc", color: selectedProvince ? "#0f172a" : "#94a3b8", width: "100%" }} value={selectedAmphoe} onChange={(e) => { setSelectedAmphoe(e.target.value); setSelectedTambon(""); }} disabled={!selectedProvince}>
                                      <option value="">เลือกอำเภอ...</option>
                                      {amphoesFromDb.map(a => <option key={a} value={a}>{a}</option>)}
                                    </select>
                                  ) : AMPHOE_DATA[selectedProvince] ? (
                                    <select className="prp-input" style={{ padding: "8px 5px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 15, background: selectedProvince ? "#fff" : "#f8fafc", color: selectedProvince ? "#0f172a" : "#94a3b8", width: "100%" }} value={selectedAmphoe} onChange={(e) => { setSelectedAmphoe(e.target.value); setSelectedTambon(""); }} disabled={!selectedProvince}>
                                      <option value="">เลือกอำเภอ...</option>
                                      {AMPHOE_DATA[selectedProvince].map(a => <option key={a} value={a}>{a}</option>)}
                                    </select>
                                  ) : (
                                    <select className="prp-input" style={{ padding: "8px 5px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 15, background: "#f8fafc", color: "#94a3b8", width: "100%" }} disabled>
                                      <option value="">{selectedProvince ? "กำลังโหลด..." : "เลือกจังหวัดก่อน"}</option>
                                    </select>
                                  )}
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                  <label style={{ fontSize: 14, fontWeight: 600, color: "#64748b" }}>ตำบล</label>
                                  {tambonsLoading ? (
                                    <select className="prp-input" style={{ padding: "8px 5px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 15, background: "#f8fafc", color: "#94a3b8", width: "100%" }} disabled>
                                      <option value="">กำลังโหลด...</option>
                                    </select>
                                  ) : tambonsFromDb.length > 0 ? (
                                    <select className="prp-input" style={{ padding: "8px 5px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 15, background: selectedAmphoe ? "#fff" : "#f8fafc", color: selectedAmphoe ? "#0f172a" : "#94a3b8", width: "100%" }} value={selectedTambon} onChange={e => setSelectedTambon(e.target.value)} disabled={!selectedAmphoe}>
                                      <option value="">เลือกตำบล...</option>
                                      {tambonsFromDb.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                  ) : selectedAmphoe ? (
                                    <input className="prp-input" style={{ padding: "8px 5px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 15, width: "100%", boxSizing: "border-box" }} placeholder="ตำบล..." value={selectedTambon} onChange={e => setSelectedTambon(e.target.value)} />
                                  ) : (
                                    <select className="prp-input" style={{ padding: "8px 5px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 15, background: "#f8fafc", color: "#94a3b8", width: "100%" }} disabled>
                                      <option value="">เลือกอำเภอก่อน</option>
                                    </select>
                                  )}
                                </div>
                              </div>
                              {!selectedRegion || !selectedProvince ? (
                                <div style={{ color: "#f59e0b", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                                  <i className="bi bi-exclamation-circle-fill" /> กรุณาเลือกภาคและจังหวัดเพื่อดำเนินการต่อ
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <div style={{ padding: "10px 12px", background: "linear-gradient(135deg,rgba(5,150,105,0.05),rgba(13,148,136,0.04))", border: "1px solid rgba(5,150,105,0.18)", borderRadius: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                <div style={{ fontSize: 14, fontWeight: 700, color: "#059669", display: "flex", alignItems: "center", gap: 5 }}>
                                  ระบบพิกัด
                                </div>
                                <div style={{ display: "flex", gap: 4 }}>
                                  {(["latlng", "utm"] as const).map(m => (
                                    <button key={m} onClick={() => setCoordMode(m)} style={{ padding: "3px 9px", borderRadius: 6, fontSize: 15, fontWeight: 700, cursor: "pointer", border: "none", background: coordMode === m ? "linear-gradient(135deg,#059669,#0d9488)" : "#f1f5f9", color: coordMode === m ? "#fff" : "#64748b", transition: "all 0.15s" }}>
                                      {m === "latlng" ? "Lat/Lng" : "UTM"}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              {coordMode === "latlng" ? (
                                <div style={{ display: "flex", gap: 6 }}>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 14, color: "#64748b", fontWeight: 600, marginBottom: 3 }}>Latitude</div>
                                    <input className="prp-input" style={{ padding: "7px 8px", borderRadius: 7, border: "1px solid #cbd5e1", fontSize: 15, width: "100%", boxSizing: "border-box" }} placeholder="เช่น 15.8700" value={coordLat} onChange={e => setCoordLat(e.target.value)} />
                                  </div>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 14, color: "#64748b", fontWeight: 600, marginBottom: 3 }}>Longitude</div>
                                    <input className="prp-input" style={{ padding: "7px 8px", borderRadius: 7, border: "1px solid #cbd5e1", fontSize: 15, width: "100%", boxSizing: "border-box" }} placeholder="เช่น 100.9925" value={coordLng} onChange={e => setCoordLng(e.target.value)} />
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                                    <span style={{ fontSize: 14, color: "#64748b", fontWeight: 600 }}>Zone:</span>
                                    {([47, 48] as const).map(z => (
                                      <button key={z} onClick={() => setCoordUtmZone(z)} style={{ padding: "3px 11px", borderRadius: 6, fontSize: 15, fontWeight: 700, cursor: "pointer", border: "none", background: coordUtmZone === z ? "linear-gradient(135deg,#059669,#0d9488)" : "#f1f5f9", color: coordUtmZone === z ? "#fff" : "#64748b", transition: "all 0.15s" }}>{z}N</button>
                                    ))}
                                    <span style={{ fontSize: 13, color: "#94a3b8" }}>{coordUtmZone === 47 ? "(ตะวันตก)" : "(ตะวันออก)"}</span>
                                  </div>
                                  <div style={{ display: "flex", gap: 6 }}>
                                    <div style={{ flex: 1 }}>
                                      <div style={{ fontSize: 14, color: "#64748b", fontWeight: 600, marginBottom: 3 }}>Easting (m)</div>
                                      <input className="prp-input" style={{ padding: "7px 8px", borderRadius: 7, border: "1px solid #cbd5e1", fontSize: 15, width: "100%", boxSizing: "border-box" }} placeholder="เช่น 560000" value={coordE} onChange={e => setCoordE(e.target.value)} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                      <div style={{ fontSize: 14, color: "#64748b", fontWeight: 600, marginBottom: 3 }}>Northing (m)</div>
                                      <input className="prp-input" style={{ padding: "7px 8px", borderRadius: 7, border: "1px solid #cbd5e1", fontSize: 15, width: "100%", boxSizing: "border-box" }} placeholder="เช่น 1750000" value={coordN} onChange={e => setCoordN(e.target.value)} />
                                    </div>
                                  </div>
                                </>
                              )}
                              <div style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic" }}>
                                <i className="bi bi-info-circle me-1" />กรอกพิกัด แล้วกด "เริ่มวาดแปลง" ได้เลย
                              </div>
                            </div>
                          )}
                        </div>

                      </div>
                    )}

                    {user && (
                      <>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#059669", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                          <i className="bi bi-folder2-open" /> ชื่อโครงการ <span style={{ color: "#ef4444" }}>*</span>
                        </div>
                        <input
                          className="prp-input"
                          style={{
                            marginBottom: 0,
                            width: "100%",
                            padding: "10px 14px",
                            borderRadius: "10px",
                            border: "1px solid #cbd5e1",
                            fontSize: "14px"
                          }}
                          placeholder="เช่น โครงการที่1"
                          value={projectName}
                          onChange={e => setProjectName(e.target.value)}
                        />
                        {isDuplicateProjectName && (
                          <div style={{ color: "#dc2626", fontSize: 12, marginTop: 6, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                            <i className="bi bi-exclamation-circle-fill" /> ชื่อโครงการนี้ถูกใช้งานแล้ว กรุณาใช้ชื่ออื่น
                          </div>
                        )}
                        {!projectName.trim() && (
                          <div style={{ color: "#f59e0b", fontSize: 12, marginTop: 6, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                            <i className="bi bi-exclamation-circle-fill" /> กรุณากรอกชื่อโครงการเพื่อดำเนินการต่อ
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Method selector */}
                {!drawing && (
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
                )}

                {/* ── Draw tab ── */}
                {tab === "draw" && (
                  <div className="mds-action-content">
                    {drawing ? (
                      /* ── Drawing in progress ── */
                      <div style={{
                        marginTop: 16,
                        width: "100%",
                        padding: isMobile() ? "24px 20px" : "12px 16px",
                        background: "rgba(220, 38, 38, 0.04)",
                        border: "1px dashed rgba(220, 38, 38, 0.3)",
                        borderRadius: "12px",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: isMobile() ? 16 : 8,
                        animation: "pulse-soft 2s infinite"
                      }}>
                        <div style={{
                          width: isMobile() ? "48px" : "36px",
                          height: isMobile() ? "48px" : "36px",
                          borderRadius: "50%",
                          background: "rgba(220, 38, 38, 0.1)", color: "#dc2626",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: isMobile() ? "20px" : "16px"
                        }}>
                          <i className="bi bi-vector-pen" />
                        </div>
                        <div style={{ textAlign: "center" }}>
                          <h3 style={{ margin: 0, fontSize: isMobile() ? "16px" : "14px", fontWeight: 700, color: "#0f172a" }}>กำลังวาดแปลง...</h3>
                        </div>
                        <button
                          className="mds-btn"
                          style={{
                            width: "100%",
                            padding: isMobile() ? "12px" : "10px",
                            background: "#ef4444",
                            color: "#fff",
                            border: "none",
                            borderRadius: "10px",
                            fontWeight: 700,
                            boxShadow: "0 4px 12px rgba(239,68,68,0.25)"
                          }}
                          onClick={clearDraw}
                        >
                          <i className="bi bi-x-circle" /> ยกเลิกการวาด
                        </button>
                        <style>{`
                          @keyframes pulse-soft {
                            0% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.1); }
                            70% { box-shadow: 0 0 0 10px rgba(220, 38, 38, 0); }
                            100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0); }
                          }
                        `}</style>
                      </div>
                    ) : (
                      /* ── Default: show instructions + start button ── */
                      <>
                        {drawnParcels.length === 0 && (
                          <ol className="mds-instr-list">
                            <li>คลิกปุ่ม <strong>&ldquo;เริ่มวาดแปลง&rdquo;</strong></li>
                            <li>คลิกบนแผนที่เพื่อเพิ่มจุดขอบเขต (อย่างน้อย 3 จุด)</li>
                            <li>
                              <span>จบการวาดด้วย</span>
                              <span style={{ display: "inline-flex", flexWrap: "wrap", alignItems: "center", gap: "5px", marginLeft: "5px" }}>
                                <span style={{ background: "rgba(5,150,105,0.12)", color: "#047857", padding: "2px 9px", borderRadius: "6px", fontWeight: 700, fontSize: "12px", whiteSpace: "nowrap" }}>เสร็จสิ้น</span>
                                <span style={{ color: "#cbd5e1", fontWeight: 400 }}>·</span>
                                <span style={{ background: "rgba(5,150,105,0.12)", color: "#047857", padding: "2px 9px", borderRadius: "6px", fontWeight: 700, fontSize: "12px", whiteSpace: "nowrap" }}>คลิกขวา</span>
                                <span style={{ color: "#cbd5e1", fontWeight: 400 }}>·</span>
                                <span style={{ background: "rgba(5,150,105,0.12)", color: "#047857", padding: "2px 9px", borderRadius: "6px", fontWeight: 700, fontSize: "12px", whiteSpace: "nowrap" }}>Double-click</span>
                              </span>
                            </li>
                          </ol>
                        )}

                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <button
                            className="mds-btn mds-btn-solid"
                            onClick={startDrawFlow}
                            style={{
                              background: ((user && (!projectName.trim() || isDuplicateProjectName)) || (drawnParcels.length === 0 && locationMethod === "area" && (!selectedRegion || !selectedProvince)) || (drawnParcels.length === 0 && locationMethod === "coord" && ((coordMode === "latlng" && (!coordLat || !coordLng)) || (coordMode === "utm" && (!coordE || !coordN)))) || isEditingPlotParam) ? "#cbd5e1" : undefined,
                              cursor: ((user && (!projectName.trim() || isDuplicateProjectName)) || (drawnParcels.length === 0 && locationMethod === "area" && (!selectedRegion || !selectedProvince)) || (drawnParcels.length === 0 && locationMethod === "coord" && ((coordMode === "latlng" && (!coordLat || !coordLng)) || (coordMode === "utm" && (!coordE || !coordN)))) || isEditingPlotParam) ? "not-allowed" : "pointer",
                              boxShadow: ((user && (!projectName.trim() || isDuplicateProjectName)) || (drawnParcels.length === 0 && locationMethod === "area" && (!selectedRegion || !selectedProvince)) || (drawnParcels.length === 0 && locationMethod === "coord" && ((coordMode === "latlng" && (!coordLat || !coordLng)) || (coordMode === "utm" && (!coordE || !coordN)))) || isEditingPlotParam) ? "none" : undefined,
                              color: ((user && (!projectName.trim() || isDuplicateProjectName)) || (drawnParcels.length === 0 && locationMethod === "area" && (!selectedRegion || !selectedProvince)) || (drawnParcels.length === 0 && locationMethod === "coord" && ((coordMode === "latlng" && (!coordLat || !coordLng)) || (coordMode === "utm" && (!coordE || !coordN)))) || isEditingPlotParam) ? "#fff" : undefined,
                              border: ((user && (!projectName.trim() || isDuplicateProjectName)) || (drawnParcels.length === 0 && locationMethod === "area" && (!selectedRegion || !selectedProvince)) || (drawnParcels.length === 0 && locationMethod === "coord" && ((coordMode === "latlng" && (!coordLat || !coordLng)) || (coordMode === "utm" && (!coordE || !coordN)))) || isEditingPlotParam) ? "none" : undefined
                            }}
                            disabled={!!((user && (!projectName.trim() || isDuplicateProjectName)) || (drawnParcels.length === 0 && locationMethod === "area" && (!selectedRegion || !selectedProvince)) || (drawnParcels.length === 0 && locationMethod === "coord" && ((coordMode === "latlng" && (!coordLat || !coordLng)) || (coordMode === "utm" && (!coordE || !coordN)))) || isEditingPlotParam)}
                          >
                            <i className="bi bi-pencil" /> {drawnParcels.length > 0 ? "วาดแปลงเพิ่ม" : "เริ่มวาดแปลง"}
                          </button>
                          {drawnParcels.length > 0 && (
                            <button
                              className="mds-btn"
                              style={{
                                background: (user && (!projectName.trim() || isDuplicateProjectName)) ? "#cbd5e1" : "linear-gradient(135deg, #0d9488, #0f766e)",
                                color: "#fff",
                                border: "none",
                                boxShadow: (user && (!projectName.trim() || isDuplicateProjectName)) ? "none" : "0 4px 10px rgba(13,148,136,0.25)",
                                cursor: (user && (!projectName.trim() || isDuplicateProjectName)) ? "not-allowed" : "pointer"
                              }}
                              disabled={!!(user && (!projectName.trim() || isDuplicateProjectName))}
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
                rawPlantationInfo={rawPlantationInfo}
                userDisplayName={user?.fullname ?? ""}
                drawnGeometry={drawnGeometry}
                onFlyTo={flyToFeature}
                onReset={clearDraw}
                onBack={() => {
                  if (drawnParcels.length > 0) {
                    setStepWarningPopup(true);
                  } else {
                    setCurrentStep(1);
                    setIsPanelOpen(true);
                  }
                }}
                onCancel={cancelSearch}
                currentStep={currentStep}
                onStepChange={setCurrentStep}
                selectedMapPlotIndex={selectedPlotIndex}
                onMapPlotSelected={setSelectedPlotIndex}
                onDeleteParcel={deleteParcel}
                onDrawMore={startDrawFlow}
                drawMoreDisabled={isEditingPlotParam}
                onCancelDraw={cancelDrawMode}
                isDrawing={drawing}
                onLandUseChange={handleLandUseChange}
                onProjectTypeChange={(type) => setProjectType(type)}
                projectName={projectName}
                autoProcessTrigger={autoProcessTrigger}
                onSave={() => setPlotsSaved(true)}
                existingProjectPlots={existingProjectPlots}
                editingPlotId={editingPlotId}
                onBeforeProcess={() => {
                  if (hiddenProjectPlots.length > 0) {
                    const merged = [...drawnParcels, ...hiddenProjectPlots];
                    merged.sort((a, b) => {
                      const ia = parseInt((a.properties as any)?.plot_index) || 0;
                      const ib = parseInt((b.properties as any)?.plot_index) || 0;
                      return ia - ib;
                    });
                    setDrawnParcels(merged);

                    const editedParcelId = drawnParcels[0] ? (drawnParcels[0].properties as any)?.id : null;
                    const allLuFeats: GeoJSON.Feature[] = [];
                    merged.forEach((mp, mergedIdx) => {
                      const correctPlotIndex = String(mergedIdx + 1);
                      const mpId = (mp.properties as any)?.id;
                      if (mpId && mpId === editedParcelId) {
                        parcelFeatures.forEach(lf => {
                          allLuFeats.push({ ...lf, properties: { ...((lf.properties as Record<string, unknown>) || {}), plot_index: correctPlotIndex } });
                        });
                      } else {
                        const luPolys = (mp.properties as any)?.backendData?.lu_polygon;
                        if (Array.isArray(luPolys) && luPolys.length > 0) {
                          luPolys.forEach((lu: GeoJSON.Feature) => {
                            allLuFeats.push({ ...lu, properties: { ...((lu.properties as Record<string, unknown>) || {}), plot_index: correctPlotIndex } });
                          });
                        } else {
                          allLuFeats.push({ ...(mp as GeoJSON.Feature), properties: { ...((mp.properties as Record<string, unknown>) || {}), plot_index: correctPlotIndex, lu_class: null, lu_class_desc_th: null, area_m2: null, area_percent: null } });
                        }
                      }
                    });
                    setParcelFeatures(allLuFeats);
                    setHiddenProjectPlots([]);
                    // After merge, all plots are in parcelFeatures — disable single-plot edit mode
                    setExistingProjectPlots([]);
                    setEditingPlotId(null);

                    const map = mapRef.current;
                    if (map && map.getSource("matched-parcels")) {
                      (map.getSource("matched-parcels") as maplibregl.GeoJSONSource).setData({ type: "FeatureCollection", features: allLuFeats });
                      const bounds = new maplibregl.LngLatBounds();
                      merged.forEach(f => {
                        if (f.geometry.type === 'Polygon') {
                          f.geometry.coordinates[0].forEach((coord: any) => bounds.extend(coord));
                        } else if (f.geometry.type === 'MultiPolygon') {
                          f.geometry.coordinates[0][0].forEach((coord: any) => bounds.extend(coord));
                        }
                      });
                      if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 50 });
                    }

                    setTimeout(() => {
                      setAutoProcessTrigger(prev => prev + 1);
                    }, 50);
                    return true;
                  }
                  return false;
                }}
              />
            </div>
          )}

        </div>
      </div>

      {/* Success Toast (auto-dismiss) */}
      {toast && (
        <div className="mds-toast">
          <i className="bi bi-check-circle-fill me-2" />
          {toast}
        </div>
      )}

      {/* Minimum-points warning popup */}
      {nodeWarningPopup && (
        <div className="mds-node-warn-overlay" onClick={() => setNodeWarningPopup(false)}>
          <div className="mds-node-warn-popup" onClick={(e) => e.stopPropagation()}>
            <div className="mds-node-warn-icon">
              <i className="bi bi-pentagon-fill" />
              <span className="mds-node-warn-badge">3+</span>
            </div>
            <div className="mds-node-warn-content">
              <h3>ไม่สามารถลบจุดได้</h3>
              <p>แปลงที่วาดต้องมีอย่างน้อย 3 จุด<br />จึงจะสร้างพื้นที่แปลงได้</p>
            </div>
            <button className="mds-node-warn-btn" onClick={() => setNodeWarningPopup(false)}>
              รับทราบ
            </button>
          </div>
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
              <h3>{areaError.tooSmall ? "พื้นที่แปลงเล็กเกินไป" : "พื้นที่แปลงใหญ่เกินไป"}</h3>
              <p>
                ขนาดแปลงที่วาดคือ <strong>{areaError.rai.toFixed(2)} ไร่</strong> ({Math.round(areaError.sqm).toLocaleString()} ตร.ม.)
                {areaError.tooSmall
                  ? <> ซึ่งน้อยกว่าเกณฑ์ขั้นต่ำ <strong>1 ไร่</strong></>
                  : <> ซึ่งเกินกว่าเกณฑ์สูงสุด <strong>500 ไร่</strong></>
                }
              </p>
              <div className="mds-area-popup-hint">
                {areaError.tooSmall
                  ? "กรุณาวาดแปลงใหม่ให้มีพื้นที่อย่างน้อย 1 ไร่"
                  : "กรุณาปรับลดขอบเขตแปลง หรือแบ่งเป็นหลายแปลง"
                }
              </div>
            </div>
            <button className="mds-area-popup-close" onClick={() => setAreaError(null)}>
              ตกลง
            </button>
          </div>
        </div>
      )}
      {/* Error Validation Popup */}
      {errorPopup && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 99999,
          background: "rgba(15,23,42,0.4)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20
        }}>
          <div style={{
            background: "#fff", borderRadius: 20, padding: "28px 24px 24px",
            width: "100%", maxWidth: 360, textAlign: "center",
            boxShadow: "0 20px 40px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)",
            animation: "popupIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)"
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: "50%",
              background: errorPopup.title === "แจ้งเตือนข้อมูล" ? "#fef08a" : "#fee2e2",
              color: errorPopup.title === "แจ้งเตือนข้อมูล" ? "#ca8a04" : "#ef4444",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 28, margin: "0 auto 16px"
            }}>
              <i className={`bi ${errorPopup.title === "แจ้งเตือนข้อมูล" ? "bi-info-circle-fill" : "bi-x-circle-fill"}`} />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", marginBottom: 8, lineHeight: 1.3 }}>
              {errorPopup.title}
            </h3>
            <p style={{ fontSize: 14, color: "#475569", lineHeight: 1.5, marginBottom: 24 }}>
              {errorPopup.desc}
            </p>
            <button
              onClick={() => setErrorPopup(null)}
              style={{
                width: "100%", padding: "12px", borderRadius: 12,
                background: errorPopup.title === "แจ้งเตือนข้อมูล" ? "#ca8a04" : "#ef4444",
                color: "#fff", border: "none", fontSize: 15, fontWeight: 700,
                cursor: "pointer", transition: "all 0.2s"
              }}
            >
              ตกลง
            </button>
          </div>
          <style>{`
            @keyframes popupIn {
              from { opacity: 0; transform: scale(0.95) translateY(10px); }
              to { opacity: 1; transform: scale(1) translateY(0); }
            }
          `}</style>
        </div>
      )}

      {/* Step Warning Popup */}
      {stepWarningPopup && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 99999,
          background: "rgba(15,23,42,0.4)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20
        }}>
          <div style={{
            background: "#fff", borderRadius: 20, padding: "28px 24px 24px",
            width: "100%", maxWidth: 360, textAlign: "center",
            boxShadow: "0 20px 40px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)",
            animation: "popupIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)"
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: "50%",
              background: "rgba(220,38,38,0.1)",
              color: "#dc2626",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 28, margin: "0 auto 16px"
            }}>
              <i className="bi bi-exclamation-triangle-fill" />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: "#dc2626", marginBottom: 8, lineHeight: 1.3 }}>
              {user ? "เริ่มโครงการใหม่หรือไม่?" : "แน่ใจหรือไม่?"}
            </h3>
            <p style={{ fontSize: 14, color: "#475569", lineHeight: 1.5, marginBottom: 24 }}>
              {user
                ? "ต้องการที่จะเริ่มกำหนดขอบเขตและสร้างโครงการใหม่"
                : "หากกลับไปข้อมูลที่ทำไว้จะหายไป"}
              {user && !plotsSaved && (
                <>
                  <br />
                  <span style={{ color: "rgb(220, 50, 38)", fontWeight: 700, display: "block", marginTop: 8 }}>
                    คำเตือน:ไม่ได้ทำการบันทึกข้อมูลแปลงที่วาดไว้ในระบบ
                  </span>
                </>
              )}
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={() => setStepWarningPopup(false)}
                style={{
                  flex: 1, padding: "12px", borderRadius: 12,
                  background: "#e2e8f0", color: "#475569",
                  border: "none", fontSize: 15, fontWeight: 700,
                  cursor: "pointer", transition: "all 0.2s"
                }}
              >
                ยกเลิก
              </button>
              <button
                onClick={handleConfirmStep1}
                style={{
                  flex: 1, padding: "12px", borderRadius: 12,
                  background: "#dc2626", color: "#fff",
                  border: "none", fontSize: 15, fontWeight: 700,
                  cursor: "pointer", transition: "all 0.2s"
                }}
              >
                ตกลง
              </button>
            </div>
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

