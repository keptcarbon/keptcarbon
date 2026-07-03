"use client";

import { useEffect, useMemo, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { SavedPlot } from "./types";
import styles from "./PlotMiniMap.module.css";

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
  if (luClass === "A") return "A พื้นที่เกษตรกรรม";
  if (luClass === "F") return "F พื้นที่ป่าไม้";
  if (luClass === "W") return "W แหล่งน้ำ";
  if (luClass === "U") return "U พื้นที่ชุมชนและสิ่งปลูกสร้าง";
  if (luClass === "M") return "M พื้นที่เบ็ดเตล็ด";
  if (descTh) return descTh.startsWith(luClass) ? descTh : `${luClass} ${descTh}`;
  return luClass;
}

export function PlotMiniMap({ plot, isMobile, index }: { plot: SavedPlot; isMobile: boolean; index: number }) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const plotRef = useRef(plot);

  useEffect(() => {
    plotRef.current = plot;
  }, [plot]);

  const luFeatures = plot.backendData?.lu_polygon || [];
  const luChecked = plot.luChecked || {};
  const luCheckedKey = JSON.stringify(luChecked);

  const filteredLuFeatures = useMemo(() => {
    const hasSelected = Object.values(luChecked).some(val => val === true);
    if (!hasSelected) return [];
    return luFeatures.filter(feat => {
      const code = (feat as any).properties?.lu_class as string | undefined;
      if (!code) return false;
      // A302 and A are fixed to true in the UI
      if (code === "A302" || code === "A") return true;
      return !!luChecked[code];
    });
  }, [luFeatures.length, luCheckedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredLuFeaturesRef = useRef(filteredLuFeatures);
  useEffect(() => { filteredLuFeaturesRef.current = filteredLuFeatures; }, [filteredLuFeatures]);

  const legendItems = useMemo(() => {
    const seen = new Map<string, { color: string; descTh?: string }>();
    for (const feat of filteredLuFeatures) {
      const p = (feat as any).properties as Record<string, unknown> | undefined;
      const code = p?.lu_class as string | undefined;
      const descTh = p?.lu_class_desc_th as string | undefined;
      if (code && !seen.has(code)) seen.set(code, { color: getLuColor(code), descTh });
    }
    return Array.from(seen.entries()).map(([code, { color, descTh }]) => ({ code, color, label: getLuShortLabel(code, descTh) }));
  }, [filteredLuFeatures.length, luCheckedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
        sources: {
          sat: { type: "raster", tiles: ["https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"], tileSize: 256, maxzoom: 18 }
        },
        layers: [{ id: "sat", type: "raster", source: "sat" }]
      },
      center: [101.258, 13.5],
      zoom: 14,
      attributionControl: false,
    });
    mapRef.current = map;

    class MiniCenterControl {
      _map?: maplibregl.Map;
      _container?: HTMLDivElement;
      onAdd(m: maplibregl.Map) {
        this._map = m;
        this._container = document.createElement("div");
        this._container.className = "maplibregl-ctrl maplibregl-ctrl-group";

        // Force explicit styles to perfectly match MapLibre's default white rounded buttons
        this._container.style.backgroundColor = "#ffffff";
        this._container.style.borderRadius = "8px"; // Matches the rounded look in the screenshot
        this._container.style.boxShadow = "0 0 0 2px rgba(0,0,0,0.1)";
        this._container.style.overflow = "hidden";

        const btn = document.createElement("button");
        btn.type = "button";
        btn.title = "กลับไปที่แปลง";
        btn.style.width = "29px";
        btn.style.height = "29px";
        btn.style.padding = "0";
        btn.style.margin = "0";
        btn.style.border = "none";
        btn.style.backgroundColor = "transparent";
        btn.style.cursor = "pointer";
        btn.style.display = "flex";
        btn.style.alignItems = "center";
        btn.style.justifyContent = "center";
        btn.style.outline = "none";
        btn.innerHTML = `<i class="bi bi-crosshair" style="font-size: 15px; color: #475569;"></i>`;
        btn.onclick = () => {
          if (!this._map) return;
          const bounds = new maplibregl.LngLatBounds();
          const currentPlot = plotRef.current;

          const processCoords = (coords: any) => {
            if (typeof coords[0] === "number") bounds.extend(coords as [number, number]);
            else if (Array.isArray(coords)) coords.forEach(processCoords);
          };

          if (currentPlot.geojson) {
            processCoords((currentPlot.geojson as any).coordinates);
          }

          if (!bounds.isEmpty()) {
            this._map.fitBounds(bounds, { padding: isMobile ? 30 : 40, duration: 800 });
          }
        };
        this._container.appendChild(btn);
        return this._container;
      }
      onRemove() {
        if (this._container?.parentNode) this._container.parentNode.removeChild(this._container);
        this._map = undefined;
      }
    }

    map.addControl(new MiniCenterControl(), "bottom-right");
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

    map.on("load", () => {
      const bounds = new maplibregl.LngLatBounds();
      const processCoords = (coords: any) => {
        if (typeof coords[0] === "number") bounds.extend(coords as [number, number]);
        else if (Array.isArray(coords)) coords.forEach(processCoords);
      };

      const currentPlot = plotRef.current;
      const currentLuFeatures = filteredLuFeaturesRef.current;

      // Add LU polygons (colored by type, no text labels)
      if (currentLuFeatures.length > 0) {
        const luGeoJSON: GeoJSON.FeatureCollection = {
          type: "FeatureCollection",
          features: currentLuFeatures.map(feat => ({
            type: "Feature" as const,
            geometry: feat.geometry,
            properties: { color: getLuColor(((feat as any).properties?.lu_class as string) || "") }
          }))
        };
        map.addSource("lu-polygons", { type: "geojson", data: luGeoJSON });
        map.addLayer({
          id: "lu-fill", type: "fill", source: "lu-polygons",
          paint: { "fill-color": ["get", "color"], "fill-opacity": 0.55 }
        });
        map.addLayer({
          id: "lu-line", type: "line", source: "lu-polygons",
          paint: { "line-color": "#334155", "line-width": 1, "line-opacity": 0.9 }
        });
        for (const feat of currentLuFeatures) {
          processCoords((feat.geometry as any).coordinates);
        }

        // One label per unique LU class, placed at centroid of first polygon of that class
        const classFirstRing = new Map<string, { ring: number[][]; descTh?: string }>();
        for (const feat of currentLuFeatures) {
          const p = (feat as any).properties as Record<string, unknown> | undefined;
          const code = p?.lu_class as string | undefined;
          const descTh = p?.lu_class_desc_th as string | undefined;
          if (!code || classFirstRing.has(code)) continue;
          const geom = feat.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon;
          let ring: number[][];
          if (geom.type === "Polygon") ring = geom.coordinates[0];
          else ring = geom.coordinates[0][0];
          classFirstRing.set(code, { ring, descTh });
        }
        const labelFeatures = Array.from(classFirstRing.entries()).map(([code, { ring, descTh }]) => {
          const cx = ring.reduce((s, c) => s + c[0], 0) / ring.length;
          const cy = ring.reduce((s, c) => s + c[1], 0) / ring.length;
          return {
            type: "Feature" as const,
            geometry: { type: "Point" as const, coordinates: [cx, cy] },
            properties: { label: code }
          };
        });
        if (labelFeatures.length > 0) {
          map.addSource("lu-labels", { type: "geojson", data: { type: "FeatureCollection", features: labelFeatures } });
          map.addLayer({
            id: "lu-label-text", type: "symbol", source: "lu-labels",
            layout: {
              "text-field": ["get", "label"],
              "text-font": ["Open Sans Regular"],
              "text-size": 11,
              "text-anchor": "center",
              "text-allow-overlap": false,
            },
            paint: { "text-color": "#ffffff", "text-halo-color": "#1e293b", "text-halo-width": 1.5 }
          });
        }
      }

      // Parcel boundary — fill only when no LU data, always show outline
      if (currentPlot.geojson) {
        map.addSource("plot-parcel", {
          type: "geojson",
          data: { type: "Feature", geometry: currentPlot.geojson as any, properties: {} }
        });
        if (currentLuFeatures.length === 0) {
          map.addLayer({
            id: "parcel-fill", type: "fill", source: "plot-parcel",
            paint: { "fill-color": "#64748b", "fill-opacity": 0.05 }
          });
        }
        map.addLayer({
          id: "parcel-line", type: "line", source: "plot-parcel",
          paint: { "line-color": "#334155", "line-width": 1.5 }
        });
        processCoords((currentPlot.geojson as any).coordinates);
      }

      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: isMobile ? 30 : 40, duration: 0 });
      }
    });

    return () => { map.remove(); mapRef.current = null; };
  }, [plot.id, filteredLuFeatures.length, luCheckedKey, isMobile]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`${styles.container} ${isMobile ? styles.containerMobile : ""}`}>
      <div ref={mapContainerRef} className={styles.mapEl} />
      {filteredLuFeatures.length > 0 && legendItems.length > 0 && (
        <div className={`${styles.legend} ${isMobile ? styles.legendMobile : ""}`}>
          <div className={`${styles.legendHeader} ${isMobile ? styles.legendHeaderMobile : ""}`}>
            <i className={`bi bi-layers ${styles.legendHeaderIcon} ${isMobile ? styles.legendHeaderIconMobile : ""}`} />
            คำอธิบาย
          </div>
          <div className={`${styles.legendCaption} ${isMobile ? styles.legendCaptionMobile : ""}`}>
            *พื้นที่ที่เลือกใช้ในการประมวลผล
          </div>
          {legendItems.map(item => (
            <div key={item.code} className={`${styles.legendItem} ${isMobile ? styles.legendItemMobile : ""}`}>
              <div
                className={`${styles.legendSwatch} ${isMobile ? styles.legendSwatchMobile : ""}`}
                style={{ background: item.color, border: `1.5px solid ${item.color}` }}
              />
              <span className={`${styles.legendLabel} ${isMobile ? styles.legendLabelMobile : ""}`}>
                <span className={styles.legendLabelCode}>{item.code}</span> {item.label.startsWith(item.code) ? item.label.slice(item.code.length).trim() : item.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}