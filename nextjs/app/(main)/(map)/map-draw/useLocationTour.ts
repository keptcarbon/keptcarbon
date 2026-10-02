"use client";

import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import type maplibregl from "maplibre-gl";
import { getPlotsLocate, type BBox, type PlotsLocateResult } from "@/lib/carbon-api";
import { MAP_DRAW_ANIMATION_DURATION } from "@/lib/map-utils";

type MLMap = maplibregl.Map;

export type TourTarget =
  | { kind: "bounds"; bounds: maplibregl.LngLatBoundsLike; maxZoom?: number }
  | { kind: "point"; center: [number, number]; zoom: number };

type Step = { bbox: BBox; apply: () => void };

// Same panel-aware padding the plot zooms already used: the step-2 panel
// covers the right side on desktop and the bottom on mobile.
export const getMapDrawPadding = (): maplibregl.PaddingOptions =>
  typeof window !== "undefined" && window.innerWidth < 768
    ? { top: 60, bottom: 350, left: 60, right: 60 }
    : { top: 80, bottom: 80, left: 80, right: 420 };

export const boundsToPolygon = (b: maplibregl.LngLatBounds): GeoJSON.Polygon => {
  const [w, s, e, n] = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
  return { type: "Polygon", coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] };
};

/**
 * Zooms to a plot, a project or a lat/long point in stages —
 * province → district → target — instead of one big jump. The subdistrict is
 * skipped: an extra stop made the tour too long, and the district boundary
 * stays visible around the plot.
 *
 * Each stage also sets the region/province/amphoe/tambon selection, so the
 * boundary layers from useBoundarySelection appear exactly as when the user
 * picks the area by hand (and step 1's dropdowns are filled). The camera is
 * driven here, not by the boundary hook: its auto-zoom is suppressed for the
 * tour, since chaining on its fetches would race.
 *
 * Stages the current selection already matches are skipped (e.g. lat/long
 * search while ระยอง is selected starts at the district). The tour stops as
 * soon as the user drags/zooms the map, or a new tour starts.
 */
export function useLocationTour({
  mapRef,
  suppressAutoZoomRef,
  selection,
  setSelectedRegion,
  setSelectedProvince,
  setSelectedAmphoe,
  setSelectedTambon,
}: {
  mapRef: MutableRefObject<MLMap | null>;
  suppressAutoZoomRef: MutableRefObject<boolean>;
  selection: { province: string; amphoe: string; tambon: string };
  setSelectedRegion: (v: string) => void;
  setSelectedProvince: (v: string) => void;
  setSelectedAmphoe: (v: string) => void;
  setSelectedTambon: (v: string) => void;
}) {
  const tourIdRef = useRef(0);
  const cleanupRef = useRef<(() => void) | null>(null);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;

  const cancelTour = useCallback(() => {
    tourIdRef.current++;
    cleanupRef.current?.();
    cleanupRef.current = null;
  }, []);

  useEffect(() => cancelTour, [cancelTour]);

  const play = useCallback((tourId: number, loc: PlotsLocateResult | null, target: TourTarget) => {
    const map = mapRef.current;
    if (!map || tourId !== tourIdRef.current) return;

    const padding = getMapDrawPadding();
    const duration = MAP_DRAW_ANIMATION_DURATION;

    const zoomToTarget = () => {
      if (target.kind === "point") {
        map.flyTo({ center: target.center, zoom: target.zoom, duration, essential: true });
        return;
      }
      const opts = { duration, maxZoom: target.maxZoom ?? 17, essential: true };
      try {
        map.fitBounds(target.bounds, { ...opts, padding });
      } catch {
        map.fitBounds(target.bounds, { ...opts, padding: 40 });
      }
    };

    // Couldn't locate (backend down, sea, spans provinces): plain zoom.
    if (!loc?.province_th || !loc.province_bbox) {
      zoomToTarget();
      return;
    }

    const region = loc.region_th ?? "";
    const province = loc.province_th;
    const amphoe = loc.district_th && loc.district_bbox ? loc.district_th : "";
    const applyAll = () => {
      setSelectedRegion(region);
      setSelectedProvince(province);
      setSelectedAmphoe(amphoe);
      setSelectedTambon("");
    };

    const levels: Step[] = [{
      bbox: loc.province_bbox,
      apply: () => { setSelectedRegion(region); setSelectedProvince(province); setSelectedAmphoe(""); setSelectedTambon(""); },
    }];
    if (amphoe) levels.push({ bbox: loc.district_bbox!, apply: () => { setSelectedAmphoe(amphoe); setSelectedTambon(""); } });

    // Skip leading levels already selected (a selected tambon would hide the
    // district boundary, so it doesn't count as a match).
    const cur = selectionRef.current;
    const wanted = [province, amphoe];
    const have = [cur.province, cur.tambon ? `${cur.amphoe}/${cur.tambon}` : cur.amphoe];
    let start = 0;
    while (start < levels.length && wanted[start] === have[start]) start++;
    const steps = levels.slice(start);

    suppressAutoZoomRef.current = true;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let onMoveEnd: (() => void) | null = null;
    const onUserMove = (e: { originalEvent?: unknown }) => {
      if (e.originalEvent) cancelTour();
    };
    const clearWait = () => {
      if (timer) clearTimeout(timer);
      if (onMoveEnd) map.off("moveend", onMoveEnd);
      timer = null;
      onMoveEnd = null;
    };
    cleanupRef.current = () => {
      clearWait();
      map.off("movestart", onUserMove);
    };
    map.on("movestart", onUserMove);

    const runStep = (i: number) => {
      if (tourId !== tourIdRef.current) return;
      clearWait();
      if (i >= steps.length) {
        applyAll();
        zoomToTarget();
        cleanupRef.current?.();
        cleanupRef.current = null;
        return;
      }
      steps[i].apply();
      const [w, s, e, n] = steps[i].bbox;
      try {
        map.fitBounds([[w, s], [e, n]], { padding, duration, essential: true });
      } catch {
        map.fitBounds([[w, s], [e, n]], { padding: 40, duration, essential: true });
      }
      // Listen after starting the move: fitBounds stops any running
      // animation, which fires a moveend of its own. The timer covers a
      // move that ends immediately (camera already there).
      const next = () => runStep(i + 1);
      onMoveEnd = next;
      map.once("moveend", next);
      timer = setTimeout(next, duration + 300);
    };

    runStep(0);
  }, [mapRef, suppressAutoZoomRef, cancelTour, setSelectedRegion, setSelectedProvince, setSelectedAmphoe, setSelectedTambon]);

  /** Tour to a target whose location is already known (e.g. lat/long search). */
  const playTour = useCallback((loc: PlotsLocateResult | null, target: TourTarget) => {
    cancelTour();
    play(tourIdRef.current, loc, target);
  }, [cancelTour, play]);

  /** Locate `geometry` (a plot, or a project's bounding box), then tour to `target`. */
  const startTour = useCallback(async (geometry: GeoJSON.Geometry, target: TourTarget) => {
    cancelTour();
    const tourId = tourIdRef.current;
    let loc: PlotsLocateResult | null = null;
    try {
      [loc] = await getPlotsLocate([{ id: "tour", geometry }]);
    } catch (err) {
      console.error("plots/locate failed, zooming directly:", err);
    }
    play(tourId, loc, target);
    return loc;
  }, [cancelTour, play]);

  return { startTour, playTour, cancelTour };
}
