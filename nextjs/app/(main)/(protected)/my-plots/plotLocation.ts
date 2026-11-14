import type { SavedPlot } from "./types";

/** "ต.ทางเกวียน อ.แกลง จ.ระยอง" — missing parts are left out; "" when unknown. */
export function formatPlotLocation(plot: Pick<SavedPlot, "provinceName" | "district" | "subdistrict">): string {
  return [
    plot.subdistrict && `ต.${plot.subdistrict}`,
    plot.district && `อ.${plot.district}`,
    plot.provinceName && `จ.${plot.provinceName}`,
  ].filter(Boolean).join(" ");
}
