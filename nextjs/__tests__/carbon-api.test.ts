import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { estimateCarbon, getCurrentYearBE, type PlantationPolygon } from "@/lib/carbon-api";

const POLYGON: PlantationPolygon = {
  id: "plot_0",
  geometry: {
    type: "MultiPolygon",
    coordinates: [[[[101.438, 12.807], [101.445, 12.809], [101.447, 12.802], [101.438, 12.807]]]],
  },
  year_of_planting: 2010,
  rubber_clone: "RRIM 600",
  tree_count: 500,
  spacing_system: "2.5x8",
};

const SUCCESS_RESPONSE = [
  {
    polygon_id: "plot_0",
    status: { status: "success", status_code: "S03", message: "OK" },
    carbon_profile: [
      { year: 2026, total_carbon_tCO2e: 50.0, ci_lower_tCO2e: 45.0, ci_upper_tCO2e: 55.0 },
    ],
  },
];

// ── getCurrentYearBE ──────────────────────────────────────────────────────────

describe("getCurrentYearBE", () => {
  it("returns current CE year + 543", () => {
    const ce = new Date().getFullYear();
    expect(getCurrentYearBE()).toBe(ce + 543);
  });

  it("returns a number greater than 2567", () => {
    expect(getCurrentYearBE()).toBeGreaterThan(2567);
  });
});

// ── estimateCarbon ────────────────────────────────────────────────────────────

describe("estimateCarbon", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls the correct endpoint", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => SUCCESS_RESPONSE,
    });
    await estimateCarbon([POLYGON]);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/estimate"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("sends polygons as JSON body", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => SUCCESS_RESPONSE,
    });
    await estimateCarbon([POLYGON]);
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body[0].id).toBe("plot_0");
  });

  it("returns parsed EstimationResponse array on success", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => SUCCESS_RESPONSE,
    });
    const result = await estimateCarbon([POLYGON]);
    expect(result).toHaveLength(1);
    expect(result[0].polygon_id).toBe("plot_0");
    expect(result[0].carbon_profile).not.toBeNull();
  });

  it("throws on non-ok response", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ detail: "Server error" }),
    });
    await expect(estimateCarbon([POLYGON])).rejects.toThrow("Backend API error: 500");
  });

  it("throws on network failure", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Network unreachable"));
    await expect(estimateCarbon([POLYGON])).rejects.toThrow("Network unreachable");
  });

  it("sends Content-Type: application/json header", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => [],
    });
    await estimateCarbon([]);
    const headers = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].headers;
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("handles empty polygon array", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => [],
    });
    const result = await estimateCarbon([]);
    expect(result).toEqual([]);
  });
});
