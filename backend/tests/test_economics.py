"""Unit tests for app/services/economics.py and CarbonService.get_carbon_economics."""
import math
import pytest
from unittest.mock import AsyncMock, patch

from app.services import economics
from app.services.carbon_service import CarbonService

SLIDE_COSTS = {"pdd": 400_000, "validation": 200_000, "monitoring_per_round": 400_000, "verification_per_round": 200_000}


def ev(stock, area_m2, costs, price, every, rate, overrides=None):
    """evaluate() with the regular every-k-years round pattern."""
    return economics.evaluate(stock, area_m2, costs, price, economics.verification_years(every), rate, overrides)


def linear_stock(cs_per_rai: float, area_rai: float, years: int = 7):
    """Stock path gaining cs_per_rai * area_rai evenly over the period."""
    total = cs_per_rai * area_rai
    return [total * t / years for t in range(years + 1)]


@pytest.mark.parametrize("every,expected", [
    (1, [1, 2, 3, 4, 5, 6, 7]),
    (2, [2, 4, 6, 7]),
    (3, [3, 6, 7]),
    (7, [7]),
])
def test_verification_years(every, expected):
    assert economics.verification_years(every) == expected


@pytest.mark.parametrize("cs,expected_rai", [
    # Slide examples: 1.2M baht total cost, 100 baht/tCO2eq, 1 verification.
    (12.71, 944.14),   # age 0  (slide: 944.49 from unrounded CS)
    (22.13, 542.25),   # age 7  (slide: 542.16)
    (9.97, 1203.61),   # age 21 (slide: 1,202.68)
])
def test_min_viable_area_matches_slides(cs, expected_rai):
    res = ev(linear_stock(cs, 100), 100 * economics.RAI_M2, SLIDE_COSTS, 100, 7, 0.05)
    assert res["total_cost_thb"] == 1_200_000
    assert res["credits_per_rai_tCO2e"] == pytest.approx(cs)
    assert res["min_viable_area_rai"] == pytest.approx(expected_rai, abs=0.01)


def test_break_even_at_min_area_is_exactly_zero_profit():
    area = 1_200_000 / (12.71 * 100)
    res = ev(linear_stock(12.71, area), area * economics.RAI_M2, SLIDE_COSTS, 100, 7, 0.0)
    assert res["net_profit_thb"] == pytest.approx(0, abs=0.05)
    assert res["break_even_price_thb"] == pytest.approx(100, abs=0.01)


def test_more_rounds_higher_cost_and_lose_fractions():
    stock = linear_stock(12.71, 2000)  # 25,420 t, 3,631.43 t/year
    yearly = ev(stock, 2000 * economics.RAI_M2, SLIDE_COSTS, 100, 1, 0.05)
    once = ev(stock, 2000 * economics.RAI_M2, SLIDE_COSTS, 100, 7, 0.05)
    # Each round is rounded down on its own, so yearly rounds drop each year's fraction.
    assert once["total_credits_tCO2e"] == 25_420
    assert yearly["total_credits_tCO2e"] == 7 * 3_631
    assert yearly["total_cost_thb"] == 600_000 + 7 * 600_000
    assert yearly["break_even_price_thb"] > once["break_even_price_thb"]


def test_schedule_cash_flows():
    res = ev(linear_stock(12.71, 2000), 2000 * economics.RAI_M2, SLIDE_COSTS, 100, 3, 0.0)
    sched = res["schedule"]
    assert [s["year_at"] for s in sched if s["is_verification"]] == [3, 6, 7]
    assert sched[0]["cost_thb"] == 600_000
    assert sched[1]["net_thb"] == 0
    assert sched[-1]["cumulative_net_thb"] == pytest.approx(res["net_profit_thb"], abs=0.05)
    # Credits issued at each round = growth since the previous round, rounded down.
    stock = linear_stock(12.71, 2000)
    assert [sched[t]["credits_issued_tCO2e"] for t in (3, 6, 7)] == [
        math.floor(stock[3] - stock[0]), math.floor(stock[6] - stock[3]), math.floor(stock[7] - stock[6] + 1e-9),
    ]
    assert all(isinstance(sched[t]["credits_issued_tCO2e"], int) for t in range(8))


