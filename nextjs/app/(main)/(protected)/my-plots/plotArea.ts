import type { SavedPlot } from "./types";

/**
 * The one area to show for a plot, so every page agrees:
 *  - assessed  -> the area the current assessment was calculated on (the
 *                 selected land-use classes, geodesic; assess_parameters.area_m2,
 *                 sent by the API as selectedAreaRai). Tree count and carbon
 *                 are based on this.
 *  - otherwise -> the plot's own area (tbl_plots.area_m2).
 * The project list total (/api/plots?summary=true) uses the same rule in SQL.
 */
export function plotDisplayArea(plot: SavedPlot): { rai: number; assessed: boolean } {
  const assessed = !!plot.processed && (plot.selectedAreaRai ?? 0) > 0;
  return { rai: assessed ? (plot.selectedAreaRai as number) : (plot.areaRai || 0), assessed };
}

export const AREA_LABEL_ASSESSED = "พื้นที่ที่ใช้ประเมิน";
export const AREA_LABEL_PLOT = "พื้นที่แปลง";

/** Explains the rule wherever a column/total mixes assessed and unassessed plots. */
export const AREA_RULE_NOTE =
  "แปลงที่ประเมินแล้ว แสดงพื้นที่ที่ใช้ประเมิน (เฉพาะประเภทการใช้ที่ดินที่เลือก ซึ่งใช้คำนวณจำนวนต้นและคาร์บอน) " +
  "แปลงที่ยังไม่ประเมิน แสดงพื้นที่แปลง";
