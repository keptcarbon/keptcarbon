"use client";

import { useAuth } from "@/lib/auth-context";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { CarbonBarChart, buildBarPoints, profileToBarPoints, carbonCo2, type BarPoint } from "@/app/components/organisms/ParcelResultsPanel/CarbonBarChart";
import { estimateCarbon, type PlantationPolygon } from "@/lib/carbon-api";

const HERO_BG =
  "radial-gradient(1000px 400px at -5% -5%, rgba(16,185,129,0.12) 0%, rgba(16,185,129,0) 60%)," +
  "radial-gradient(800px 400px at 105% 0%, rgba(59,130,246,0.1) 0%, rgba(59,130,246,0) 58%)," +
  "linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.9) 100%)";

const VARIETY_OPTIONS = ["RRIM 600", "RRIT 251"];
const SPACING_OPTIONS = ["2.5x8", "3x7", "2.5x7", "2x6", "3x8"];

const CURRENT_BE_YEAR = new Date().getFullYear() + 543;
const NEW_YEAR_OPTIONS = Array.from({ length: 4 }, (_, i) => String(CURRENT_BE_YEAR + i));
const OLD_YEAR_OPTIONS = Array.from({ length: CURRENT_BE_YEAR - 2534 + 1 }, (_, i) => String(CURRENT_BE_YEAR - i));

function fmtCompact(v: number): string {
  return v.toLocaleString("th-TH", { maximumFractionDigits: 0 });
}

function getLuColor(luClass: string): string {
  if (luClass.startsWith("A302")) return "#84cc16";
  const p = luClass.charAt(0).toUpperCase();
  if (p === "A") return "#84cc16";
  if (p === "F") return "#166534";
  if (p === "W") return "#3b82f6";
  if (p === "U") return "#ef4444";
  if (p === "M") return "#9ca3af";
  return "#94a3b8";
}

function getLuShortLabel(luClass: string, descTh?: string): string {
  if (descTh) return descTh;
  if (luClass.startsWith("A302")) return "ยางพารา";
  const p = luClass.charAt(0).toUpperCase();
  if (p === "A") return `เกษตรกรรม (${luClass})`;
  if (p === "F") return "พื้นที่ป่าไม้";
  if (p === "W") return "แหล่งน้ำ";
  if (p === "U") return "พื้นที่ชุมชนและสิ่งปลูกสร้าง";
  if (p === "M") return "พื้นที่เบ็ดเตล็ด";
  return luClass;
}

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
  userId?: string;
  ownerName?: string;
  province?: string;
  date: string;
  geojson?: unknown;
  boundaryGeojson?: unknown;
  forecast?: { yr3: number; yr5: number; yr7: number };
  carbonProfile?: BarPoint[];
  plantStatus?: string;
  processed?: boolean;
  luChecked?: Record<string, boolean>;
  backendData?: {
    plantYearBE?: number;
    age?: number;
    variety?: string;
    spacing?: string;
    trees?: number;
    ep?: any;
    form?: any;
    lu_polygon?: GeoJSON.Feature[];
  };
};

const PROJECT_COLORS = [
  "#f97316",
];