def test_payback_and_irr_none_when_never_positive():
    # Final round revenue (127,100) < round cost (600,000): every cash flow is negative.
    res = ev(linear_stock(12.71, 100), 100 * economics.RAI_M2, SLIDE_COSTS, 100, 7, 0.05)
    assert res["is_viable"] is False
    assert res["payback_year_at"] is None
    assert res["irr"] is None


def test_negative_irr_when_partial_recovery():
    # Final round nets +35,500 but never repays the 600,000 upfront.
    res = ev(linear_stock(12.71, 100), 100 * economics.RAI_M2, SLIDE_COSTS, 500, 7, 0.05)
    assert res["is_viable"] is False
    assert res["irr"] is not None and res["irr"] < 0
    # irr is rounded to 6 dp; near -30% the year-7 flow is scaled ~15x, so allow a few baht.
    assert economics.npv([s["net_thb"] for s in res["schedule"]], res["irr"]) == pytest.approx(0, abs=10)


def test_viable_project_payback_and_positive_irr():
    res = ev(linear_stock(12.71, 2000), 2000 * economics.RAI_M2, SLIDE_COSTS, 100, 7, 0.05)
    assert res["is_viable"] is True
    assert res["payback_year_at"] == 7
    assert res["irr"] > 0.05 and res["npv_thb"] > 0


def test_npv_and_irr_simple():
    assert economics.npv([-100, 110], 0.1) == pytest.approx(0)
    assert economics.irr([-100, 110]) == pytest.approx(0.1, abs=1e-6)
    assert economics.irr([-100, -10]) is None


def test_discounted_break_even_above_undiscounted():
    res = ev(linear_stock(12.71, 2000), 2000 * economics.RAI_M2, SLIDE_COSTS, 100, 7, 0.05)
    assert res["discounted_break_even_price_thb"] > res["break_even_price_thb"]


def test_stock_path_clamps_past_max_age_and_zero_before_planting():
    profile = {a: float(a) for a in range(36)}
    assert economics.stock_path(profile, 1, 32, 35, 1.0) == [32, 33, 34, 35, 35, 35, 35, 35]
    assert economics.stock_path(profile, 1, -2, 35, 1.0)[:3] == [0, 0, 0]


def test_age_matrix_ranges_and_min_area():
    profile = {a: float(a) for a in range(36)}
    rows = economics.age_matrix(profile, 80, 35, 0.01, 1_200_000, 100)
    assert [r["start_age"] for r in rows] == list(range(29))
    # 7 kg/tree * 80 trees/rai * 0.01 tCO2e/kg = 5.6 tCO2e/rai
    assert rows[0]["credits_per_rai_tCO2e"] == pytest.approx(5.6)
    assert rows[0]["min_viable_area_rai"] == pytest.approx(1_200_000 / 560, abs=0.01)


# ── Service: get_carbon_economics with the DB loader mocked ──────────────────

ROW = {
    "p_code": "RAY", "clone": "RRIM 600", "growth_model": "anchored_weibull", "allometry": "chiarawipa",
    "biomass_profile_version": "v1", "area_m2": 16_000.0, "tree_count": None, "spacing_system": "2.5x8",
}


@pytest.fixture
def svc():
    with patch.object(CarbonService, "__init__", lambda self: None):
        s = CarbonService()
    profile = {a: {"age": a, "biomass_est": a * 10.0} for a in range(36)}
    s._load_biomass_and_trees = AsyncMock(return_value=(profile, 800))
    return s


def _req(rows, **kw):
    return {
        "rows": rows, "costs": SLIDE_COSTS, "price_thb_per_tCO2e": 100, "verify_every_years": 7,
        "discount_rate": 0.05, "compare_frequencies": [1, 2, 3, 7], **kw,
    }


