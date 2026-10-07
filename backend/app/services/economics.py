"""
Pure cost/revenue math for the Economic Scenario Simulation (T-VER feasibility).

A project starts this year (t = 0) and runs one 7-year crediting period. No
cutting or replanting is allowed inside the period, so each cohort simply keeps
growing along its biomass profile. Credits are the raw stock gain (no buffer /
leakage / baseline deductions yet), issued at each verification round:

    verification years = k, 2k, ... < 7, plus the final year 7
    credits at round v  = stock(v) - stock(previous round), rounded down to whole
                          tonnes per plot (TGO convention), then summed
    cash flow t=0       = -(PDD + validation)
    cash flow at round  = credits * price - (monitoring report + verification)

Rounds may also fall on any user-chosen subset of years 1..7; carbon grown
after the last round is never issued.

No DB access here -- CarbonService.get_carbon_economics loads the profiles and
feeds stock vectors in, which keeps this module unit-testable on its own.
"""
import math
from typing import Dict, List, Optional, Sequence

T_VER_CREDITING_YEARS = 7
RAI_M2 = 1600.0

# Absorbs float noise (e.g. 1270.9999999) before rounding credits down.
FLOOR_EPS = 1e-9

# IRR search bracket (annual rate).
IRR_LOW, IRR_HIGH = -0.99, 10.0


def verification_years(every: int, crediting_years: int = T_VER_CREDITING_YEARS) -> List[int]:
    """Years (1..crediting_years) holding a monitoring + verification round."""
    every = max(1, min(every, crediting_years))
    years = list(range(every, crediting_years, every))
    return years + [crediting_years]


def stock_path(
    biomass_by_age: Dict[int, float],
    tree_count: int,
    age_at_start: int,
    max_age: int,
    tco2e_per_kg_biomass: float,
    crediting_years: int = T_VER_CREDITING_YEARS,
) -> List[float]:
    """
    Carbon stock (tCO2e) of one cohort at t = 0..crediting_years. Not-yet-planted
    years (negative age) hold 0; ages past max_age are clamped (flat growth).
    """
    path = []
    for t in range(crediting_years + 1):
        age = age_at_start + t
        if age < 0:
            path.append(0.0)
            continue
        biomass = biomass_by_age.get(min(age, max_age), 0.0)
        path.append(biomass * tree_count * tco2e_per_kg_biomass)
    return path


def credit_path(stock: Sequence[float], age_at_start: int) -> List[float]:
    """
    The part of a cohort's stock path that counts toward credits. A cohort
    planted after the project starts (negative age) is measured from its stock
    on planting day, not from bare land, so seedling carbon grown off-site
    isn't credited -- this matches the assessment's own gain baseline.
    """
    if age_at_start >= 0:
        return list(stock)
    planted_t = -age_at_start
    if planted_t >= len(stock):
        return [0.0] * len(stock)
    base = stock[planted_t]
    return [0.0 if t < planted_t else s - base for t, s in enumerate(stock)]


def floor_tonnes(value: float) -> int:
    """TGO convention: credits are rounded down to whole tonnes before pricing."""
    return math.floor(value + FLOOR_EPS)


def npv(cash_flows: Sequence[float], rate: float) -> float:
    return sum(cf / (1 + rate) ** t for t, cf in enumerate(cash_flows))


def irr(cash_flows: Sequence[float]) -> Optional[float]:
    """
    Lowest rate in (IRR_LOW, IRR_HIGH) where NPV crosses zero, or None when
    there's no sign change (e.g. the project never pays back). A coarse scan
    finds the first bracket, then bisection refines it.
    """
    if not (any(cf < 0 for cf in cash_flows) and any(cf > 0 for cf in cash_flows)):
        return None
    steps = 400
    grid = [IRR_LOW + (IRR_HIGH - IRR_LOW) * i / steps for i in range(steps + 1)]
    prev_r, prev_v = grid[0], npv(cash_flows, grid[0])
    for r in grid[1:]:
        v = npv(cash_flows, r)
        if prev_v == 0:
            return prev_r
        if (prev_v > 0) != (v > 0):
            lo, hi, f_lo = prev_r, r, prev_v
            for _ in range(100):
                mid = (lo + hi) / 2
                f_mid = npv(cash_flows, mid)
                if (f_mid > 0) == (f_lo > 0):
                    lo, f_lo = mid, f_mid
                else:
                    hi = mid
            return (lo + hi) / 2
        prev_r, prev_v = r, v
    return None


