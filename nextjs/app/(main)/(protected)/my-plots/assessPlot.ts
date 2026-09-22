import { profileToBarPoints } from "@/app/components/organisms/ParcelResultsPanel/CarbonBarChart";
import type { CarbonAssessRequest, CarbonAssessResponse } from "@/lib/carbon-api";
import type { SavedPlot } from "./types";

/** Builds the /carbon/assess request payload for one plot's current (possibly just-edited) data. */
export function buildAssessRequest(plot: SavedPlot): CarbonAssessRequest {
  let geom = plot.geojson as GeoJSON.Geometry;
  if (!geom && plot.boundaryGeojson) {
    geom = plot.boundaryGeojson as GeoJSON.Geometry;
  }

  const luFeatures = plot.backendData?.lu_polygon || [];
  const luChecked = plot.luChecked || { A: true, A302: true };

  let combinedGeom = geom;
  if (luFeatures.length > 0) {
    const allRings: GeoJSON.Position[][][] = [];
    for (const feat of luFeatures) {
      const code = (feat as any).properties?.lu_class as string | undefined;
      const P = code ? code.charAt(0).toUpperCase() : "";
      if (!code || luChecked[code] || luChecked[P] || code === "A302") {
        const fGeom = feat.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon;
        if (fGeom.type === "Polygon") allRings.push(fGeom.coordinates);
        else if (fGeom.type === "MultiPolygon") allRings.push(...fGeom.coordinates);
      }
    }
    if (allRings.length > 0) {
      combinedGeom = allRings.length === 1
        ? { type: "Polygon", coordinates: allRings[0] }
        : { type: "MultiPolygon", coordinates: allRings };
    }
  }

  const userYearBE = plot.backendData?.form?.plantYear ? parseInt(plot.backendData.form.plantYear) : 0;

  return {
    id: plot.id,
    geometry: combinedGeom,
    // Only send to backend if the user EXPLICITLY filled it out in the form
    year_of_planting: userYearBE > 0 ? userYearBE - 543 : null,
    rubber_clone: plot.backendData?.form?.variety || null,
    tree_count: plot.backendData?.form?.treeCount ? parseInt(plot.backendData.form.treeCount) : null,
    spacing_system: plot.backendData?.form?.spacing || null,
    growth_model: plot.backendData?.form?.growthModel || null,
    allometry: plot.backendData?.form?.allometry || null,
    selected_lu_classes: Object.entries(plot.luChecked || {})
      .filter(([_, on]) => on)
      .map(([cls]) => cls),
    project_type: (plot.plantStatus as "replanting" | "existing") || undefined,
  };
}

/** Folds a /carbon/assess response back into the plot, mirroring the backend's derived fields. */
export function applyAssessResponse(plot: SavedPlot, resp: CarbonAssessResponse | undefined): SavedPlot {
  if (!resp) return plot;

  const CURRENT_BE_NOW = new Date().getFullYear() + 543;
  const ep = resp.assess_parameters;

  const epPlantYearCE = typeof ep?.year_of_planting?.value === "number" ? ep.year_of_planting.value : 0;
  const epPlantYearBE = epPlantYearCE > 0 ? epPlantYearCE + 543 : 0;
  const epTrees = typeof ep?.tree_count?.value === "number" ? ep.tree_count.value : 0;
  const epVariety = typeof ep?.rubber_clone?.value === "string" ? ep.rubber_clone.value : "";
  const epSpacingRaw = typeof ep?.spacing_system?.value === "string" ? ep.spacing_system.value : "";
  const epSpacing = epSpacingRaw.replace(/\s*\([^)]*\)/, "").trim();

  // Use the already-saved selectedAreaRai (from original map-draw selection) as first priority.
  // Only recalculate from LU features if it hasn't been set yet.
  let selectedAreaRai = plot.selectedAreaRai && plot.selectedAreaRai > 0 ? plot.selectedAreaRai : 0;
  if (selectedAreaRai <= 0) {
    const luFeatures = plot.backendData?.lu_polygon || [];
    const luChecked = plot.luChecked || { A: true, A302: true };
    const luAreaRai = luFeatures.reduce((acc: number, feat: any) => {
      const code = feat.properties?.LU_CODE || feat.properties?.lu_code || "";
      const P = code.charAt(0).toUpperCase();
      if (luChecked[code] || luChecked[P]) {
        return acc + (feat.properties?.areaRai || 0);
      }
      return acc;
    }, 0);
    selectedAreaRai = luAreaRai > 0 ? luAreaRai : plot.areaRai;
  }

  const formVariety = plot.backendData?.form?.variety || "";
  const formSpacing = plot.backendData?.form?.spacing || "";
  const formTrees = plot.backendData?.form?.treeCount ? parseInt(plot.backendData.form.treeCount) : 0;
  const userPlantYear = plot.plantYearBE || 0;

  const variety = formVariety || plot.variety || epVariety;
  const spacing = formSpacing || plot.spacing || epSpacing;

  const currentSpacing = spacing || "2.5x8";
  const density = currentSpacing === "2.5x7" ? 91 : (currentSpacing === "3x7" ? 76 : (currentSpacing === "3x8" ? 66 : 80));

  let crTrees = formTrees > 0 ? formTrees : Math.round(selectedAreaRai * density);
  if (crTrees <= 0 && epTrees > 0) crTrees = epTrees;

  const age = userPlantYear > 0 ? (CURRENT_BE_NOW - userPlantYear) : (epPlantYearBE > 0 ? (CURRENT_BE_NOW - epPlantYearBE) : 0);
  const finalPlantYear = userPlantYear > 0 ? userPlantYear : epPlantYearBE;

  const rawProfile = resp.carbon_profile ?? [];
  const hasNewResult = rawProfile.length > 0;
  if (!hasNewResult) {
    console.warn('[ประเมินคาร์บอน] ⚠️ Empty carbon_profile for plot id:', plot.id, resp.status);
  }
  // Only flip to processed when this attempt actually returned profile data —
  // otherwise a failed/partial backend response would show the green
  // "ประมวลผลแล้ว" badge while the graph tab (gated on carbonProfile) stays empty.
  const co2Now = hasNewResult ? (rawProfile[0]?.stocks?.value ?? 0) : (plot.carbonTotal || 0);
  const carbonProfile = hasNewResult ? profileToBarPoints(rawProfile, age) : (plot.carbonProfile || []);

  return {
    ...plot,
    processed: hasNewResult ? true : (plot.processed || false),
    carbonTotal: co2Now,
    rubberAge: age,
    plantYearBE: finalPlantYear,
    trees: crTrees,
    variety,
    spacing,
    selectedAreaRai,
    carbonProfile,
    backendData: {
      ...plot.backendData,
      age,
      plantYearBE: epPlantYearBE,
      ep: ep || null,
    }
  };
}