@pytest.mark.asyncio
async def test_service_groups_cohorts_by_plot(svc):
    from datetime import datetime
    year = datetime.now().year
    rows = [
        {**ROW, "year_of_planting": year - 5, "plot_id": "p1", "label": "A"},
        {**ROW, "year_of_planting": year - 10, "plot_id": "p1", "label": "A"},
        {**ROW, "year_of_planting": year - 30, "plot_id": "p2", "label": "B"},
    ]
    res = await svc.get_carbon_economics(_req(rows))
    assert res["start_year"] == year
    assert res["total_area_rai"] == pytest.approx(30)
    p1, p2 = res["plots"]
    assert p1["cohort_ages"] == [5, 10] and p1["age_at_start"] == 7.5
    assert p1["beyond_model_age"] is False and p2["beyond_model_age"] is True
    # 800 trees * 70 kg growth * 0.47 * 3.667 / 1000, per cohort
    per_cohort = 800 * 70 * 0.47 * 3.667 / 1000  # 96.51 t
    # Cohorts of one plot are summed before rounding down; plots are rounded separately.
    assert p1["credits_tCO2e"] == math.floor(2 * per_cohort)  # 193, not 2 x 96
    # p2 (age 30 -> 37) only grows to the last modeled age 35.
    assert p2["credits_tCO2e"] == math.floor(800 * 50 * 0.47 * 3.667 / 1000)
    assert res["result"]["total_credits_tCO2e"] == p1["credits_tCO2e"] + p2["credits_tCO2e"]
    assert res["result"]["schedule"][0]["year"] == year


@pytest.mark.asyncio
async def test_service_min_max_price_across_frequencies(svc):
    res = await svc.get_carbon_economics(_req([{**ROW, "year_of_planting": 2020}]))
    comp = {c["verify_every_years"]: c for c in res["frequency_comparison"]}
    assert sorted(comp) == [1, 2, 3, 7]
    assert res["min_break_even_price_thb"] == comp[7]["break_even_price_thb"]
    assert res["max_break_even_price_thb"] == comp[1]["break_even_price_thb"]
    assert "schedule" not in comp[7]
    assert len(res["age_matrix"]) == 29


# ── Per-round price / fee overrides ──────────────────────────────────────────

def test_round_overrides_price_and_fees():
    stock = linear_stock(12.71, 2000)  # 25,420 tCO2e over 7 years
    overrides = {
        3: {"price_thb_per_tCO2e": 200, "monitoring_cost": 300_000, "verification_cost": None},
        7: {"price_thb_per_tCO2e": 500, "monitoring_cost": None, "verification_cost": 100_000},
    }
    res = ev(stock, 2000 * economics.RAI_M2, SLIDE_COSTS, 100, 3, 0.0, overrides)
    sched = {s["year_at"]: s for s in res["schedule"]}
    assert sched[3]["price_thb_per_tCO2e"] == 200
    assert sched[6]["price_thb_per_tCO2e"] == 100      # no override -> default price
    assert sched[1]["price_thb_per_tCO2e"] is None
    assert sched[3]["cost_thb"] == 300_000 + 200_000
    assert sched[6]["cost_thb"] == 600_000
    assert sched[7]["cost_thb"] == 400_000 + 100_000
    assert res["round_cost_thb"] == [500_000, 600_000, 500_000]
    assert res["total_cost_thb"] == 600_000 + 1_600_000
    c3, c6, c7 = (sched[t]["credits_issued_tCO2e"] for t in (3, 6, 7))
    revenue = c3 * 200 + c6 * 100 + c7 * 500
    assert res["total_revenue_thb"] == pytest.approx(revenue, abs=0.05)
    assert res["price_thb_per_tCO2e"] == pytest.approx(revenue / (c3 + c6 + c7), rel=1e-6)
    credits_per_rai = (c3 + c6 + c7) / 2000
    assert res["min_viable_area_rai"] == pytest.approx(2_200_000 / (credits_per_rai * res["price_thb_per_tCO2e"]), abs=0.01)


