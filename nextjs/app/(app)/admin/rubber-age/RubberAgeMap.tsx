"use client";

import { useEffect, useRef } from "react";
import maplibregl, { type Map as MLMap, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export type ParcelRow = {
    id: number;
    farm_name: string;
    province: string;
    amphoe_t: string;
    grow_year: number | null;
    grow_area: string;
    geometry: GeoJSON.Geometry;
};

export type BfastResult = {
    state: "idle" | "loading" | "done" | "error";
    plantingYear?: number | null;
    age?: number | null;
    confidence?: number;
    reason?: string | null;
};

type Props = {
    parcels: ParcelRow[];
    bfastMap: Record<number, BfastResult>;
    tileUrl?: string;
    focusParcelId?: number | null;
};

const LEGEND = [
    { color: "#bbf7d0", label: "0–5 ปี",     bucket: 1 },
    { color: "#4ade80", label: "6–10 ปี",    bucket: 2 },
    { color: "#16a34a", label: "11–15 ปี",   bucket: 3 },
    { color: "#166534", label: "16–20 ปี",   bucket: 4 },
    { color: "#14532d", label: "21+ ปี",     bucket: 5 },
    { color: "#94a3b8", label: "ไม่มีข้อมูล", bucket: 0 },
    { color: "#ef4444", label: "ผิดพลาด",    bucket: -2 },
];

function ageBucket(r: BfastResult | undefined): number {
    if (!r || r.state === "idle") return 0;
    if (r.state === "loading") return -1;
    if (r.state === "error") return -2;
    if (r.age == null) return 0;
    if (r.age <= 5)  return 1;
    if (r.age <= 10) return 2;
    if (r.age <= 15) return 3;
    if (r.age <= 20) return 4;
    return 5;
}

function buildFC(parcels: ParcelRow[], bfastMap: Record<number, BfastResult>): GeoJSON.FeatureCollection {
    return {
        type: "FeatureCollection",
        features: parcels.map((p) => {
            const r = bfastMap[p.id];
            return {
                type: "Feature" as const,
                geometry: p.geometry,
                properties: {
                    id: p.id,
                    farm_name: p.farm_name ?? "",
                    province: p.province ?? "",
                    amphoe_t: p.amphoe_t ?? "",
                    grow_year: p.grow_year ?? null,
                    grow_area: p.grow_area ?? "",
                    state: r?.state ?? "idle",
                    age: r?.age ?? null,
                    planting_year: r?.plantingYear ?? null,
                    confidence: r?.confidence != null ? Math.round(r.confidence * 100) : null,
                    age_bucket: ageBucket(r),
                },
            };
        }),
    };
}

function fitBounds(map: MLMap, fc: GeoJSON.FeatureCollection) {
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    const walk = (coords: unknown) => {
        if (!Array.isArray(coords)) return;
        if (typeof coords[0] === "number") {
            minLng = Math.min(minLng, coords[0] as number);
            minLat = Math.min(minLat, coords[1] as number);
            maxLng = Math.max(maxLng, coords[0] as number);
            maxLat = Math.max(maxLat, coords[1] as number);
            return;
        }
        for (const c of coords) walk(c);
    };
    for (const f of fc.features) {
        if (f.geometry) walk((f.geometry as { coordinates: unknown }).coordinates);
    }
    if (isFinite(minLng)) {
        map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 48, maxZoom: 14, duration: 600 });
    }
}