def evaluate(
    total_stock: Sequence[float],
    total_area_m2: float,
    costs: Dict[str, float],
    price: float,
    round_years: Sequence[int],
    discount_rate: float,
    round_overrides: Optional[Dict[int, dict]] = None,
    credit_paths: Optional[Sequence[Sequence[float]]] = None,
) -> dict:
    """
    One scenario: the project's summed stock path (t = 0..7) with verification
    rounds in `round_years` (any subset of 1..7; see verification_years for
    the regular every-k-years pattern). Returns totals, the yearly schedule, NPV/IRR,
    break-even price and minimum viable area.

    `price` and costs' per-round entries are the defaults for every round;
    round_overrides ({year_at: {price_thb_per_tCO2e, monitoring_cost,
    verification_cost}}, any key may be None) sets them per round, since sale
    prices and verification fees can differ between rounds.

    credit_paths holds one path per plot (default: total_stock as a single
    unit) that credits are measured on -- see credit_path; total_stock stays
    the reported carbon stock. Following TGO, each plot's credits at each
    round are rounded down to whole tonnes, then summed for the project.
    """
    crediting_years = len(total_stock) - 1
    rounds = sorted({t for t in round_years if 1 <= t <= crediting_years})
    upfront = costs["pdd"] + costs["validation"]
    overrides = round_overrides or {}
    paths = [total_stock] if credit_paths is None else credit_paths
    plot_credits = [0] * len(paths)
    plot_revenue = [0.0] * len(paths)

    def round_terms(t: int) -> tuple:
        o = overrides.get(t) or {}
        pick = lambda key, default: default if o.get(key) is None else o[key]
        return (
            pick("price_thb_per_tCO2e", price),
            pick("monitoring_cost", costs["monitoring_per_round"]) + pick("verification_cost", costs["verification_per_round"]),
        )

    schedule = []
    cash_flows = []
    cumulative = 0.0
    last_verified = 0
    total_credits = 0
    total_cost = 0.0
    total_revenue = 0.0
    for t in range(crediting_years + 1):
        is_round = t in rounds
        round_price, round_cost = round_terms(t) if is_round else (None, 0.0)
        credits = 0
        if is_round:
            for i, path in enumerate(paths):
                issued = floor_tonnes(path[t] - path[last_verified])
                plot_credits[i] += issued
                plot_revenue[i] += issued * round_price
                credits += issued
        cost = (upfront if t == 0 else 0.0) + round_cost
        revenue = credits * round_price if is_round else 0.0
        total_cost += cost
        total_revenue += revenue
        net = revenue - cost
        cumulative += net
        if is_round:
            last_verified = t
            total_credits += credits
        cash_flows.append(net)
        schedule.append({
            "year_at": t,
            "is_verification": is_round,
            "price_thb_per_tCO2e": round_price,
            "carbon_stock_tCO2e": round(total_stock[t], 4),
            "credits_issued_tCO2e": credits,
            "cost_thb": round(cost, 2),
            "revenue_thb": round(revenue, 2),
            "net_thb": round(net, 2),
            "cumulative_net_thb": round(cumulative, 2),
            "discounted_net_thb": round(net / (1 + discount_rate) ** t, 2),
        })

    # Credit-weighted sale price; equals `price` when no round overrides it.
    avg_price = total_revenue / total_credits if total_credits > 0 else price
    area_rai = total_area_m2 / RAI_M2

    pv_cost = sum(s["cost_thb"] / (1 + discount_rate) ** s["year_at"] for s in schedule)
    pv_credits = sum(s["credits_issued_tCO2e"] / (1 + discount_rate) ** s["year_at"] for s in schedule)
    credits_per_rai = total_credits / area_rai if area_rai > 0 else 0.0

    payback = next((s["year_at"] for s in schedule if s["cumulative_net_thb"] >= 0), None)
    project_npv = npv(cash_flows, discount_rate)
    project_irr = irr(cash_flows)

    return {
        "verification_rounds": len(rounds),
        "verification_years": rounds,
        "price_thb_per_tCO2e": round(avg_price, 4),
        "round_cost_thb": [round(round_terms(t)[1], 2) for t in rounds],
        "total_cost_thb": round(total_cost, 2),
        "total_credits_tCO2e": total_credits,
        "plot_credits_tCO2e": plot_credits,
        "plot_revenue_thb": plot_revenue,
        "credits_per_rai_tCO2e": round(credits_per_rai, 4),
        "total_revenue_thb": round(total_revenue, 2),
        "net_profit_thb": round(total_revenue - total_cost, 2),
        "is_viable": total_revenue >= total_cost,
        "payback_year_at": payback,
        "npv_thb": round(project_npv, 2),
        "irr": round(project_irr, 6) if project_irr is not None else None,
        "break_even_price_thb": round(total_cost / total_credits, 2) if total_credits > 0 else None,
        "discounted_break_even_price_thb": round(pv_cost / pv_credits, 2) if pv_credits > 0 else None,
        "min_viable_area_rai": round(total_cost / (credits_per_rai * avg_price), 2) if credits_per_rai > 0 and avg_price > 0 else None,
        "schedule": schedule,
    }


def age_matrix(
    biomass_by_age: Dict[int, float],
    trees_per_rai: float,
    max_age: int,
    tco2e_per_kg_biomass: float,
    total_cost: float,
    price: float,
    crediting_years: int = T_VER_CREDITING_YEARS,
) -> List[dict]:
    """
    For each starting age A (0 .. max_age - crediting_years): credits per rai
    over the period and the minimum area that covers total_cost at `price`.
    """
    rows = []
    for a in range(0, max_age - crediting_years + 1):
        start = biomass_by_age.get(a, 0.0)
        end = biomass_by_age.get(a + crediting_years, 0.0)
        cs = (end - start) * trees_per_rai * tco2e_per_kg_biomass
        rows.append({
            "start_age": a,
            "credits_per_rai_tCO2e": round(cs, 4),
            "min_viable_area_rai": round(total_cost / (cs * price), 2) if cs > 0 and price > 0 else None,
        })
    return rows