def test_no_overrides_unchanged():
    stock = linear_stock(12.71, 2000)
    a = ev(stock, 2000 * economics.RAI_M2, SLIDE_COSTS, 100, 2, 0.05)
    b = ev(stock, 2000 * economics.RAI_M2, SLIDE_COSTS, 100, 2, 0.05, {})
    assert a == b
    assert a["price_thb_per_tCO2e"] == pytest.approx(100)


@pytest.mark.asyncio
async def test_service_rounds_and_comparison_averages(svc):
    req = _req([{**ROW, "year_of_planting": 2015}], verify_every_years=3, rounds=[
        {"year_at": 3, "price_thb_per_tCO2e": 200, "monitoring_cost": None, "verification_cost": 0},
        {"year_at": 6},  # all None -> default price and fees
        {"year_at": 7, "price_thb_per_tCO2e": None, "monitoring_cost": 100_000, "verification_cost": None},
    ])
    res = await svc.get_carbon_economics(req)
    comp = {c["verify_every_years"]: c for c in res["frequency_comparison"]}
    # Years [3, 6, 7] match every-3, so that row is the exact result.
    assert comp[3]["total_cost_thb"] == res["result"]["total_cost_thb"] == 600_000 + 400_000 + 600_000 + 300_000
    # Others use the average per-round fee: (400k + 600k + 300k) / 3.
    assert comp[7]["total_cost_thb"] == pytest.approx(600_000 + 1_300_000 / 3, abs=0.05)
    assert comp[7]["price_thb_per_tCO2e"] == pytest.approx(res["result"]["price_thb_per_tCO2e"])


@pytest.mark.asyncio
async def test_service_custom_round_years(svc):
    req = _req([{**ROW, "year_of_planting": 2015}], rounds=[
        {"year_at": 2, "price_thb_per_tCO2e": 300, "monitoring_cost": 400_000, "verification_cost": 200_000},
        {"year_at": 5, "price_thb_per_tCO2e": 400, "monitoring_cost": 400_000, "verification_cost": 200_000},
    ])
    res = await svc.get_carbon_economics(req)
    r = res["result"]
    assert r["verify_every_years"] is None
    assert r["verification_years"] == [2, 5]
    # Years 6-7 growth is never issued: credits = stock(5) - stock(0).
    sched = {s["year_at"]: s for s in r["schedule"]}
    # Rounded down at each of the two rounds.
    assert r["total_credits_tCO2e"] == (
        math.floor(sched[2]["carbon_stock_tCO2e"] - sched[0]["carbon_stock_tCO2e"])
        + math.floor(sched[5]["carbon_stock_tCO2e"] - sched[2]["carbon_stock_tCO2e"])
    )
    assert all(c["verify_every_years"] in (1, 2, 3, 7) for c in res["frequency_comparison"])


@pytest.mark.asyncio
async def test_service_rounds_matching_a_frequency_is_exact(svc):
    req = _req([{**ROW, "year_of_planting": 2015}], verify_every_years=7, rounds=[
        {"year_at": 3, "price_thb_per_tCO2e": 300, "monitoring_cost": 0, "verification_cost": 0},
        {"year_at": 6, "price_thb_per_tCO2e": 300, "monitoring_cost": 0, "verification_cost": 0},
        {"year_at": 7, "price_thb_per_tCO2e": 300, "monitoring_cost": 0, "verification_cost": 0},
    ])
    res = await svc.get_carbon_economics(req)
    assert res["result"]["verify_every_years"] == 3
    comp = {c["verify_every_years"]: c for c in res["frequency_comparison"]}
    assert comp[3]["total_cost_thb"] == res["result"]["total_cost_thb"] == 600_000


