"use client";

import { useEffect, useMemo, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { SavedPlot } from "./types";
import styles from "./PlotsMapView.module.css";

const PROJECT_COLORS = [
  "#f97316",
];

export function PlotsMapView({ plots, isMobile }: { plots: SavedPlot[], isMobile: boolean }) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const legendRef = useRef<HTMLDivElement>(null);
  const plotsRef = useRef(plots);

  useEffect(() => {
    plotsRef.current = plots;
  }, [plots]);

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
        glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
        sources: {
          sat: {
            type: "raster",
            tiles: ["https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"],
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
            area: (p.selectedAreaRai || p.areaRai).toFixed(2),
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
            border: 1px solid #e6f0ea;
            box-shadow: 0 8px 24px rgba(0,0,0,0.10);
            overflow: hidden;
          ">
            <div style="height: 3px; background: #1e7a47;"></div>
            <div style="padding: 14px 16px 12px;">
              <div style="font-size: 17px; font-weight: 800; color: #0f172a; margin-bottom: 6px; line-height: 1.2;">${p.projectName}</div>
              <div style="display:flex; align-items:center; gap:5px; color:#94a3b8; font-size:13px; margin-bottom:14px;">
                <i class="bi bi-geo-alt-fill" style="font-size:12px; color:#1e7a47;"></i>
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
                  <div style="font-size:16px; font-weight:800; color:#1e7a47;">${p.carbon}</div>
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
        area: (p.selectedAreaRai || p.areaRai).toFixed(2),
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
    <div className={styles.wrapper}>
      <div
        ref={mapContainerRef}
        className={`${styles.mapEl} ${isMobile ? styles.mapElMobile : ""}`}
      />
      {/* Basemap toggle */}
      <div className={styles.basemapToggle}>
        <button
          onClick={() => {
            if (!mapRef.current) return;
            mapRef.current.setLayoutProperty("sat", "visibility", "visible");
            mapRef.current.setLayoutProperty("street", "visibility", "none");
          }}
          className={styles.basemapBtn}
        >ดาวเทียม</button>
        <button
          onClick={() => {
            if (!mapRef.current) return;
            mapRef.current.setLayoutProperty("sat", "visibility", "none");
            mapRef.current.setLayoutProperty("street", "visibility", "visible");
          }}
          className={styles.basemapBtn}
        >ลายเส้น</button>
      </div>

      {/* Legend */}
      {projectMap.length > 1 && (
        <div ref={legendRef} className={styles.legend}>
          <div className={styles.legendTitle}>โครงการ</div>
          {projectMap.map(({ name, color }) => (
            <div key={name} className={styles.legendItem}>
              <div className={styles.legendSwatch} style={{ background: color }} />
              <span className={styles.legendLabel}>{name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}