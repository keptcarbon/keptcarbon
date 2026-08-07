import { describe, it, expect } from "vitest";
import {
  truncateCoords,
  polygonAreaM2,
  carbonForAge,
  utmToWgs84,
  emptyFC,
} from "@/lib/map-utils";

// ── truncateCoords ────────────────────────────────────────────────────────────

describe("truncateCoords", () => {
  it("truncates coordinates to 6 decimal places", () => {
    const input: GeoJSON.Geometry = {
      type: "Polygon",
      coordinates: [[[100.123456789, 12.987654321]]],
    };
    const result = truncateCoords(input) as GeoJSON.Polygon;
    expect(result.coordinates[0][0][0]).toBe(100.123457);
    expect(result.coordinates[0][0][1]).toBe(12.987654);
  });

  it("preserves geometry type", () => {
    const input: GeoJSON.Geometry = {
      type: "MultiPolygon",
      coordinates: [[[[101.0, 12.0], [101.1, 12.0], [101.1, 12.1], [101.0, 12.0]]]],
    };
    expect(truncateCoords(input).type).toBe("MultiPolygon");
  });

  it("handles already-truncated coordinates unchanged", () => {
    const input: GeoJSON.Geometry = {
      type: "Polygon",
      coordinates: [[[100.123456, 12.654321]]],
    };
    const result = truncateCoords(input) as GeoJSON.Polygon;
    expect(result.coordinates[0][0][0]).toBe(100.123456);
    expect(result.coordinates[0][0][1]).toBe(12.654321);
  });
});

// ── polygonAreaM2 ─────────────────────────────────────────────────────────────

describe("polygonAreaM2", () => {
  // A roughly 1km² square near Rayong (approx values)
  const SQUARE_1KM: [number, number][] = [
    [101.0, 12.0],
    [101.009, 12.0],
    [101.009, 12.009],
    [101.0, 12.009],
  ];

  it("returns a positive number", () => {
    expect(polygonAreaM2(SQUARE_1KM)).toBeGreaterThan(0);
  });

  it("returns approximately 1km² for a ~1km square", () => {
    const area = polygonAreaM2(SQUARE_1KM);
    // Expect within 5% of 1,000,000 m²
    expect(area).toBeGreaterThan(950_000);
    expect(area).toBeLessThan(1_050_000);
  });

  it("larger polygon has larger area", () => {
    const small: [number, number][] = [
      [101.0, 12.0], [101.001, 12.0], [101.001, 12.001], [101.0, 12.001],
    ];
    const large: [number, number][] = [
      [101.0, 12.0], [101.01, 12.0], [101.01, 12.01], [101.0, 12.01],
    ];
    expect(polygonAreaM2(large)).toBeGreaterThan(polygonAreaM2(small));
  });

  it("returns 0 for a degenerate point polygon", () => {
    const pt: [number, number][] = [[101.0, 12.0], [101.0, 12.0]];
    expect(polygonAreaM2(pt)).toBe(0);
  });
});

// ── carbonForAge ──────────────────────────────────────────────────────────────

describe("carbonForAge", () => {
  it("returns all expected fields", () => {
    const result = carbonForAge(10, 500);
    expect(result).toHaveProperty("H");
    expect(result).toHaveProperty("D");
    expect(result).toHaveProperty("AGB");
    expect(result).toHaveProperty("BGB");
    expect(result).toHaveProperty("co2");
  });

  it("co2 increases with age (up to canopy closure)", () => {
    const young = carbonForAge(5, 500).co2;
    const old   = carbonForAge(15, 500).co2;
    expect(old).toBeGreaterThan(young);
  });

  it("co2 scales linearly with tree count", () => {
    const single = carbonForAge(10, 100).co2;
    const double = carbonForAge(10, 200).co2;
    expect(double).toBeCloseTo(single * 2, 5);
  });

  it("height is capped at 28m", () => {
    expect(carbonForAge(100, 100).H).toBe(28);
  });

  it("diameter is capped at 60cm", () => {
    expect(carbonForAge(100, 100).D).toBe(60);
  });

  it("BGB is 26% of AGB", () => {
    const { AGB, BGB } = carbonForAge(10, 100);
    expect(BGB).toBeCloseTo(AGB * 0.26, 10);
  });

  it("returns 0 co2 for 0 trees", () => {
    expect(carbonForAge(10, 0).co2).toBe(0);
  });

  it("age 0 returns minimal but non-negative values", () => {
    const { co2 } = carbonForAge(0, 100);
    expect(co2).toBeGreaterThanOrEqual(0);
  });
});

// ── utmToWgs84 ────────────────────────────────────────────────────────────────

describe("utmToWgs84", () => {
  it("converts UTM zone 47N to approximate WGS84 for Thailand", () => {
    // Approx UTM for Bangkok area (zone 47N)
    const [lng, lat] = utmToWgs84(661700, 1514300, 47, true);
    expect(lng).toBeCloseTo(100.5, 0);
    expect(lat).toBeCloseTo(13.7, 0);
  });

  it("returns array of two numbers", () => {
    const result = utmToWgs84(500000, 1400000, 47, true);
    expect(result).toHaveLength(2);
    expect(typeof result[0]).toBe("number");
    expect(typeof result[1]).toBe("number");
  });
});

// ── emptyFC ───────────────────────────────────────────────────────────────────

describe("emptyFC", () => {
  it("returns a valid empty FeatureCollection", () => {
    const fc = emptyFC();
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features).toEqual([]);
  });
});