@pytest.mark.asyncio
async def test_service_no_rounds(svc):
    res = await svc.get_carbon_economics(_req([{**ROW, "year_of_planting": 2015}], rounds=[]))
    r = res["result"]
    assert r["verification_rounds"] == 0 and r["total_credits_tCO2e"] == 0
    assert r["total_cost_thb"] == 600_000 and r["is_viable"] is False
    assert r["break_even_price_thb"] is None


# ── Plots planted after the project starts ───────────────────────────────────

def test_credit_path_future_planting_starts_from_planting_stock():
    stock = [0, 2, 10, 30, 60, 100, 150, 210]       # planted at t=1 (age -1 at start)
    assert economics.credit_path(stock, -1) == [0, 0, 8, 28, 58, 98, 148, 208]
    assert economics.credit_path(stock, 3) == stock  # already planted: unchanged
    assert economics.credit_path([0.0] * 8, -9) == [0.0] * 8  # planted after the period


def test_credit_paths_drive_credits_not_reported_stock():
    stock = [0, 2, 10, 30, 60, 100, 150, 210]
    res = economics.evaluate(stock, economics.RAI_M2, SLIDE_COSTS, 100, [7], 0.0,
                             credit_paths=[economics.credit_path(stock, -1)])
    assert res["total_credits_tCO2e"] == 208
    assert res["schedule"][7]["carbon_stock_tCO2e"] == 210


@pytest.mark.asyncio
async def test_service_future_plot_excludes_planting_stock(svc):
    from datetime import datetime
    year = datetime.now().year
    # Seedlings carry 5 kg at planting (age 0).
    profile = {a: {"age": a, "biomass_est": 5 + a * 10.0} for a in range(36)}
    svc._load_biomass_and_trees = AsyncMock(return_value=(profile, 800))
    res = await svc.get_carbon_economics(_req([{**ROW, "year_of_planting": year + 1, "plot_id": "f"}]))
    # Planted at t=1 (age 0) and verified at t=7 (age 6): only the 60 kg grown
    # on site counts, not the 5 kg at planting.
    expected = math.floor(800 * 60 * 0.47 * 3.667 / 1000)
    assert res["plots"][0]["credits_tCO2e"] == expected
    assert res["result"]["total_credits_tCO2e"] == expected
    assert res["plots"][0]["carbon_stock_start_tCO2e"] == 0
    assert res["plots"][0]["carbon_stock_end_tCO2e"] == pytest.approx(800 * 65 * 0.47 * 3.667 / 1000, rel=1e-4)


@pytest.mark.asyncio
async def test_service_plot_revenue_sums_to_project(svc):
    req = _req([
        {**ROW, "year_of_planting": 2015, "plot_id": "a"},
        {**ROW, "year_of_planting": 2020, "plot_id": "b"},
    ], rounds=[
        {"year_at": 3, "price_thb_per_tCO2e": 200, "monitoring_cost": 0, "verification_cost": 0},
        {"year_at": 7, "price_thb_per_tCO2e": 500, "monitoring_cost": 0, "verification_cost": 0},
    ])
    res = await svc.get_carbon_economics(req)
    sched = {s["year_at"]: s for s in res["result"]["schedule"]}
    a, b = res["plots"]
    assert a["revenue_thb"] + b["revenue_thb"] == pytest.approx(res["result"]["total_revenue_thb"])
    assert sched[3]["credits_issued_tCO2e"] * 200 + sched[7]["credits_issued_tCO2e"] * 500 == pytest.approx(res["result"]["total_revenue_thb"])


# ── CI range (biomass lower / upper bounds) ──────────────────────────────────

