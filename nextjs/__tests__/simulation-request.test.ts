import { describe, it, expect } from "vitest";
import { buildSimRows } from "@/app/(main)/(protected)/my-plots/simulationRequest";
import type { AssessParameters } from "@/lib/carbon-api";

const simple = (value: string | number, source = "default value applied") => ({ value, note: null, source });

function ep(overrides: Partial<AssessParameters> = {}): AssessParameters {
  return {
    p_code: "RAY",
    area_m2: 81363.1966,
    allometry: simple("hytönen_2018"),
    tree_count: simple(4313, "calculated from area and spacing system"),
    growth_model: simple("anchored_weibull"),
    rubber_clone: simple("RRIM 600"),
    spacing_system: simple("2.5x8", "default value"),
    year_of_planting: {
      note: ["2005 (93.9%)", "1991 (3.1%)", "2021 (2.0%)"],
      value: ["2005 (100.0%)"],
      source: "calculated from raster",
    },
    biomass_profile_version: simple("v1"),
    ...overrides,
  };
}

describe("buildSimRows", () => {
  it("single raster cohort → one row with the full area and tree count", () => {
    const res = buildSimRows(ep());
    expect(res).toEqual({
      ok: true,
      rows: [{
        p_code: "RAY", clone: "RRIM 600", growth_model: "anchored_weibull", allometry: "hytönen_2018",
        biomass_profile_version: "v1", spacing_system: "2.5x8",
        year_of_planting: 2005, area_m2: 81363.1966, tree_count: 4313,
      }],
    });
  });

  it("uses value, not note", () => {
    const res = buildSimRows(ep());
    expect(res.ok && res.rows.map((r) => r.year_of_planting)).toEqual([2005]);
  });

  it("splits area and trees by cohort share", () => {
    const res = buildSimRows(ep({
      area_m2: 66900.2031,
      tree_count: simple(3344),
      year_of_planting: { note: null, value: ["2001 (53.2%)", "2000 (46.8%)"], source: "calculated from raster" },
    }));
    if (!res.ok) throw new Error("expected rows");
    expect(res.rows.map((r) => r.year_of_planting)).toEqual([2001, 2000]);
    expect(res.rows[0].area_m2).toBeCloseTo(66900.2031 * 0.532, 4);
    expect(res.rows[1].area_m2).toBeCloseTo(66900.2031 * 0.468, 4);
    expect(res.rows.map((r) => r.tree_count)).toEqual([1779, 1565]);
  });

  it("tree counts always add back up to the assessed total", () => {
    const res = buildSimRows(ep({
      tree_count: simple(1000),
      year_of_planting: { note: null, value: ["2001 (33.3%)", "2002 (33.3%)", "2003 (33.3%)"], source: "calculated from raster" },
    }));
    if (!res.ok) throw new Error("expected rows");
    expect(res.rows.reduce((s, r) => s + (r.tree_count ?? 0), 0)).toBe(1000);
  });

  it("drops cohorts that round to zero trees", () => {
    const res = buildSimRows(ep({
      tree_count: simple(10),
      year_of_planting: { note: null, value: ["2001 (99.0%)", "1990 (1.0%)"], source: "calculated from raster" },
    }));
    expect(res.ok && res.rows.map((r) => [r.year_of_planting, r.tree_count])).toEqual([[2001, 10]]);
  });

  it("user-entered year (a number) → one row", () => {
    const res = buildSimRows(ep({ year_of_planting: { note: null, value: 2015, source: "user input" } }));
    expect(res.ok && res.rows.map((r) => [r.year_of_planting, r.tree_count])).toEqual([[2015, 4313]]);
  });

  it("falls back to the plot's province for assessments saved before p_code", () => {
    const res = buildSimRows(ep({ p_code: undefined }), "RAY");
    expect(res.ok && res.rows[0].p_code).toBe("RAY");
  });

  it("uses rubber_clone.value (the clone used), not the user's input kept in note", () => {
    const res = buildSimRows(ep({ rubber_clone: { value: "RRIM 600", note: "RRIT 251", source: "default value applied" } }));
    expect(res.ok && res.rows[0].clone).toBe("RRIM 600");
  });

  it("strips a density suffix from the spacing value", () => {
    const res = buildSimRows(ep({ spacing_system: simple("2.5x8 (500 ต้น/ha)") }));
    expect(res.ok && res.rows[0].spacing_system).toBe("2.5x8");
  });

  it("sends tree_count null when the assessment has no count, letting the backend derive it", () => {
    const res = buildSimRows(ep({ tree_count: simple("") }));
    expect(res.ok && res.rows[0].tree_count).toBeNull();
  });

  it("reports missing fields instead of building a bad payload", () => {
    expect(buildSimRows(ep({ p_code: undefined }), "UNK")).toEqual({ ok: false, missing: ["p_code"] });
    expect(buildSimRows(null)).toEqual({ ok: false, missing: ["assess_parameters"] });
    const noYear = buildSimRows(ep({ year_of_planting: { note: null, value: [], source: "calculated from raster" } }));
    expect(noYear).toEqual({ ok: false, missing: ["year_of_planting"] });
  });
});
