"use client";

import { useAuth } from "@/lib/auth-context";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { CarbonBarChart, buildBarPoints, carbonCo2, type BarPoint } from "@/app/components/organisms/ParcelResultsPanel/CarbonBarChart";

const HERO_BG =
  "radial-gradient(1000px 400px at -5% -5%, rgba(16,185,129,0.12) 0%, rgba(16,185,129,0) 60%)," +
  "radial-gradient(800px 400px at 105% 0%, rgba(59,130,246,0.1) 0%, rgba(59,130,246,0) 58%)," +
  "linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.9) 100%)";

const VARIETY_OPTIONS = ["RRIM 600", "RRIT 251"];
const SPACING_OPTIONS = ["2.5x8", "3x7", "2.5x7", "2x6", "3x8"];

function fmtCompact(v: number): string {
  return v.toLocaleString("th-TH", { maximumFractionDigits: 0 });
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
};

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

const inputStyle: React.CSSProperties = { width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid #cbd5e1", fontSize: 14, background: "#fff" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 700, color: "#475569", marginBottom: 6 };

function EditPlotModal({ plot, onClose, onSave, isMobile }: { plot: SavedPlot; onClose: () => void; onSave: (p: SavedPlot) => void; isMobile: boolean }) {
  const [formData, setFormData] = useState({
    name: plot.name || "",
    ownerName: plot.ownerName || "",
    province: plot.province || "",
    areaRai: plot.areaRai?.toString() || "",
    rubberAge: plot.rubberAge?.toString() || "",
    trees: plot.trees?.toString() || "",
    plantYearBE: plot.plantYearBE?.toString() || "",
    variety: plot.variety || "",
    spacing: plot.spacing || "",
  });

  const handleSave = () => {
    const ageNum = parseInt(formData.rubberAge) || 0;
    const treesNum = parseInt(formData.trees) || 0;
    const sp = formData.spacing || "2.5x8";
    const newCarbon = (ageNum > 0 && treesNum > 0) ? carbonCo2(ageNum, treesNum, sp) : plot.carbonTotal;
    const forecast = {
      yr3: carbonCo2(ageNum + 3, treesNum, sp),
      yr5: carbonCo2(ageNum + 5, treesNum, sp),
      yr7: carbonCo2(ageNum + 7, treesNum, sp),
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
      variety: formData.variety,
      spacing: formData.spacing,
      carbonTotal: newCarbon,
      forecast,
    });
  };

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 520, maxHeight: "90vh", overflow: "auto", padding: isMobile ? 20 : 30, boxShadow: "0 20px 40px rgba(0,0,0,0.2)" }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#064e3b", marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
          <i className="bi bi-pencil-square" style={{ color: "#10b981" }} /> แก้ไขข้อมูลแปลง
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>ชื่อโครงการ</label>
            <input type="text" value={formData.name} onChange={e => setFormData(f => ({ ...f, name: e.target.value }))} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>ชื่อเจ้าของ</label>
            <input type="text" value={formData.ownerName} onChange={e => setFormData(f => ({ ...f, ownerName: e.target.value }))} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>จังหวัด</label>
            <input type="text" value={formData.province} onChange={e => setFormData(f => ({ ...f, province: e.target.value }))} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>พื้นที่ (ไร่)</label>
            <input type="number" step="0.01" value={formData.areaRai} onChange={e => setFormData(f => ({ ...f, areaRai: e.target.value }))} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>ปีที่ปลูก (พ.ศ.)</label>
            <input type="number" value={formData.plantYearBE} onChange={e => setFormData(f => ({ ...f, plantYearBE: e.target.value }))} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>อายุยาง (ปี)</label>
            <input type="number" value={formData.rubberAge} onChange={e => setFormData(f => ({ ...f, rubberAge: e.target.value }))} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>จำนวนต้น</label>
            <input type="number" value={formData.trees} onChange={e => setFormData(f => ({ ...f, trees: e.target.value }))} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>พันธุ์ยาง</label>
            <select value={formData.variety} onChange={e => setFormData(f => ({ ...f, variety: e.target.value }))} style={inputStyle}>
              <option value="">— ไม่ระบุ —</option>
              {VARIETY_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>ระยะปลูก</label>
            <select value={formData.spacing} onChange={e => setFormData(f => ({ ...f, spacing: e.target.value }))} style={inputStyle}>
              <option value="">— ไม่ระบุ —</option>
              {SPACING_OPTIONS.map(s => <option key={s} value={s}>{s} ม.</option>)}
            </select>
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

  const currentYearBE = new Date().getFullYear() + 543;
  const plantYearBE = plot.plantYearBE && plot.plantYearBE > 0
    ? plot.plantYearBE
    : (currentYearBE - (plot.rubberAge || 0));
  const effectiveAge = plot.rubberAge > 0 ? plot.rubberAge : (plantYearBE > 0 ? currentYearBE - plantYearBE : 0);
  const chartStartYearBE = plantYearBE > 0 ? plantYearBE + effectiveAge : currentYearBE;
  // Use backend profile if available (matches step 3 exactly), else fallback to local calculation
  const barPts: BarPoint[] = (plot.carbonProfile && plot.carbonProfile.length > 0)
    ? plot.carbonProfile
    : (effectiveAge > 0 && (plot.trees ?? 0) > 0)
      ? buildBarPoints(effectiveAge, chartStartYearBE, plot.trees ?? 0, plot.spacing || "2.5x8")
      : [];

  const infoItems = [
    { label: "พื้นที่", val: plot.areaRai > 0 ? plot.areaRai.toFixed(2) : "—", unit: "ไร่", icon: "bi-grid-3x3", color: "#0d9488", bg: "rgba(13,148,136,0.12)" },
    { label: "ปีที่ปลูก", val: plot.plantYearBE && plot.plantYearBE > 0 ? String(plot.plantYearBE) : "—", unit: "พ.ศ.", icon: "bi-calendar2-check", color: "#3b82f6", bg: "rgba(59,130,246,0.12)" },
    { label: "พันธุ์ยาง", val: plot.variety || "—", unit: "", icon: "bi-patch-check-fill", color: "#8b5cf6", bg: "rgba(139,92,246,0.12)" },
    { label: "ระยะปลูก", val: plot.spacing || "—", unit: "ม.", icon: "bi-arrows-fullscreen", color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
    { label: "จำนวนต้น", val: plot.trees && plot.trees > 0 ? plot.trees.toLocaleString("th-TH") : "—", unit: "ต้น", icon: "bi-tree-fill", color: "#10b981", bg: "rgba(16,185,129,0.12)" },
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
            fontSize: 19, fontWeight: 900, color: "#fff", letterSpacing: -0.5
          }}>{index}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a", lineHeight: 1.3 }}>
              แปลงที่ {index}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 3 }}>
              {plot.province && (
                <span style={{ fontSize: 11, color: "#64748b", display: "flex", alignItems: "center", gap: 3 }}>
                  <i className="bi bi-geo-alt-fill" style={{ color: "#10b981", fontSize: 9 }} />{plot.province}
                </span>
              )}
              {plot.province && <span style={{ fontSize: 10, color: "#e2e8f0" }}>|</span>}
              <span style={{ fontSize: 10.5, color: "#cbd5e1" }}>
                {new Date(plot.date).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" })}
              </span>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {!confirmDelete ? (
            <>
              <button
                onClick={() => onEdit?.(plot)}
                title="แก้ไข"
                style={{ width: 34, height: 34, borderRadius: 9, background: "#f1f5f9", color: "#475569", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.background = "#e2e8f0"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "#f1f5f9"; }}
              >
                <i className="bi bi-pencil-square" style={{ fontSize: 13 }} />
              </button>
              <button
                onClick={() => setConfirmDelete(true)}
                title="ลบ"
                style={{ width: 34, height: 34, borderRadius: 9, background: "rgba(239,68,68,0.07)", color: "#ef4444", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(239,68,68,0.14)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "rgba(239,68,68,0.07)"; }}
              >
                <i className="bi bi-trash3" style={{ fontSize: 13 }} />
              </button>
            </>
          ) : (
            <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
              <span style={{ fontSize: 11.5, color: "#ef4444", fontWeight: 700, whiteSpace: "nowrap" }}>ยืนยันลบ?</span>
              <button onClick={onDelete} style={{ padding: "5px 12px", background: "#ef4444", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 11 }}>ลบ</button>
              <button onClick={() => setConfirmDelete(false)} style={{ padding: "5px 10px", background: "#f1f5f9", color: "#64748b", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 11 }}>ยกเลิก</button>
            </div>
          )}
        </div>
      </div>

      {/* Info strip */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(5, 1fr)",
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
                : (i < 4 ? "1px solid #f1f5f9" : "none"),
              borderBottom: isMobile && i < 4 ? "1px solid #f1f5f9" : "none",
              gridColumn: (isMobile && i === 4) ? "1 / -1" : "auto",
              display: "flex", flexDirection: "column", gap: 7
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 20, height: 20, borderRadius: 6, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <i className={`bi ${icon}`} style={{ fontSize: 10, color }} />
              </div>
              <span style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, letterSpacing: 0.2 }}>{label}</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
              <span style={{ fontSize: isMobile ? 15 : 16, fontWeight: 800, color: val === "—" ? "#cbd5e1" : "#1e293b", lineHeight: 1 }}>{val}</span>
              {unit && <span style={{ fontSize: 9.5, color: "#94a3b8", fontWeight: 500 }}>{unit}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Chart toggle */}
      <button
        onClick={onToggle}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: isMobile ? "10px 16px 10px 20px" : "11px 20px 11px 22px",
          background: expanded ? "rgba(16,185,129,0.04)" : "#fff",
          border: "none", cursor: "pointer",
          fontSize: 12, fontWeight: 700, color: "#059669",
          transition: "background 0.15s",
          borderTop: expanded ? "1px solid rgba(16,185,129,0.08)" : "none",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <i className={`bi bi-bar-chart-line${expanded ? "-fill" : ""}`} style={{ fontSize: 13 }} />
          กราฟการกักเก็บคาร์บอนรายปี (tCO₂)
        </span>
        <i className={`bi bi-chevron-${expanded ? "up" : "down"}`} style={{ fontSize: 11, opacity: 0.5 }} />
      </button>

      {/* Chart section */}
      {expanded && (
        <div style={{ padding: isMobile ? "4px 16px 20px 20px" : "4px 20px 24px 22px", background: "#fff", borderTop: "1px solid #f8fafc" }}>
          {barPts.length > 0 ? (
            <CarbonBarChart pts={barPts} isMobile={isMobile} />
          ) : (
            <div style={{ textAlign: "center", padding: "28px 20px", background: "#f8fafc", borderRadius: 14, border: "1.5px dashed #e2e8f0", color: "#94a3b8", fontSize: 13 }}>
              <i className="bi bi-bar-chart-line" style={{ fontSize: 22, display: "block", marginBottom: 8, opacity: 0.5 }} />
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