@pytest.mark.asyncio
async def test_service_ci_bounds_bracket_central(svc):
    # Lower bound grows 20% slower, upper 20% faster than the central estimate.
    profile = {a: {"age": a, "biomass_est": a * 10.0, "biomass_ci_lower": a * 8.0, "biomass_ci_upper": a * 12.0} for a in range(36)}
    svc._load_biomass_and_trees = AsyncMock(return_value=(profile, 800))
    res = await svc.get_carbon_economics(_req([{**ROW, "year_of_planting": 2015, "plot_id": "a"}], rounds=[
        {"year_at": 3, "price_thb_per_tCO2e": 300, "monitoring_cost": 400_000, "verification_cost": 200_000},
        {"year_at": 7, "price_thb_per_tCO2e": 300, "monitoring_cost": 400_000, "verification_cost": 200_000},
    ]))
    r = res["result"]
    k = 800 * 0.47 * 3.667 / 1000  # tCO2e per kg of per-tree biomass growth, x trees
    assert r["low"]["total_credits_tCO2e"] == math.floor(k * 8 * 3) + math.floor(k * 8 * 4)
    assert r["high"]["total_credits_tCO2e"] == math.floor(k * 12 * 3) + math.floor(k * 12 * 4)
    assert r["low"]["total_credits_tCO2e"] < r["total_credits_tCO2e"] < r["high"]["total_credits_tCO2e"]
    assert r["low"]["net_profit_thb"] < r["net_profit_thb"] < r["high"]["net_profit_thb"]
    assert r["low"]["break_even_price_thb"] > r["break_even_price_thb"] > r["high"]["break_even_price_thb"]
    s7 = r["schedule"][7]
    assert s7["credits_issued_low_tCO2e"] <= s7["credits_issued_tCO2e"] <= s7["credits_issued_high_tCO2e"]
    plot = res["plots"][0]
    assert plot["credits_low_tCO2e"] == r["low"]["total_credits_tCO2e"]
    assert plot["revenue_high_thb"] == pytest.approx(r["high"]["total_revenue_thb"])
    assert all("low" in c and "high" in c for c in res["frequency_comparison"])


def test_attach_bounds_orders_inverted_cases():
    stock = linear_stock(12.71, 100)
    small = ev(stock, 100 * economics.RAI_M2, SLIDE_COSTS, 100, 7, 0.05)
    big = ev([v * 2 for v in stock], 100 * economics.RAI_M2, SLIDE_COSTS, 100, 7, 0.05)
    central = ev(stock, 100 * economics.RAI_M2, SLIDE_COSTS, 100, 7, 0.05)
    # Pass the bigger case as "lower": the low/high labels still follow credits.
    out = economics.attach_bounds(central, big, small)
    assert out["low"]["total_credits_tCO2e"] < out["high"]["total_credits_tCO2e"]
    assert out["plot_bounds"][0]["credits_low_tCO2e"] <= out["plot_bounds"][0]["credits_high_tCO2e"]


# ── /carbon/sim CI band ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_simulation_ci_band_brackets_central(svc):
    from datetime import datetime
    year = datetime.now().year
    profile = {a: {"age": a, "biomass_est": a * 10.0, "biomass_ci_lower": a * 8.0, "biomass_ci_upper": a * 12.0} for a in range(36)}
    svc._load_biomass_and_trees = AsyncMock(return_value=(profile, 800))
    res = await svc.get_carbon_simulation([{**ROW, "year_of_planting": year - 10, "rotation_year": 35, "replanting_rate": 1.0}])
    now = next(p for p in res["carbon_stock_tCO2e_simulation"] if p["year_at"] == 0)
    k = 800 * 0.47 * 3.667 / 1000
    assert now["carbon_stock_tCO2e"] == pytest.approx(k * 100, abs=1e-3)
    assert now["carbon_stock_ci_lower_tCO2e"] == pytest.approx(k * 80, abs=1e-3)
    assert now["carbon_stock_ci_upper_tCO2e"] == pytest.approx(k * 120, abs=1e-3)
    before = next(p for p in res["carbon_stock_tCO2e_simulation"] if p["year_at"] == -11)  # not planted yet
    assert before["carbon_stock_ci_lower_tCO2e"] == before["carbon_stock_ci_upper_tCO2e"] == 0
