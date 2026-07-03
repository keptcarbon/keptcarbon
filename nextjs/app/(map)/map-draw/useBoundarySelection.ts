"use client";

import { useEffect, useState, type MutableRefObject } from "react";
import type maplibregl from "maplibre-gl";
import { zoomToGeoJSONFeatures } from "./utils";

type MLMap = maplibregl.Map;

/**
 * Owns the region → province → amphoe → tambon drill-down selection state,
 * the amphoe/tambon lookups from the DB, and the map boundary-layer sync
 * effects that highlight whichever level is currently selected.
 *
 * Extracted verbatim from the main map-draw page — behavior is unchanged,
 * only the closed-over values were threaded through as parameters.
 */
export function useBoundarySelection({
  mapRef,
  mapLoadedRef,
  mapLoaded,
}: {
  mapRef: MutableRefObject<MLMap | null>;
  mapLoadedRef: MutableRefObject<boolean>;
  mapLoaded: boolean;
}) {
  const [selectedRegion, setSelectedRegion] = useState("");
  const [selectedProvince, setSelectedProvince] = useState("");
  const [selectedAmphoe, setSelectedAmphoe] = useState("");
  const [selectedTambon, setSelectedTambon] = useState("");
  const [amphoesFromDb, setAmphoesFromDb] = useState<string[]>([]);
  const [tambonsFromDb, setTambonsFromDb] = useState<string[]>([]);
  const [tambonsLoading, setTambonsLoading] = useState(false);

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

  return {
    selectedRegion, setSelectedRegion,
    selectedProvince, setSelectedProvince,
    selectedAmphoe, setSelectedAmphoe,
    selectedTambon, setSelectedTambon,
    amphoesFromDb,
    tambonsFromDb,
    tambonsLoading,
  };
}