function PlotsMapView({ plots, isMobile }: { plots: SavedPlot[], isMobile: boolean }) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const legendRef = useRef<HTMLDivElement>(null);

  // Group plots by project name, assign colors
  const projectMap = useMemo(() => {
    const groups: { name: string; color: string; plots: SavedPlot[] }[] = [];
    const seen = new Map<string, number>();
    plots.forEach(p => {
      const name = p.name || "ไม่มีชื่อโครงการ";
      if (!seen.has(name)) {
        const color = PROJECT_COLORS[seen.size % PROJECT_COLORS.length];
        seen.set(name, groups.length);
        groups.push({ name, color, plots: [p] });
      } else {
        groups[seen.get(name)!].plots.push(p);
      }
    });
    return groups;
  }, [plots]);

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

      // Build match expression: ["match", ["get", "projectName"], "A", colorA, "B", colorB, ..., defaultColor]
      const fillMatch: any[] = ["match", ["get", "projectName"]];
      const lineMatch: any[] = ["match", ["get", "projectName"]];
      const boundaryFillMatch: any[] = ["match", ["get", "projectName"]];
      const boundaryLineMatch: any[] = ["match", ["get", "projectName"]];

      const boundaryFeatures: any[] = [];
      const parcelFeatures: any[] = [];

      projectMap.forEach(({ name, color, plots: groupPlots }) => {
        fillMatch.push(name, color);
        lineMatch.push(name, color);
        boundaryFillMatch.push(name, color);
        boundaryLineMatch.push(name, color);

        groupPlots.forEach(p => {
          const carbonPerTree = (p.trees && p.trees > 0)
            ? (p.carbonTotal / p.trees).toFixed(3)
            : null;
          const props = {
            id: p.id,
            projectName: name,
            area: p.areaRai.toFixed(2),
            carbon: p.carbonTotal.toFixed(2),
            carbonPerTree: carbonPerTree ?? "—",
            province: p.province || "—",
          };

          // Removed boundaryGeojson to only show actual parcels
          if (p.geojson) {
            parcelFeatures.push({
              type: "Feature",
              geometry: p.geojson,
              properties: { ...props, type: 'parcel' }
            });
          }
        });
      });

      fillMatch.push("#ea580c");
      lineMatch.push("#9a3412");
      boundaryFillMatch.push("#3b82f6");
      boundaryLineMatch.push("#3b82f6");

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
        paint: { "fill-color": boundaryFillMatch as any, "fill-opacity": 0.05 }
      });
      map.addLayer({
        id: "boundary-outline",
        type: "line",
        source: "my-boundaries",
        paint: {
          "line-color": boundaryLineMatch as any,
          "line-width": 1.5,
          "line-dasharray": [4, 2]
        }
      });

      map.addLayer({
        id: "parcel-fill",
        type: "fill",
        source: "my-parcels",
        paint: { "fill-color": fillMatch as any, "fill-opacity": 0.35 }
      });
      map.addLayer({
        id: "parcel-outline",
        type: "line",
        source: "my-parcels",
        paint: { "line-color": lineMatch as any, "line-width": 2 }
      });

      const handlePlotClick = (e: any) => {
        if (!e.features?.length) return;
        const p = e.features[0].properties;
        const isBoundary = p.type === 'boundary';
        if (isBoundary) return;
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
            <div style="height: 3px; background: #10b981;"></div>
            <div style="padding: 14px 16px 12px;">
              <div style="font-size: 17px; font-weight: 800; color: #0f172a; margin-bottom: 6px; line-height: 1.2;">${p.projectName}</div>
              <div style="display:flex; align-items:center; gap:5px; color:#94a3b8; font-size:13px; margin-bottom:14px;">
                <i class="bi bi-geo-alt-fill" style="font-size:12px; color:#10b981;"></i>
                <span>${p.province}</span>
              </div>
              <div style="height:1px; background:#f1f5f9; margin-bottom:12px;"></div>
              <div style="display:flex; gap:12px; align-items:flex-start;">
                <div>
                  <div style="font-size:16px; font-weight:800; color:#0f172a;">${p.area}</div>
                  <div style="font-size:11px; color:#94a3b8; margin-top:1px;">ไร่</div>
                </div>
                <div style="width:1px; background:#f1f5f9; align-self:stretch;"></div>
                <div>
                  <div style="font-size:16px; font-weight:800; color:#059669;">${p.carbon}</div>
                  <div style="font-size:11px; color:#94a3b8; margin-top:1px;">tCO₂</div>
                </div>
                ${p.carbonPerTree !== '—' ? `
                <div style="width:1px; background:#f1f5f9; align-self:stretch;"></div>
                <div>
                  <div style="font-size:14px; font-weight:800; color:#0891b2;">${p.carbonPerTree}</div>
                  <div style="font-size:11px; color:#94a3b8; margin-top:1px; line-height:1.3;">tCO₂<br>/ต้น</div>
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
  }, [isMobile, projectMap]);

  // Separate effect to update data when plots change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const boundaryFeatures: any[] = [];
    const parcelFeatures: any[] = [];
    const seenPNames = new Map<string, number>();
    const projectOrder: string[] = [];

    plots.forEach(p => {
      const name = p.name || "ไม่มีชื่อโครงการ";
      if (!seenPNames.has(name)) {
        seenPNames.set(name, projectOrder.length);
        projectOrder.push(name);
      }
      const carbonPerTree = (p.trees && p.trees > 0)
        ? (p.carbonTotal / p.trees).toFixed(3)
        : null;
      const props = {
        id: p.id,
        projectName: name,
        area: p.areaRai.toFixed(2),
        carbon: p.carbonTotal.toFixed(2),
        carbonPerTree: carbonPerTree ?? "—",
        province: p.province || "—",
      };

      // Removed boundaryGeojson to only show actual parcels
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
          style={{ padding: "6px 12px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", background: "transparent" }}
        >ดาวเทียม</button>
        <button
          onClick={() => {
            if (!mapRef.current) return;
            mapRef.current.setLayoutProperty("sat", "visibility", "none");
            mapRef.current.setLayoutProperty("street", "visibility", "visible");
          }}
          style={{ padding: "6px 12px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", background: "transparent" }}
        >ลายเส้น</button>
      </div>

      {/* Legend */}
      {projectMap.length > 1 && (
        <div ref={legendRef} style={{ position: "absolute", bottom: 12, right: 12, background: "rgba(255,255,255,0.95)", borderRadius: 12, padding: "10px 14px", boxShadow: "0 4px 16px rgba(0,0,0,0.12)", zIndex: 1, maxWidth: 200 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 6 }}>โครงการ</div>
          {projectMap.map(({ name, color }) => (
            <div key={name} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, fontSize: 12, color: "#1e293b" }}>
              <div style={{ width: 12, height: 12, borderRadius: 3, background: color, flexShrink: 0 }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


function EditPlotModal({ plot, index, onClose, onSave, isMobile }: { plot: SavedPlot; index: number; onClose: () => void; onSave: (p: SavedPlot) => void; isMobile: boolean }) {
  const form = plot.backendData?.form;
  const isUserYear = !!form?.plantYear;
  const isUserTrees = !!form?.treeCount;
  const isUserVariety = !!form?.variety;
  const isUserSpacing = !!form?.spacing;

  const [formData, setFormData] = useState({
    name: plot.name || "",
    ownerName: plot.ownerName || "",
    province: plot.province || "",
    areaRai: plot.areaRai?.toString() || "",
    plantStatus: form?.plantStatus || "",
    trees: isUserTrees && plot.trees ? plot.trees.toString() : "",
    plantYearBE: isUserYear && plot.plantYearBE ? plot.plantYearBE.toString() : "",
    variety: isUserVariety && plot.variety ? plot.variety : "",
    spacing: isUserSpacing && plot.spacing ? plot.spacing : "",
  });

  const handleSave = () => {
    // Current year BE to calculate age
    const currentBE = new Date().getFullYear() + 543;
    let ageNum = 0;

    let effectivePlantYear = parseInt(formData.plantYearBE) || undefined;

    if (formData.plantStatus === "replanting") {
      ageNum = 0;
      effectivePlantYear = effectivePlantYear || currentBE;
    } else if (formData.plantStatus === "existing") {
      if (effectivePlantYear) {
        ageNum = currentBE - effectivePlantYear;
      }
    }

    const treesNum = parseInt(formData.trees) || 0;
    const sp = formData.spacing || "2.5x8";
    const newCarbon = (ageNum > 0 && treesNum > 0) ? carbonCo2(ageNum, treesNum, sp) : plot.carbonTotal;
    const forecast = {
      yr3: carbonCo2(ageNum + 3, treesNum, sp),
      yr5: carbonCo2(ageNum + 5, treesNum, sp),
      yr7: carbonCo2(ageNum + 7, treesNum, sp),
    };

    const newForm = {
      ...(plot.backendData?.form || {}),
      plantStatus: formData.plantStatus ? formData.plantStatus : undefined,
      plantYear: effectivePlantYear ? String(effectivePlantYear) : undefined,
      treeCount: formData.trees ? formData.trees : undefined,
      variety: formData.variety ? formData.variety : undefined,
      spacing: formData.spacing ? formData.spacing : undefined,
    };

    onSave({
      ...plot,
      name: formData.name,
      ownerName: formData.ownerName,
      province: formData.province,
      areaRai: parseFloat(formData.areaRai) || 0,
      rubberAge: ageNum,
      trees: treesNum,
      plantYearBE: effectivePlantYear,
      variety: formData.variety,
      spacing: formData.spacing,
      carbonTotal: newCarbon,
      forecast,
      backendData: {
        ...(plot.backendData || {}),
        form: newForm
      }
    });
  };

  const fieldLabel = (icon: string, text: React.ReactNode) => (
    <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 700, color: "#475569", marginBottom: 8, letterSpacing: 0.1 }}>
      <i className={`bi ${icon}`} style={{ color: "#10b981", fontSize: 14 }} />
      {text}
    </label>
  );

  const SelectField = ({ value, onChange, disabled, children }: { value: string; onChange: (v: string) => void; disabled?: boolean; children: React.ReactNode }) => (
    <div style={{ position: "relative" }}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        style={{
          width: "100%", height: 46, padding: "0 42px 0 14px",
          borderRadius: 12, border: "1.5px solid #e2e8f0",
          fontSize: 15, color: value ? "#1e293b" : "#94a3b8",
          background: disabled ? "#f8fafc" : "#fff",
          appearance: "none", WebkitAppearance: "none",
          cursor: disabled ? "not-allowed" : "pointer",
          outline: "none", fontFamily: "inherit",
          transition: "border-color 0.15s, box-shadow 0.15s",
        }}
        onFocus={e => { e.currentTarget.style.borderColor = "#10b981"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(16,185,129,0.12)"; }}
        onBlur={e => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.boxShadow = "none"; }}
      >
        {children}
      </select>
      <i className="bi bi-chevron-down" style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: disabled ? "#cbd5e1" : "#94a3b8", fontSize: 13, pointerEvents: "none" }} />
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 24, width: "100%", maxWidth: 480, maxHeight: "88vh", display: "flex", flexDirection: "column", boxShadow: "0 32px 64px rgba(0,0,0,0.22)", overflow: "hidden" }}>

        {/* Header */}
        <div style={{ padding: isMobile ? "18px 20px 14px" : "22px 28px 16px", borderBottom: "1px solid #f1f5f9", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: 12, background: "linear-gradient(135deg,#10b981,#047857)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <i className="bi bi-pencil-square" style={{ color: "#fff", fontSize: 17 }} />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#064e3b", lineHeight: 1.2 }}>แก้ไขข้อมูลแปลงที่ {index}</div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>แก้ไขได้เฉพาะสถานะแปลงและรายละเอียดข้อมูล</div>
            </div>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: "auto", padding: isMobile ? "18px 20px" : "22px 28px", flex: 1 }}>

          {/* สถานะแปลง */}
          <div style={{ marginBottom: 20 }}>
            {fieldLabel("bi-info-circle", <><span>สถานะแปลง</span><span style={{ color: "#ef4444", marginLeft: 3 }}>*</span></>)}
            <div style={{ display: "flex", gap: 10 }}>
              {(["replanting", "existing"] as const).map(status => {
                const active = formData.plantStatus === status;
                const label = status === "replanting" ? "เริ่มปลูกใหม่" : "ปลูกมาแล้ว";
                return (
                  <div
                    key={status}
                    onClick={() => setFormData(f => ({
                      ...f,
                      plantStatus: status,
                      plantYearBE: status === "replanting" ? String(new Date().getFullYear() + 543) : "",
                    }))}
                    style={{
                      flex: 1, padding: "11px 14px", borderRadius: 12, cursor: "pointer", userSelect: "none",
                      display: "flex", alignItems: "center", gap: 9,
                      border: active ? "2px solid #10b981" : "1.5px solid #e2e8f0",
                      background: active ? "rgba(16,185,129,0.06)" : "#fafafa",
                      transition: "all 0.18s",
                    }}
                  >
                    <div style={{
                      width: 20, height: 20, borderRadius: "50%", border: "2px solid",
                      borderColor: active ? "#10b981" : "#cbd5e1",
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                      background: "#fff", transition: "all 0.18s",
                    }}>
                      {active && <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#10b981" }} />}
                    </div>
                    <span style={{ fontSize: 14, fontWeight: active ? 700 : 500, color: active ? "#047857" : "#64748b" }}>{label}</span>
                  </div>
                );
              })}
            </div>
            {!formData.plantStatus && (
              <div style={{ fontSize: 12, color: "#f59e0b", marginTop: 8, display: "flex", alignItems: "center", gap: 5 }}>
                <i className="bi bi-exclamation-circle-fill" /> กรุณาเลือกสถานะแปลงก่อน
              </div>
            )}
          </div>

          {/* Fields section */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16, opacity: formData.plantStatus ? 1 : 0.45, transition: "opacity 0.25s", pointerEvents: formData.plantStatus ? "auto" : "none" }}>

            {/* ปีที่ปลูก */}
            <div>
              {fieldLabel("bi-calendar-event", <>
                <span>ปีที่ปลูก (พ.ศ.)</span>
                {formData.plantStatus === "existing" && <span style={{ color: "#ef4444", marginLeft: 3 }}>*</span>}
              </>)}
              <SelectField
                value={formData.plantYearBE}
                onChange={v => setFormData(f => ({ ...f, plantYearBE: v }))}
                disabled={!formData.plantStatus}
              >
                <option value="">— เลือกปีที่ปลูก —</option>
                {(formData.plantStatus === "replanting" ? NEW_YEAR_OPTIONS : formData.plantStatus === "existing" ? OLD_YEAR_OPTIONS : []).map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </SelectField>
            </div>

            {/* พันธุ์ยาง + ระยะปลูก */}
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>
              <div>
                {fieldLabel("bi-tags", "พันธุ์ยาง")}
                <SelectField value={formData.variety} onChange={v => setFormData(f => ({ ...f, variety: v }))}>
                  <option value="">— ไม่ระบุ —</option>
                  {VARIETY_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                </SelectField>
              </div>
              <div>
                {fieldLabel("bi-arrows-fullscreen", "ระยะปลูก")}
                <SelectField value={formData.spacing} onChange={v => setFormData(f => ({ ...f, spacing: v }))}>
                  <option value="">— ไม่ระบุ —</option>
                  {SPACING_OPTIONS.map(s => <option key={s} value={s}>{s} ม.</option>)}
                </SelectField>
              </div>
            </div>

            {/* จำนวนต้น */}
            <div>
              {fieldLabel("bi-tree-fill", "จำนวนต้น")}
              <div style={{ position: "relative" }}>
                <input
                  type="number"
                  value={formData.trees}
                  onChange={e => setFormData(f => ({ ...f, trees: e.target.value }))}
                  placeholder="ระบุจำนวนต้น"
                  style={{
                    width: "100%", height: 46, padding: "0 52px 0 14px",
                    borderRadius: 12, border: "1.5px solid #e2e8f0",
                    fontSize: 15, color: "#1e293b", background: "#fff",
                    outline: "none", fontFamily: "inherit",
                    transition: "border-color 0.15s, box-shadow 0.15s",
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = "#10b981"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(16,185,129,0.12)"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.boxShadow = "none"; }}
                />
                <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "#94a3b8", pointerEvents: "none" }}>ต้น</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: isMobile ? "14px 20px" : "16px 28px", borderTop: "1px solid #f1f5f9", display: "flex", gap: 10, justifyContent: "flex-end", flexShrink: 0, background: "#fafafa" }}>
          <button
            onClick={onClose}
            style={{ padding: "10px 22px", borderRadius: 11, border: "1.5px solid #e2e8f0", background: "#fff", color: "#64748b", fontWeight: 700, fontSize: 15, cursor: "pointer" }}
          >ยกเลิก</button>
          <button
            onClick={handleSave}
            style={{ padding: "10px 22px", borderRadius: 11, border: "none", background: "linear-gradient(135deg,#10b981,#047857)", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", gap: 7, boxShadow: "0 4px 14px rgba(16,185,129,0.35)" }}
          >
            <i className="bi bi-floppy-disk" /> บันทึก
          </button>
        </div>
      </div>
    </div>
  );
}

function PlotMiniMap({ plot, isMobile, index }: { plot: SavedPlot; isMobile: boolean; index: number }) {
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
          sat: { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, maxzoom: 18 }
        },
        layers: [{ id: "sat", type: "raster", source: "sat" }]
      },
      center: [101.258, 13.5],
      zoom: 14,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

    map.on("load", () => {
      const bounds = new maplibregl.LngLatBounds();

      const luPolygons = plot.backendData?.lu_polygon as GeoJSON.Feature[];
      const hasLu = luPolygons && luPolygons.length > 0;

      if (hasLu) {
        const luChecked = plot.luChecked || {};
        const features = luPolygons.map(f => {
          const cls = (f.properties as any).lu_class as string;
          return { ...f, properties: { ...f.properties, is_selected: luChecked[cls] ? 1 : 0 } };
        });

        const luColorExpr = [
          "case",
          ["==", ["slice", ["coalesce", ["get", "lu_class"], ""], 0, 4], "A302"], "#84cc16",
          ["==", ["slice", ["coalesce", ["get", "lu_class"], ""], 0, 1], "A"], "#84cc16",
          ["==", ["slice", ["coalesce", ["get", "lu_class"], ""], 0, 1], "F"], "#166534",
          ["==", ["slice", ["coalesce", ["get", "lu_class"], ""], 0, 1], "W"], "#3b82f6",
          ["==", ["slice", ["coalesce", ["get", "lu_class"], ""], 0, 1], "U"], "#ef4444",
          ["==", ["slice", ["coalesce", ["get", "lu_class"], ""], 0, 1], "M"], "#9ca3af",
          "#94a3b8"
        ];

        map.addSource("lu-polygons", {
          type: "geojson",
          data: { type: "FeatureCollection", features } as any
        });

        map.addLayer({
          id: "lu-polygons-fill", type: "fill", source: "lu-polygons",
          paint: {
            "fill-color": luColorExpr as any,
            "fill-opacity": ["case", ["==", ["get", "is_selected"], 1], 0.65, 0.15] as any
          }
        });

        map.addLayer({
          id: "lu-polygons-line", type: "line", source: "lu-polygons",
          paint: { "line-color": "#ffffff", "line-width": 1, "line-opacity": 0.7 }
        });

        map.addLayer({
          id: "lu-polygons-label", type: "symbol", source: "lu-polygons",
          filter: ["==", ["get", "is_selected"], 1],
          layout: {
            "text-field": ["get", "lu_class"],
            "text-size": isMobile ? 10 : 12,
            "text-allow-overlap": false,
          },
          paint: {
            "text-color": "#ffffff",
            "text-halo-color": "#0f172a",
            "text-halo-width": 2,
          },
        });

        // Add boundary outline over the LUs
        if (plot.geojson) {
          map.addSource("plot-parcel-outline", {
            type: "geojson",
            data: { type: "Feature", geometry: plot.geojson as any, properties: {} }
          });
          map.addLayer({
            id: "parcel-outline-line", type: "line", source: "plot-parcel-outline",
            paint: { "line-color": "#064e3b", "line-width": 2.5 }
          });
        }

        const processCoords = (coords: any) => {
          if (typeof coords[0] === "number") bounds.extend(coords as [number, number]);
          else if (Array.isArray(coords)) coords.forEach(processCoords);
        };
        luPolygons.forEach(f => {
          if (f.geometry) processCoords((f.geometry as any).coordinates);
        });

      } else if (plot.geojson) {
        // Fallback to just showing the drawn polygon if no LU data
        map.addSource("plot-parcel", {
          type: "geojson",
          data: { type: "Feature", geometry: plot.geojson as any, properties: {} }
        });
        map.addLayer({
          id: "parcel-fill", type: "fill", source: "plot-parcel",
          paint: { "fill-color": "#f97316", "fill-opacity": 0.35 }
        });
        map.addLayer({
          id: "parcel-line", type: "line", source: "plot-parcel",
          paint: { "line-color": "#ea580c", "line-width": 2 }
        });
        const processCoords = (coords: any) => {
          if (typeof coords[0] === "number") bounds.extend(coords as [number, number]);
          else if (Array.isArray(coords)) coords.forEach(processCoords);
        };
        processCoords((plot.geojson as any).coordinates);
      }

      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: isMobile ? 30 : 40, duration: 0 });
      }
    });

    return () => { map.remove(); mapRef.current = null; };
  }, [plot, isMobile]);

  const luPolygonsForLegend = (plot.backendData?.lu_polygon as GeoJSON.Feature[] | undefined) ?? [];
  const hasLuData = luPolygonsForLegend.length > 0;
  const luCheckedForLegend = plot.luChecked || {};

  const luLegendItems = useMemo(() => {
    const seen = new Map<string, { cls: string; label: string; color: string; selected: boolean }>();
    for (const f of luPolygonsForLegend) {
      const cls = (f.properties as any).lu_class as string;
      if (!cls || seen.has(cls)) continue;
      seen.set(cls, {
        cls,
        label: getLuShortLabel(cls, (f.properties as any).lu_class_desc_th),
        color: getLuColor(cls),
        selected: !!luCheckedForLegend[cls],
      });
    }
    return Array.from(seen.values()).filter(item => item.selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plot]);

  const swatchSize = isMobile ? 11 : 13;
  const legendFontSize = isMobile ? 10 : 11;

  return (
    <div style={{ position: "relative", width: "100%", height: isMobile ? 220 : 300, borderRadius: 12, overflow: "hidden", border: "1px solid rgba(0,0,0,0.1)", background: "#e2e8f0" }}>
      <div ref={mapContainerRef} style={{ width: "100%", height: "100%" }} />
      {hasLuData && luLegendItems.length > 0 && (
        <div style={{
          position: "absolute", bottom: isMobile ? 10 : 12, left: isMobile ? 8 : 12,
          background: "rgba(255,255,255,0.96)", backdropFilter: "blur(4px)",
          padding: isMobile ? "6px 9px" : "8px 11px",
          borderRadius: isMobile ? 8 : 10,
          boxShadow: "0 2px 10px rgba(0,0,0,0.18)",
          zIndex: 1, pointerEvents: "none",
          maxWidth: isMobile ? 170 : 210,
        }}>
          <div style={{ fontWeight: 700, marginBottom: isMobile ? 4 : 5, color: "#1e293b", fontSize: isMobile ? 11 : 12, display: "flex", alignItems: "center", gap: 4 }}>
            <i className="bi bi-layers" style={{ color: "#10b981", fontSize: isMobile ? 11 : 12 }} />
            คำอธิบาย (Land Use)
          </div>
          {luLegendItems.map(item => (
            <div key={item.cls} style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: isMobile ? 2 : 3 }}>
              <div style={{
                width: swatchSize, height: swatchSize, flexShrink: 0,
                background: item.color, borderRadius: 2, opacity: 0.85,
                border: `1.5px solid ${item.color}`,
              }} />
              <span style={{
                fontSize: legendFontSize, lineHeight: 1.3,
                color: "#1e293b", fontWeight: 600,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                maxWidth: isMobile ? 128 : 168,
              }}>
                <span style={{ fontWeight: 700 }}>{item.cls}</span> {item.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PlotCard({ plot, index, onDelete, onEdit, expanded, onToggle, isMobile }: { plot: SavedPlot; index: number; onDelete: () => void; onEdit?: (p: SavedPlot, i: number) => void; expanded: boolean; onToggle: () => void; isMobile: boolean }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [activeTab, setActiveTab] = useState<"map" | "carbon">("map");

  // Determine if this plot has been carbon-processed
  // Compatible with old data: if `processed` flag is missing, infer from carbonProfile or carbonTotal
  const isProcessed = plot.processed === true || (plot.carbonProfile && plot.carbonProfile.length > 0) || (plot.carbonTotal > 0);

  const currentYearBE = new Date().getFullYear() + 543;
  const plantYearBE = plot.plantYearBE && plot.plantYearBE > 0
    ? plot.plantYearBE
    : (currentYearBE - (plot.rubberAge || 0));
  const effectiveAge = plot.rubberAge > 0 ? plot.rubberAge : (plantYearBE > 0 ? currentYearBE - plantYearBE : 0);
  const chartStartYearBE = plantYearBE > 0 ? plantYearBE + effectiveAge : currentYearBE;
  // Only compute chart data when the plot has been processed through carbon calculation
  const barPts: BarPoint[] = isProcessed
    ? ((plot.carbonProfile && plot.carbonProfile.length > 0)
      ? plot.carbonProfile
      : (effectiveAge > 0 && (plot.trees ?? 0) > 0)
        ? buildBarPoints(effectiveAge, chartStartYearBE, plot.trees ?? 0, plot.spacing || "2.5x8")
        : [])
    : [];

  const plantStatusLabel = plot.plantStatus === "replanting" ? "เริ่มปลูกใหม่" : plot.plantStatus === "existing" ? "ปลูกมาแล้ว" : "—";

  const activeLu = Object.keys(plot.luChecked || {}).filter(k => plot.luChecked![k] && k !== 'A');
  let luVal = "—";
  if (activeLu.length > 0) {
    if (activeLu.includes("A302")) {
      luVal = "A302";
    } else {
      luVal = activeLu.join(", ");
    }
  }

  const backendData = plot.backendData || {};
  const form = backendData.form;
  const ep = backendData.ep;

  const userEnteredYear = !!form?.plantYear;
  const showPlotAge = plot.backendData ? userEnteredYear : true;
  const yearParam = ep?.year_of_planting;
  const rawNotes: string[] = yearParam?.note ?? [];
  const yearNotes = rawNotes.slice(0, 5);

  let yearBoxItems: Array<{ label: string; pct: number, yearBE: number }> = [];
  let displayYearBE: number | null = null;

  if (yearParam) {
    if (typeof yearParam.value === "number" && yearParam.value > 0) {
      displayYearBE = yearParam.value + 543;
      yearBoxItems = [{ label: `พ.ศ. ${displayYearBE}`, pct: 0, yearBE: displayYearBE as number }];
    } else if (Array.isArray(yearParam.value) && yearParam.value.length > 0) {
      const parsed = (yearParam.value as string[]).map(s => {
        const yearMatch = s.match(/^(\d{4})/);
        const pctMatch = s.match(/([\d.]+)%/);
        const yearCE = yearMatch ? parseInt(yearMatch[1]) : null;
        const yearBE = yearCE !== null ? yearCE + 543 : null;
        const pct = pctMatch ? parseFloat(pctMatch[1]) : 0;
        return { label: yearBE ? `พ.ศ. ${yearBE}` : s, pct, yearBE };
      }).filter((x): x is { label: string; pct: number; yearBE: number } => x.yearBE !== null);
      parsed.sort((a, b) => b.pct - a.pct);
      yearBoxItems = parsed;
      if (parsed.length > 0) displayYearBE = parsed[0].yearBE;
    }
  }
  if (!displayYearBE && plot.plantYearBE && plot.plantYearBE > 0) displayYearBE = plot.plantYearBE;

  const isVarietyFromUser = !!form?.variety;
  const isSpacingFromUser = !!form?.spacing;
  const isTreeCountFromUser = !!form?.treeCount;

  const displayVariety = isVarietyFromUser ? form.variety : (ep?.rubber_clone?.value ? String(ep.rubber_clone.value) : (plot.variety || ""));
  const displaySpacing = isSpacingFromUser ? form.spacing : (ep?.spacing_system?.value ? String(ep.spacing_system.value).replace(/\s*\([^)]*\)/, "").trim() : (plot.spacing || ""));
  const displayTreeCount = isTreeCountFromUser
    ? (parseInt(form?.treeCount || "0") || 0)
    : (ep?.tree_count?.value && typeof ep.tree_count.value === "number" ? ep.tree_count.value : (plot.trees || 0));

  const convertYearNoteToBE = (note: string) => note.replace(/^(\d{4})/, (_, y) => String(parseInt(y) + 543));

  const infoItems = [
    { label: "พื้นที่ (ไร่)", val: plot.areaRai > 0 ? plot.areaRai.toFixed(2) : "", unit: "", icon: "bi-grid-3x3", color: "#0d9488", bg: "rgba(13,148,136,0.12)" },
    { label: "สถานะแปลง", val: plantStatusLabel || "", unit: "", icon: "bi-check2-circle", color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
    { label: "ปีที่ปลูก", val: form?.plantYear ? String(form.plantYear) : "", unit: "", icon: "bi-calendar2-check", color: "#3b82f6", bg: "rgba(59,130,246,0.12)" },
    { label: "พันธุ์ยาง", val: isVarietyFromUser ? form.variety : "", unit: "", icon: "bi-patch-check-fill", color: "#8b5cf6", bg: "rgba(139,92,246,0.12)" },
    { label: "ระยะปลูก (ม.)", val: isSpacingFromUser ? form.spacing : "", unit: "", icon: "bi-arrows-fullscreen", color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
    { label: "จำนวนต้น ", val: isTreeCountFromUser && form?.treeCount ? parseInt(form.treeCount).toLocaleString("th-TH") : "", unit: "", icon: "bi-tree-fill", color: "#10b981", bg: "rgba(16,185,129,0.12)" },
  ];

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 20,
        border: "1px solid rgba(16,185,129,0.13)",
        boxShadow: "0 2px 16px rgba(0,0,0,0.05)",
        overflow: "hidden",
        transition: "box-shadow 0.25s, transform 0.25s",
        position: "relative",
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 10px 32px rgba(16,185,129,0.13)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 2px 16px rgba(0,0,0,0.05)"; e.currentTarget.style.transform = ""; }}
    >
      {/* Left accent bar */}
      <div style={{
        position: "absolute", left: 0, top: 0, bottom: 0, width: 4,
        background: "linear-gradient(to bottom, #10b981, #059669, #047857)"
      }} />

      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: isMobile ? "14px 16px 12px 20px" : "15px 20px 13px 22px",
        gap: 12,
        background: "linear-gradient(to bottom, #fafffe 0%, #fff 100%)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 13, flexShrink: 0,
            background: "linear-gradient(135deg, #10b981 0%, #047857 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 14px rgba(16,185,129,0.35)",
            fontSize: 21, fontWeight: 900, color: "#fff", letterSpacing: -0.5
          }}>{index}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", lineHeight: 1.3, whiteSpace: "nowrap" }}>
                แปลงที่ {index}
              </div>
              {isProcessed ? (
                <span style={{ fontSize: 10, fontWeight: 700, color: "#059669", background: "rgba(5,150,105,0.1)", border: "1px solid rgba(5,150,105,0.25)", padding: "2px 8px", borderRadius: 20, display: "inline-flex", alignItems: "center", gap: 3, whiteSpace: "nowrap" }}>
                  <i className="bi bi-check-circle-fill" style={{ fontSize: 9 }} />ประมวลผลแล้ว
                </span>
              ) : (
                <span style={{ fontSize: 10, fontWeight: 700, color: "#f59e0b", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", padding: "2px 8px", borderRadius: 20, display: "inline-flex", alignItems: "center", gap: 3, whiteSpace: "nowrap" }}>
                  <i className="bi bi-clock" style={{ fontSize: 9 }} />ยังไม่ประมวลผล
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 3 }}>

              <span style={{ fontSize: 12, color: "#cbd5e1" }}>
                {new Date(plot.date).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" })}
              </span>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {!confirmDelete ? (
            <>
              <Link
                href={`/map-draw?project=${encodeURIComponent(plot.name)}&action=calc&plotId=${plot.id}`}
                title="แก้ไขขอบเขตแปลง"
                style={{ width: 34, height: 34, borderRadius: 9, background: "rgba(16,185,129,0.07)", color: "#10b981", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none", transition: "background 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(16,185,129,0.14)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "rgba(16,185,129,0.07)"; }}
              >
                <i className="bi bi-pin-map" style={{ fontSize: 14 }} />
              </Link>
              <button
                onClick={() => onEdit?.(plot, index)}
                title="แก้ไข"
                style={{ width: 34, height: 34, borderRadius: 9, background: "#f1f5f9", color: "#475569", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.background = "#e2e8f0"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "#f1f5f9"; }}
              >
                <i className="bi bi-pencil-square" style={{ fontSize: 14 }} />
              </button>
              <button
                onClick={() => setConfirmDelete(true)}
                title="ลบ"
                style={{ width: 34, height: 34, borderRadius: 9, background: "rgba(239,68,68,0.07)", color: "#ef4444", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(239,68,68,0.14)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "rgba(239,68,68,0.07)"; }}
              >
                <i className="bi bi-trash3" style={{ fontSize: 14 }} />
              </button>
            </>
          ) : (
            <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
              <span style={{ fontSize: 14, color: "#ef4444", fontWeight: 700, whiteSpace: "nowrap" }}>ยืนยันลบ?</span>
              <button onClick={onDelete} style={{ padding: "5px 12px", background: "#ef4444", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 14 }}>ลบ</button>
              <button onClick={() => setConfirmDelete(false)} style={{ padding: "5px 10px", background: "#f1f5f9", color: "#64748b", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14 }}>ยกเลิก</button>
            </div>
          )}
        </div>
      </div>

      {/* Info strip */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(6, 1fr)",
        borderTop: "1px solid #f1f5f9",
        borderBottom: "1px solid #f1f5f9",
        background: "#fafbfc"
      }}>
        {infoItems.map(({ label, val, unit, icon, color, bg }, i) => (
          <div
            key={label}
            style={{
              padding: isMobile ? "11px 14px" : "13px 16px",
              borderRight: isMobile
                ? (i % 2 === 0 ? "1px solid #f1f5f9" : "none")
                : (i < 5 ? "1px solid #f1f5f9" : "none"),
              borderBottom: isMobile && i < 4 ? "1px solid #f1f5f9" : "none",
              gridColumn: "auto",
              display: "flex", flexDirection: "column", gap: 7
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 20, height: 20, borderRadius: 6, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <i className={`bi ${icon}`} style={{ fontSize: 12, color }} />
              </div>
              <span style={{ fontSize: 13, color: "#94a3b8", fontWeight: 600, letterSpacing: 0.2 }}>{label}</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
              {label === "ปีที่ปลูก" && val && unit && <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 500 }}>{unit}</span>}
              <span style={{ fontSize: isMobile ? 17 : 18, fontWeight: 800, color: !val ? "#cbd5e1" : "#1e293b", lineHeight: 1 }}>{val || "\u00A0"}</span>
              {unit && label !== "ปีที่ปลูก" && <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 500 }}>{unit}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Tabs / Toggles */}
      <div style={{ display: "flex", borderTop: "1px solid rgba(16,185,129,0.08)" }}>
        {/* Map Tab */}
        <button
          onClick={() => {
            if (activeTab === "map" && expanded) {
              onToggle(); // collapse
            } else {
              setActiveTab("map");
              if (!expanded) onToggle();
            }
          }}
          style={{
            flex: 1, padding: isMobile ? "10px 4px" : "12px", background: expanded && activeTab === "map" ? "rgba(16,185,129,0.06)" : "#fff",
            border: "none", borderRight: "1px solid rgba(16,185,129,0.08)",
            fontSize: isMobile ? 12 : 14, fontWeight: 700,
            color: expanded && activeTab === "map" ? "#059669" : "#64748b",
            display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: "center", justifyContent: "center", gap: 6, transition: "background 0.15s",
            cursor: "pointer"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <i className={`bi bi-map${expanded && activeTab === "map" ? "-fill" : ""}`} style={{ fontSize: 15 }} />
            <span style={{ whiteSpace: "nowrap" }}>แผนที่ขอบเขต</span>
          </div>
        </button>

        {/* Carbon Graph Tab */}
        <button
          onClick={() => {
            if (activeTab === "carbon" && expanded) {
              onToggle(); // collapse
            } else {
              setActiveTab("carbon");
              if (!expanded) onToggle();
            }
          }}
          style={{
            flex: 1, padding: isMobile ? "10px 4px" : "12px", background: expanded && activeTab === "carbon" ? "rgba(16,185,129,0.06)" : "#fff",
            border: "none",
            fontSize: isMobile ? 12 : 14, fontWeight: 700,
            color: !isProcessed ? "#cbd5e1" : (expanded && activeTab === "carbon" ? "#059669" : "#64748b"),
            display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: "center", justifyContent: "center", gap: 6, transition: "background 0.15s",
            cursor: isProcessed ? "pointer" : "default",
            opacity: isProcessed ? 1 : 0.6
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <i className={`bi bi-bar-chart-line${expanded && activeTab === "carbon" ? "-fill" : ""}`} style={{ fontSize: 15 }} />
            <span style={{ whiteSpace: "nowrap" }}>กราฟคาร์บอนเครดิต (tCO₂eq)</span>
          </div>
          {!isProcessed && <span style={{ fontSize: 10, color: "#f59e0b", whiteSpace: "nowrap", background: "rgba(245,158,11,0.08)", padding: "2px 6px", borderRadius: 10 }}>ยังไม่ประมวลผล</span>}
        </button>
      </div>

      {/* Content section */}
      {expanded && (
        <div style={{ padding: isMobile ? "12px 16px 20px" : "16px 20px 24px", background: "#fff", borderTop: "1px solid #f8fafc" }}>
          {activeTab === "map" ? (
            <PlotMiniMap plot={plot} isMobile={isMobile} index={index} />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "3fr 2fr", gap: 20, alignItems: "stretch", minWidth: 0 }}>
              {/* Left side: Graph Section */}
              <div style={{ minWidth: 0, overflow: "hidden", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                {isProcessed && barPts.length > 0 ? (
                  <div style={{ height: "100%", minHeight: 280 }}>
                    <CarbonBarChart pts={barPts} isMobile={isMobile} showAge={showPlotAge} />
                  </div>
                ) : (
                  <div style={{ textAlign: "center", padding: "32px 20px", background: "linear-gradient(135deg, #fffbeb, #fef3c7)", borderRadius: 14, border: "1.5px dashed rgba(245,158,11,0.3)", color: "#92400e", fontSize: 14, height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", minHeight: 280 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 12, background: "rgba(245,158,11,0.15)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
                      <i className="bi bi-clock-history" style={{ fontSize: 22, color: "#f59e0b" }} />
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>ยังไม่ได้ประมวลผลคาร์บอน</div>
                    <div style={{ fontSize: 12, color: "#b45309", lineHeight: 1.5 }}>กรุณาไปที่หน้าวาดแปลงและกด "ประมวลผล" เพื่อดูกราฟการกักเก็บคาร์บอน</div>
                  </div>
                )}
              </div>

              {/* Right side: Details Section */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13, color: "#475569" }}>
                <div style={{ padding: "12px 14px", background: "rgba(16,185,129,0.04)", borderRadius: 10, border: "1px solid rgba(16,185,129,0.15)" }}>
                  {/* Header Section */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                    <span style={{ fontWeight: 700, color: "#047857", display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
                      <i className="bi bi-layers-fill" /> ข้อมูลที่ใช้ในการประมวลผล
                    </span>
                  </div>

                  {/* Main Year Info (from user or value) */}
                  <div style={{ marginBottom: yearNotes.length > 0 ? 12 : 0 }}>
                    <div style={{ fontSize: 12, color: "#475569", fontWeight: 700, marginBottom: 6 }}>
                      ปีที่เริ่มปลูกที่ใช้ในการคำนวณ {(!userEnteredYear && yearBoxItems.length > 0) ? `(${yearBoxItems.length} ปี):` : ":"}
                    </div>
                    <div style={{
                      display: "flex", alignItems: "flex-start", gap: 6,
                      fontSize: 11, color: "#059669", fontWeight: 600,
                      background: "rgba(16,185,129,0.1)", padding: "6px 8px",
                      borderRadius: 6, border: "1px dashed rgba(16,185,129,0.2)", width: "fit-content", lineHeight: 1.3,
                      marginBottom: 8
                    }}>
                      <i className="bi bi-info-circle-fill" style={{ marginTop: 1, flexShrink: 0 }} />
                      <span>
                        {userEnteredYear
                          ? "ข้อมูลที่ผู้ใช้ระบุ"
                          : "ข้อมูลอ้างอิงจากระบบ"}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      {userEnteredYear ? (
                        <div style={{
                          padding: "4px 10px",
                          background: "rgba(100,116,139,0.06)",
                          borderRadius: 8,
                          border: "1px solid rgba(100,116,139,0.15)",
                          fontWeight: 500,
                          fontSize: 12,
                          color: "#475569",
                        }}>
                          {displayYearBE ? `${displayYearBE}` : "—"}
                        </div>
                      ) : yearBoxItems.length > 0 ? (
                        <>
                          {yearBoxItems.slice(0, 3).map((box, bi) => (
                            <div key={bi} style={{
                              padding: "4px 10px",
                              background: "rgba(100,116,139,0.06)",
                              borderRadius: 8,
                              border: "1px solid rgba(100,116,139,0.15)",
                              fontWeight: 500,
                              fontSize: 12,
                              color: "#475569",
                            }}>
                              {box.label}{box.pct > 0 ? ` (${box.pct}%)` : ""}
                            </div>
                          ))}
                          {yearBoxItems.length > 3 && (
                            <span style={{ fontSize: 14, color: "#94a3b8", fontWeight: 600 }}>...</span>
                          )}
                        </>
                      ) : (
                        <div style={{ fontSize: 12, color: "#475569" }}>—</div>
                      )}
                    </div>
                  </div>

                  {/* Inner Box for yearNotes (สัดส่วนปีที่ปลูกที่ตรวจพบในแปลง) */}
                  {yearNotes.length > 0 && (
                    <div style={{ padding: "10px 12px", background: "rgba(255,255,255,0.6)", borderRadius: 8, border: "1px solid rgba(16,185,129,0.2)" }}>
                      <div style={{ fontSize: 12, color: "#475569", fontWeight: 700, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                        <i className="bi bi-pie-chart-fill" style={{ color: "#059669" }} /> สัดส่วนปีที่เริ่มปลูกที่ตรวจพบในแปลง:
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                        {yearNotes.slice(0, 3).map((note, ni) => {
                          const beNote = convertYearNoteToBE(note);
                          return (
                            <div key={ni} style={{
                              padding: "4px 8px",
                              background: "rgba(100,116,139,0.04)",
                              borderRadius: 6,
                              border: "1px solid rgba(100,116,139,0.1)",
                              fontWeight: 500,
                              fontSize: 11,
                              color: "#475569",
                            }}>
                              {beNote}
                            </div>
                          );
                        })}
                        {yearNotes.length > 3 && (
                          <span style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>...</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Common params: variety, spacing, tree count */}
                <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 2 }}>
                  {displayVariety && <div>• พันธุ์ยาง: <strong style={{ color: "#0f172a" }}>{displayVariety}</strong> {!isVarietyFromUser && <span style={{ color: "#64748b", fontSize: 12 }}>(ค่าเริ่มต้น)</span>}</div>}
                  {displaySpacing && <div>• ระยะปลูก: <strong style={{ color: "#0f172a" }}>{displaySpacing}</strong> {!isSpacingFromUser && <span style={{ color: "#64748b", fontSize: 12 }}>(ค่าเริ่มต้น)</span>}</div>}
                  {displayTreeCount > 0 && <div>• จำนวนต้น: <strong style={{ color: "#0f172a" }}>{displayTreeCount.toLocaleString("th-TH")}</strong> ต้น {!isTreeCountFromUser && <span style={{ color: "#64748b", fontSize: 12 }}>(ประเมินโดยระบบ)</span>}</div>}
                </div>
              </div>
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
      const url = viewMode === "all" && isAdmin
        ? "/api/plots?all=true"
        : "/api/plots";
      fetch(url)
        .then(r => r.ok ? r.json() : { plots: [] })
        .then(data => setPlots(Array.isArray(data.plots) ? data.plots : []))
        .catch(() => setPlots([]));
    }
  }, [ready, user, viewMode, isAdmin]);


  const handleDelete = (id: string) => {
    if (!user) return;
    setPlots(prev => prev.filter(p => p.id !== id));
    fetch(`/api/plots/${id}`, { method: "DELETE" }).catch(console.error);
  };



  const handleDeleteAll = () => {
    if (!user) return;
    if (viewMode === "all") {
      // Admin: ลบทีละแปลงที่แสดงอยู่
      plots.forEach(p => handleDelete(p.id));
    } else {
      setPlots([]);
      fetch("/api/plots", { method: "DELETE" }).catch(console.error);
    }
    setConfirmDeleteAll(false);
  };



  const totalArea = plots.reduce((s, p) => s + (p.areaRai || 0), 0);

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
    return Object.values(groups).sort((a, b) => a.date - b.date);
  }, [filteredPlots]);

  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
  const toggleProject = (pName: string) => setExpandedProjects(prev => ({ ...prev, [pName]: !prev[pName] }));

  const [estimatingProject, setEstimatingProject] = useState<string | null>(null);

  const handleInlineEstimate = async (projectName: string, projectPlots: SavedPlot[]) => {
    if (!user) return;
    setEstimatingProject(projectName);

    try {
      const polygons: PlantationPolygon[] = projectPlots.map((plot) => {
        let geom = plot.geojson as GeoJSON.Geometry;
        if (!geom && plot.boundaryGeojson) {
          geom = plot.boundaryGeojson as GeoJSON.Geometry;
        }

        const backendYearBE = plot.backendData?.plantYearBE || 0;
        const userYearBE = plot.plantYearBE || 0;
        const finalPlantYearBE = userYearBE > 0 ? userYearBE : (backendYearBE > 0 ? backendYearBE : 0);

        return {
          id: plot.id,
          geometry: geom,
          year_of_planting: finalPlantYearBE > 0 ? finalPlantYearBE - 543 : null,
          rubber_clone: plot.variety || null,
          tree_count: plot.trees || null,
          spacing_system: plot.spacing || null,
          selected_lu_classes: Object.entries(plot.luChecked || {})
            .filter(([_, on]) => on)
            .map(([cls]) => cls),
          project_type: (plot.plantStatus as "replanting" | "existing") || undefined,
        };
      });

      const responses = await estimateCarbon(polygons);

      const CURRENT_BE_NOW = new Date().getFullYear() + 543;
      const updatedPlots: SavedPlot[] = [];

      for (let i = 0; i < projectPlots.length; i++) {
        const plot = projectPlots[i];
        const resp = responses.find(r => r.polygon_id === plot.id);
        if (!resp) continue;

        const ep = resp.estimated_parameters;
        const epPlantYearCE = typeof ep?.year_of_planting?.value === "number" ? ep.year_of_planting.value : 0;
        const epPlantYearBE = epPlantYearCE > 0 ? epPlantYearCE + 543 : 0;
        const epTrees = typeof ep?.tree_count?.value === "number" ? ep.tree_count.value : 0;

        const userPlantYear = plot.plantYearBE || 0;
        const userTrees = plot.trees || 0;

        const age = userPlantYear > 0 ? (CURRENT_BE_NOW - userPlantYear) : (epPlantYearBE > 0 ? (CURRENT_BE_NOW - epPlantYearBE) : 0);
        const trees = userTrees > 0 ? userTrees : (epTrees > 0 ? epTrees : 0);
        const finalPlantYear = userPlantYear > 0 ? userPlantYear : epPlantYearBE;

        const rawProfile = resp.carbon_profile ?? [];
        const co2Now = rawProfile[0]?.stocks?.value ?? 0;
        const carbonProfile = rawProfile.length > 0 ? profileToBarPoints(rawProfile, age) : [];

        const updatedPlot: SavedPlot = {
          ...plot,
          processed: true,
          carbonTotal: co2Now,
          rubberAge: age,
          plantYearBE: finalPlantYear,
          trees,
          carbonProfile,
          backendData: {
            ...plot.backendData,
            age,
            plantYearBE: epPlantYearBE,
            ep: ep || null,
          }
        };

        updatedPlots.push(updatedPlot);
      }

      // Update state locally
      setPlots(prev => prev.map(p => {
        const up = updatedPlots.find(u => u.id === p.id);
        return up ? up : p;
      }));

      // Expand project to show graphs
      setExpandedProjects(prev => ({ ...prev, [projectName]: true }));

      // Save to backend
      await fetch(`/api/plots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plots: updatedPlots }),
      });

    } catch (err) {
      console.error("Inline estimate error:", err);
      alert("เกิดข้อผิดพลาดในการประมวลผลคาร์บอนเครดิต");
    } finally {
      setEstimatingProject(null);
    }
  };

  const [editingPlot, setEditingPlot] = useState<{ plot: SavedPlot; index: number } | null>(null);

  const handleUpdatePlot = (updated: SavedPlot) => {
    if (!user) return;
    setPlots(prev => prev.map(p => p.id === updated.id ? updated : p));
    fetch(`/api/plots/${updated.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: updated.name,
        variety: updated.variety,
        spacing: updated.spacing,
        trees: updated.trees,
        plantStatus: updated.plantStatus,
        ownerName: updated.ownerName,
        province: updated.province,
        plantYearBE: updated.plantYearBE,
        backendData: updated.backendData,
      }),
    }).catch(console.error);
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
                <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "4px 12px", background: "rgba(16,185,129,0.1)", color: "#059669", borderRadius: 50, fontSize: 13, fontWeight: 700, border: "1px solid rgba(16,185,129,0.2)" }}>
                  <i className="bi bi-folder-fill" /> {viewMode === "all" ? "ข้อมูลทั้งหมดในระบบ" : "ข้อมูลของฉัน"}
                </div>
              </div>
              <h1 style={{ fontSize: isMobile ? 28 : 36, fontWeight: 800, color: "#064e3b", marginBottom: 8, lineHeight: 1.2 }}>
                {viewMode === "all" ? "การจัดการแปลงยางพาราทั้งหมด" : "แปลงของฉัน"}
              </h1>
              <p style={{ fontSize: isMobile ? 15 : 17, color: "#475569", margin: "0 0 18px", lineHeight: 1.6 }}>
                {viewMode === "all"
                  ? "ตรวจสอบและจัดการข้อมูลแปลงยางพาราของผู้ใช้งานทุกคนในระบบ"
                  : "จัดการข้อมูลแปลงและผลประเมินคาร์บอนเครดิต"}
              </p>
              {/* Search */}
              <div style={{ position: "relative", maxWidth: isMobile ? "100%" : 440 }}>
                <i className="bi bi-search" style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: searchFocused ? "#059669" : "#94a3b8", fontSize: 15, pointerEvents: "none" }} />
                <input
                  type="text"
                  placeholder="ค้นหาแปลง ชื่อโครงการ..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  style={{
                    width: "100%", padding: "11px 38px 11px 40px",
                    borderRadius: 13, fontSize: 15, color: "#0f172a",
                    border: `2px solid ${searchFocused ? "#10b981" : "rgba(16,185,129,0.25)"}`,
                    background: "rgba(255,255,255,0.95)", outline: "none",
                    boxShadow: searchFocused ? "0 0 0 4px rgba(16,185,129,0.1)" : "0 2px 10px rgba(0,0,0,0.04)",
                    transition: "border-color 0.15s, box-shadow 0.15s",
                  }}
                />
                {searchTerm && (
                  <button onClick={() => setSearchTerm("")} style={{ position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 17, padding: 2, lineHeight: 1 }}>
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
                      fontSize: 15,
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
                      fontSize: 15,
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
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: isMobile ? 8 : 10, background: "linear-gradient(135deg,#10b981 0%,#059669 100%)", color: "#fff", padding: isMobile ? "12px 24px" : "14px 28px", borderRadius: isMobile ? 12 : 14, fontWeight: 700, fontSize: isMobile ? 15 : 17, textDecoration: "none", boxShadow: isMobile ? "0 6px 15px rgba(16,185,129,0.25)" : "0 10px 25px rgba(16,185,129,0.3)",
                  width: isMobile ? "100%" : "auto",
                  whiteSpace: "nowrap",
                  transition: "all 0.2s ease"
                }}
              >
                <i className="bi bi-plus-circle" style={{ fontSize: isMobile ? 16 : 18 }} /> เริ่มโครงการใหม่
              </Link>
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        {plots.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(auto-fit, minmax(190px, 1fr))", gap: isMobile ? 10 : 14, marginBottom: 24 }}>
            {([
              { label: "โครงการทั้งหมด", val: new Set(plots.map(p => p.name || "ไม่มีชื่อโครงการ")).size.toLocaleString("th-TH"), unit: "โครงการ", icon: "bi-folder-fill", color: "#3b82f6", bg: "rgba(59,130,246,0.08)" },
              { label: "แปลงทั้งหมด", val: plots.length.toLocaleString("th-TH"), unit: "แปลง", icon: "bi-map", color: "#16a34a", bg: "rgba(22,163,74,0.08)" },
              { label: "พื้นที่รวม", val: totalArea.toFixed(2), unit: "ไร่", icon: "bi-grid-fill", color: "#0d9488", bg: "rgba(13,148,136,0.08)" },
            ] as { label: string; val: string; unit: string; icon: string; color: string; bg: string }[]).map(({ label, val, unit, icon, color, bg }) => (
              <div key={label} style={{ background: "#fff", borderRadius: 14, padding: isMobile ? "10px 12px" : "12px 14px", border: "1px solid rgba(0,0,0,0.05)", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                  <span style={{ fontSize: 13, color: "#64748b" }}>{label}</span>
                  <div style={{ width: 22, height: 22, borderRadius: 6, background: bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <i className={`bi ${icon}`} style={{ color, fontSize: 12 }} />
                  </div>
                </div>
                <div style={{ fontSize: isMobile ? 19 : 22, fontWeight: 800, color }}>{val} <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 400 }}>{unit}</span></div>
              </div>
            ))}
          </div>
        )}

        {/* Content */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, padding: "0 2px", gap: 10 }}>
            <h2 style={{ fontSize: isMobile ? 17 : 20, fontWeight: 800, color: "#064e3b", margin: 0, whiteSpace: "nowrap", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
              {viewMode === "all" ? (isMobile ? "แปลงทั้งหมด" : "รายการแปลงทั้งหมด") : (isMobile ? "แปลงที่บันทึก" : "รายการแปลงที่บันทึกแล้ว")}
              {searchTerm && (
                <span style={{ fontSize: isMobile ? 13 : 15, fontWeight: 400, color: "#64748b", marginLeft: isMobile ? 4 : 8 }}>
                  พบ {filteredPlots.length}
                </span>
              )}
            </h2>
            <div style={{ display: "flex", gap: isMobile ? 6 : 10, alignItems: "center", flexShrink: 0 }}>

              {plots.length > 0 && (
                <div>
                  {confirmDeleteAll ? (
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ fontSize: 15, color: "#ef4444", fontWeight: 700 }}>ลบทั้งหมด?</span>
                      <button
                        onClick={handleDeleteAll}
                        style={{ padding: "6px 14px", background: "#ef4444", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 15 }}
                      >
                        ยืนยัน
                      </button>
                      <button
                        onClick={() => setConfirmDeleteAll(false)}
                        style={{ padding: "6px 14px", background: "rgba(0,0,0,0.06)", color: "#64748b", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 15, fontWeight: 600 }}
                      >
                        ยกเลิก
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteAll(true)}
                      style={{ padding: isMobile ? "6px 10px" : "8px 12px", background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, cursor: "pointer", fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, transition: "all 0.2s" }}
                    >
                      <i className="bi bi-trash3-fill" style={{ fontSize: isMobile ? 15 : 14 }} /> {isMobile ? "" : "ลบทั้งหมด"}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {filteredPlots.length === 0 ? (
            <div style={{ textAlign: "center", padding: "44px 24px", background: "#fff", borderRadius: 20, color: "#94a3b8", fontSize: 14 }}>
              <i className="bi bi-search" style={{ fontSize: 32, display: "block", marginBottom: 8 }} />
              ไม่พบแปลงที่ตรงกับ &ldquo;<strong style={{ color: "#64748b" }}>{searchTerm}</strong>&rdquo;
              <br />
              <button onClick={() => setSearchTerm("")} style={{ marginTop: 12, padding: "5px 16px", background: "rgba(16,185,129,0.08)", color: "#059669", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
                ล้างการค้นหา
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 24 : 32 }}>
              {editingPlot && <EditPlotModal plot={editingPlot.plot} index={editingPlot.index} onClose={() => setEditingPlot(null)} onSave={handleUpdatePlot} isMobile={isMobile} />}
              {projectGroups.map((group, gIdx) => (
                <div key={`${group.projectName}-${gIdx}`} style={{ position: "relative", background: "#fff", borderRadius: 24, border: "1px solid rgba(16,185,129,0.2)", overflow: "hidden", boxShadow: "0 10px 30px rgba(0,0,0,0.03)" }}>
                  {/* Project Header */}
                  <div style={{ padding: isMobile ? "14px 16px" : "16px 24px", background: "linear-gradient(135deg,rgba(16,185,129,0.04),rgba(5,150,105,0.01))", display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", gap: 12 }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg, #10b981 0%, #047857 100%)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 900, boxShadow: "0 2px 8px rgba(16,185,129,0.35)", flexShrink: 0 }}>
                          {gIdx + 1}
                        </div>
                        <h3 style={{ margin: 0, fontSize: isMobile ? 20 : 22, fontWeight: 800, color: "#064e3b" }}>{group.projectName !== "ไม่มีชื่อโครงการ" ? `โครงการ ${group.projectName}` : "ไม่มีชื่อโครงการ"}</h3>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, color: "#64748b", fontSize: 15, fontWeight: 500 }}>
                        <span><i className="bi bi-map-fill me-1" style={{ color: "#0ea5e9" }} /> {group.plots.length} แปลง</span>
                        <span><i className="bi bi-grid-fill me-1" style={{ color: "#10b981" }} /> {group.totalArea.toFixed(2)} ไร่</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, width: isMobile ? "100%" : "auto" }}>
                      <button
                        onClick={() => handleInlineEstimate(group.projectName, group.plots)}
                        disabled={estimatingProject === group.projectName}
                        style={{ flex: isMobile ? "1 1 100%" : "auto", textAlign: "center", padding: isMobile ? "10px 16px" : "8px 16px", borderRadius: 12, background: estimatingProject === group.projectName ? "#94a3b8" : "linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)", color: "#fff", fontWeight: 700, fontSize: isMobile ? 15 : 14, textDecoration: "none", border: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, boxShadow: estimatingProject === group.projectName ? "none" : "0 4px 15px rgba(14,165,233,0.3)", whiteSpace: "nowrap", cursor: estimatingProject === group.projectName ? "not-allowed" : "pointer" }}
                      >
                        {estimatingProject === group.projectName ? (
                          <><i className="spinner-border spinner-border-sm" /> กำลังประมวลผล...</>
                        ) : (
                          <><i className="bi bi-magic" /> ประเมินคาร์บอนเครดิต</>
                        )}
                      </button>
                      <Link href={`/map-draw?project=${encodeURIComponent(group.projectName)}`} style={{ flex: isMobile ? 1 : "auto", textAlign: "center", padding: "8px 16px", borderRadius: 12, background: "rgba(16,185,129,0.1)", color: "#059669", fontWeight: 700, fontSize: 15, textDecoration: "none", border: "1px solid rgba(16,185,129,0.2)", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                        <i className="bi bi-plus-lg" /> เพิ่มแปลง
                      </Link>
                      <button onClick={() => toggleProject(group.projectName)} style={{ flex: isMobile ? 1 : "auto", padding: "8px 16px", borderRadius: 12, background: expandedProjects[group.projectName] ? "rgba(0,0,0,0.05)" : "#0f172a", color: expandedProjects[group.projectName] ? "#475569" : "#fff", fontWeight: 700, fontSize: 15, border: "none", cursor: "pointer", transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
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
                            onEdit={(p, idx) => setEditingPlot({ plot: p, index: idx })}
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
