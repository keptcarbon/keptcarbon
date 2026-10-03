import type { AssessParameters, CarbonSimulationRow } from "@/lib/carbon-api";

/** A /carbon/sim row before the UI's rotation/replanting sliders are applied. */
export type SimBaseRow = Omit<CarbonSimulationRow, "rotation_year" | "replanting_rate">;

export type SimRowsResult =
  | { ok: true; rows: SimBaseRow[] }
  | { ok: false; missing: string[] };

type Cohort = { year: number; share: number };

/** year_of_planting.value is either a single CE year (user input) or
 *  ["2001 (53.2%)", "2000 (46.8%)"] (raster cohorts); shares are normalized
 *  by their own sum since the rounded percentages needn't add to 100. */
function parseCohorts(value: AssessParameters["year_of_planting"]["value"] | undefined): Cohort[] {
  if (typeof value === "number") return value > 0 ? [{ year: value, share: 1 }] : [];
  if (!Array.isArray(value)) return [];
  const parsed = value.flatMap((s) => {
    const year = s.match(/^(\d{4})/);
    if (!year) return [];
    const pct = s.match(/\(([\d.]+)%\)/);
    return [{ year: parseInt(year[1]), weight: pct ? parseFloat(pct[1]) : 1 }];
  });
  const total = parsed.reduce((sum, c) => sum + c.weight, 0);
  if (!total) return [];
  return parsed.map((c) => ({ year: c.year, share: c.weight / total }));
}

/** Splits an integer total by shares, largest remainder first, so the parts add back up to the total. */
function splitInteger(total: number, shares: number[]): number[] {
  const exact = shares.map((s) => total * s);
  const parts = exact.map(Math.floor);
  let left = total - parts.reduce((a, b) => a + b, 0);
  const byRemainder = exact.map((v, i) => ({ i, r: v - Math.floor(v) })).sort((a, b) => b.r - a.r);
  for (const { i } of byRemainder) {
    if (left <= 0) break;
    parts[i] += 1;
    left -= 1;
  }
  return parts;
}

const str = (v: unknown) => (v == null || v === "" ? "" : String(v));

/**
 * Builds the /carbon/sim cohort rows from a plot's saved assessment parameters —
 * one row per planting year, with area and tree count split by that year's share.
 * `fallbackPCode` (tbl_plots.province_code) covers assessments saved before
 * assess_parameters carried p_code.
 */
export function buildSimRows(ep: AssessParameters | null | undefined, fallbackPCode?: string): SimRowsResult {
  if (!ep) return { ok: false, missing: ["assess_parameters"] };

  const fallback = fallbackPCode && fallbackPCode !== "UNK" ? fallbackPCode : "";
  const shared = {
    p_code: str(ep.p_code) || fallback,
    // rubber_clone.value is the clone the assessment's biomass lookup used.
    clone: str(ep.rubber_clone?.value),
    growth_model: str(ep.growth_model?.value),
    allometry: str(ep.allometry?.value),
    biomass_profile_version: str(ep.biomass_profile_version?.value),
    // Display values can carry a density suffix, e.g. "2.5x8 (500 ต้น/ha)".
    spacing_system: str(ep.spacing_system?.value).replace(/\s*\([^)]*\)/, "").trim(),
  };
  const cohorts = parseCohorts(ep.year_of_planting?.value);
  const area = typeof ep.area_m2 === "number" && ep.area_m2 > 0 ? ep.area_m2 : 0;

  const missing = [
    ...Object.entries(shared).filter(([, v]) => !v).map(([k]) => k),
    ...(cohorts.length ? [] : ["year_of_planting"]),
    ...(area ? [] : ["area_m2"]),
  ];
  if (missing.length) return { ok: false, missing };

  const totalTrees = typeof ep.tree_count?.value === "number" ? Math.round(ep.tree_count.value) : null;
  const trees = totalTrees != null ? splitInteger(totalTrees, cohorts.map((c) => c.share)) : null;

  const rows = cohorts
    .map((c, i) => ({
      ...shared,
      year_of_planting: c.year,
      area_m2: area * c.share,
      tree_count: trees ? trees[i] : null,
    }))
    // A sliver cohort that rounds to 0 trees adds nothing to the profile.
    .filter((r) => r.tree_count !== 0);

  return rows.length ? { ok: true, rows } : { ok: false, missing: ["tree_count"] };
}