export default function RubberAgeMap({ parcels, bfastMap, tileUrl, focusParcelId }: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<MLMap | null>(null);

    // Initialise map once
    useEffect(() => {
        if (!containerRef.current || mapRef.current) return;

        const map = new maplibregl.Map({
            container: containerRef.current,
            style: {
                version: 8,
                sources: {
                    satellite: {
                        type: "raster",
                        tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
                        tileSize: 256,
                        attribution: "© Esri",
                    },
                },
                layers: [{ id: "satellite", type: "raster", source: "satellite" }],
            },
            center: [101.25, 12.68],
            zoom: 9,
            attributionControl: false,
        });

        mapRef.current = map;

        map.on("load", () => {
            const fc = buildFC(parcels, bfastMap);

            map.addSource("parcels", { type: "geojson", data: fc, generateId: true });

            map.addLayer({
                id: "parcels-fill",
                type: "fill",
                source: "parcels",
                paint: {
                    "fill-color": [
                        "match", ["get", "age_bucket"],
                        -2, "#ef4444",
                        -1, "#fbbf24",
                         0, "#94a3b8",
                         1, "#bbf7d0",
                         2, "#4ade80",
                         3, "#16a34a",
                         4, "#166534",
                         5, "#14532d",
                        "#94a3b8",
                    ],
                    "fill-opacity": 0.78,
                },
            });

            map.addLayer({
                id: "parcels-line",
                type: "line",
                source: "parcels",
                paint: { "line-color": "#ffffff", "line-width": 0.8, "line-opacity": 0.6 },
            });

            map.addLayer({
                id: "parcels-hover",
                type: "fill",
                source: "parcels",
                paint: {
                    "fill-color": "#ffffff",
                    "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.25, 0],
                },
            });

            if (parcels.length > 0) fitBounds(map, fc);

            // Hover highlight
            let hovered: number | null = null;
            map.on("mousemove", "parcels-fill", (e) => {
                if (!e.features?.length) return;
                if (hovered !== null) map.setFeatureState({ source: "parcels", id: hovered }, { hover: false });
                hovered = e.features[0].id as number;
                map.setFeatureState({ source: "parcels", id: hovered }, { hover: true });
                map.getCanvas().style.cursor = "pointer";
            });
            map.on("mouseleave", "parcels-fill", () => {
                if (hovered !== null) map.setFeatureState({ source: "parcels", id: hovered }, { hover: false });
                hovered = null;
                map.getCanvas().style.cursor = "";
            });

            // Click popup
            const popup = new maplibregl.Popup({ closeButton: true, maxWidth: "260px" });
            map.on("click", "parcels-fill", (e) => {
                if (!e.features?.length) return;
                const p = e.features[0].properties as Record<string, unknown>;
                const age = p.age != null ? `<b>${p.age} ปี</b>` : "—";
                const py  = p.planting_year != null ? `${Number(p.planting_year) + 543}` : "—";
                const conf = p.confidence != null ? `${p.confidence}%` : "—";
                const dbYear = p.grow_year != null ? `${p.grow_year}` : "—";
                popup.setLngLat(e.lngLat).setHTML(`
                    <div style="font-size:13px;line-height:1.7;font-family:sans-serif">
                        <div style="font-weight:700;margin-bottom:2px">${p.farm_name}</div>
                        <div style="color:#6b7280;font-size:11px">${p.province} · ${p.amphoe_t} · ${p.grow_area}</div>
                        <hr style="margin:6px 0;border-color:#e5e7eb">
                        <div><span style="color:#6b7280">ปีปลูก DB:</span> ${dbYear}</div>
                        <div><span style="color:#6b7280">ปีปลูก GEE:</span> ${py}</div>
                        <div><span style="color:#6b7280">อายุ:</span> ${age}</div>
                        <div><span style="color:#6b7280">ความเชื่อมั่น:</span> ${conf}</div>
                    </div>
                `).addTo(map);
            });
        });

        return () => { map.remove(); mapRef.current = null; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // When parcel list changes: reload data AND fit bounds
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;
        const update = () => {
            const source = map.getSource("parcels") as GeoJSONSource | undefined;
            if (!source) return;
            const fc = buildFC(parcels, bfastMap);
            source.setData(fc);
            if (parcels.length > 0) fitBounds(map, fc);
        };
        if (map.loaded()) update();
        else map.once("load", update);
    // bfastMap intentionally excluded — handled by the effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [parcels]);

    // When GEE results arrive: update colors only, never re-zoom
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !map.loaded()) return;
        const source = map.getSource("parcels") as GeoJSONSource | undefined;
        if (!source) return;
        source.setData(buildFC(parcels, bfastMap));
    }, [parcels, bfastMap]);

    // GEE raster tile overlay — added/replaced when tileUrl changes
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;

        const apply = () => {
            // Remove old layer and source if present
            if (map.getLayer("gee-raster")) map.removeLayer("gee-raster");
            if (map.getSource("gee-raster")) map.removeSource("gee-raster");

            if (!tileUrl) return;

            map.addSource("gee-raster", {
                type: "raster",
                tiles: [tileUrl],
                tileSize: 256,
            });
            // Insert below the GeoJSON vector layers so parcels remain on top
            map.addLayer({
                id: "gee-raster",
                type: "raster",
                source: "gee-raster",
                paint: { "raster-opacity": 0.75 },
            }, "parcels-fill");
        };

        if (map.loaded()) apply();
        else map.once("load", apply);
    }, [tileUrl]);

    // Fly to a parcel when focusParcelId changes
    useEffect(() => {
        const map = mapRef.current;
        if (!map || focusParcelId == null) return;
        const parcel = parcels.find((p) => p.id === focusParcelId);
        if (!parcel) return;
        const fc: GeoJSON.FeatureCollection = {
            type: "FeatureCollection",
            features: [{ type: "Feature", geometry: parcel.geometry, properties: {} }],
        };
        const fly = () => {
            fitBounds(map, fc);
        };
        if (map.loaded()) fly();
        else map.once("load", fly);
    }, [focusParcelId, parcels]);

    return (
        <div className="position-relative rounded-4 overflow-hidden shadow-sm" style={{ height: 440 }}>
            <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
            {/* Legend */}
            <div className="position-absolute" style={{
                bottom: 24, left: 12,
                background: "rgba(255,255,255,0.93)",
                borderRadius: 8, padding: "8px 12px",
                fontSize: 11, boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
                backdropFilter: "blur(4px)",
            }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>อายุต้นยาง (GEE)</div>
                {LEGEND.map(({ color, label }) => (
                    <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                        <div style={{ width: 12, height: 12, borderRadius: 2, background: color, flexShrink: 0, border: "1px solid rgba(0,0,0,0.1)" }} />
                        <span>{label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
