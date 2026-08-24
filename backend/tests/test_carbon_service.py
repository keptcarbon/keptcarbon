"""Unit tests for CarbonService.generate_carbon_profile.

generate_carbon_profile is async and reads the biomass lookup table from
Postgres (tbl_biomass_profile) via app.core.database.get_pool() — not from a
CSV/pandas lookup. Tests fake that DB call via the patch_db_fetch fixture
(see conftest.py) instead of hitting a real database.
"""
import pytest
from fastapi import HTTPException
from app.core.constants import CARBON_FRACTION, CARBON_EQUIVALENT_FACTOR


# ── helpers ───────────────────────────────────────────────────────────────────

def _poly(province_code="RAY", rubber_clone="RRIM 600", year_of_planting=2015, project_type="existing"):
    return {
        "id": "p1",
        "province_code": province_code,
        "rubber_clone": rubber_clone,
        "year_of_planting": year_of_planting,
        "project_type": project_type,
    }


def _cohort(age, tree_count):
    return {"age": age, "tree_count": tree_count}


# ── province / clone validation ───────────────────────────────────────────────

class TestValidation:

    @pytest.mark.asyncio
    async def test_unsupported_province_raises_422(self, mock_carbon_service, patch_db_fetch):
        # No tbl_region_config row for this province → 422 before the biomass query.
        with patch_db_fetch(fetchrow_results=[None]):
            with pytest.raises(HTTPException) as exc:
                await mock_carbon_service.generate_carbon_profile(
                    _poly(province_code="UNKNOWN"), [_cohort(10, 100)]
                )
        assert exc.value.status_code == 422
        assert "UNKNOWN" in exc.value.detail

    @pytest.mark.asyncio
    async def test_unsupported_clone_raises_422(self, mock_carbon_service, patch_db_fetch):
        # tbl_region_config points at a clone with no matching tbl_biomass_profile rows.
        with patch_db_fetch(
            rows=[],
            fetchrow_results=[{"default_clone": "FAKE_CLONE", "default_growth": "weibull", "default_allometry": "hytonen_2018"}],
        ):
            with pytest.raises(HTTPException) as exc:
                await mock_carbon_service.generate_carbon_profile(_poly(), [_cohort(10, 100)])
        assert exc.value.status_code == 422
        assert "FAKE_CLONE" in exc.value.detail

    @pytest.mark.asyncio
    async def test_db_error_raises_500(self, mock_carbon_service, patch_db_fetch):
        with patch_db_fetch(exc=OSError("connection refused")):
            with pytest.raises(HTTPException) as exc:
                await mock_carbon_service.generate_carbon_profile(_poly(), [_cohort(10, 100)])
        assert exc.value.status_code == 500
        assert "Failed to load biomass profile" in exc.value.detail


# ── carbon conversion formula ─────────────────────────────────────────────────

class TestCarbonFormula:

    @pytest.mark.asyncio
    async def test_conversion_formula(self, mock_carbon_service, patch_db_fetch, biomass_rows):
        """Result must equal (biomass_est × tree_count × CF × CEF) / 1000."""
        age = 10
        tree_count = 100
        biomass_est = next(r["biomass_est"] for r in biomass_rows if r["age"] == age)  # 100.0

        with patch_db_fetch(rows=biomass_rows):
            profile = await mock_carbon_service.generate_carbon_profile(
                _poly(), [_cohort(age, tree_count)]
            )

        current_year_entry = next(e for e in profile if e["year_at"] == 0)
        expected = round((biomass_est * tree_count * CARBON_FRACTION * CARBON_EQUIVALENT_FACTOR) / 1000, 4)
        assert current_year_entry["stocks"]["value"] == expected

    @pytest.mark.asyncio
    async def test_ci_lower_less_than_estimate(self, mock_carbon_service, patch_db_fetch, biomass_rows):
        with patch_db_fetch(rows=biomass_rows):
            profile = await mock_carbon_service.generate_carbon_profile(_poly(), [_cohort(10, 100)])
        for entry in profile:
            assert entry["stocks"]["ci_lower"] <= entry["stocks"]["value"]

    @pytest.mark.asyncio
    async def test_ci_upper_greater_than_estimate(self, mock_carbon_service, patch_db_fetch, biomass_rows):
        with patch_db_fetch(rows=biomass_rows):
            profile = await mock_carbon_service.generate_carbon_profile(_poly(), [_cohort(10, 100)])
        for entry in profile:
            assert entry["stocks"]["ci_upper"] >= entry["stocks"]["value"]


# ── profile structure ─────────────────────────────────────────────────────────

class TestProfileStructure:

    @pytest.mark.asyncio
    async def test_each_entry_has_required_keys(self, mock_carbon_service, patch_db_fetch, biomass_rows):
        with patch_db_fetch(rows=biomass_rows):
            profile = await mock_carbon_service.generate_carbon_profile(_poly(), [_cohort(10, 100)])
        assert len(profile) > 0
        for entry in profile:
            assert "year" in entry
            assert "stocks" in entry
            assert "value" in entry["stocks"]
            assert "ci_lower" in entry["stocks"]
            assert "ci_upper" in entry["stocks"]
            assert "gain" in entry

    @pytest.mark.asyncio
    async def test_years_are_sequential(self, mock_carbon_service, patch_db_fetch, biomass_rows):
        with patch_db_fetch(rows=biomass_rows):
            profile = await mock_carbon_service.generate_carbon_profile(_poly(), [_cohort(10, 100)])
        years = [e["year"] for e in profile]
        assert years == sorted(years)
        assert all(years[i + 1] - years[i] == 1 for i in range(len(years) - 1))

    @pytest.mark.asyncio
    async def test_profile_is_always_fixed_36_rows(self, mock_carbon_service, patch_db_fetch, biomass_rows):
        # Fixed age-0..35 window regardless of cohort age → always 36 rows.
        with patch_db_fetch(rows=biomass_rows):
            profile = await mock_carbon_service.generate_carbon_profile(_poly(), [_cohort(10, 100)])
        assert len(profile) == 36
        assert [e["age"] for e in profile] == list(range(36))

    @pytest.mark.asyncio
    async def test_old_and_young_plantation_same_length(self, mock_carbon_service, patch_db_fetch, biomass_rows):
        with patch_db_fetch(rows=biomass_rows):
            young = await mock_carbon_service.generate_carbon_profile(_poly(), [_cohort(5, 100)])
            old = await mock_carbon_service.generate_carbon_profile(_poly(), [_cohort(20, 100)])
        assert len(young) == len(old) == 36

    @pytest.mark.asyncio
    async def test_zero_biomass_entries_kept_as_zero(self, mock_carbon_service, patch_db_fetch, biomass_rows):
        # Age 0 has biomass_est = 0 in the lookup table → row is still emitted,
        # with an explicit zero value, so every plot yields a uniform row count.
        with patch_db_fetch(rows=biomass_rows):
            profile = await mock_carbon_service.generate_carbon_profile(_poly(), [_cohort(0, 100)])
        assert len(profile) == 36
        assert profile[0]["age"] == 0
        assert profile[0]["stocks"]["value"] == 0

    @pytest.mark.asyncio
    async def test_year_at_zero_matches_dominant_cohort_current_age(
        self, mock_carbon_service, patch_db_fetch, biomass_rows
    ):
        # year_at should be 0 at the calendar year matching the cohort's
        # current age, negative walking back to age 0, positive walking
        # forward past today.
        with patch_db_fetch(rows=biomass_rows):
            profile = await mock_carbon_service.generate_carbon_profile(_poly(), [_cohort(10, 100)])
        row = next(e for e in profile if e["age"] == 10)
        assert row["year_at"] == 0
        assert profile[0]["year_at"] == -10
        assert profile[-1]["year_at"] == 25


# ── multiple cohorts ──────────────────────────────────────────────────────────

class TestMultipleCohorts:

    @pytest.mark.asyncio
    async def test_multiple_cohorts_sum_correctly(self, mock_carbon_service, patch_db_fetch, biomass_rows):
        """Two equal cohorts should produce 2× the CO₂ of one cohort."""
        with patch_db_fetch(rows=biomass_rows):
            single = await mock_carbon_service.generate_carbon_profile(_poly(), [_cohort(10, 100)])
            double = await mock_carbon_service.generate_carbon_profile(
                _poly(), [_cohort(10, 100), _cohort(10, 100)]
            )

        for s, d in zip(single, double):
            assert abs(d["stocks"]["value"] - 2 * s["stocks"]["value"]) < 0.001

    @pytest.mark.asyncio
    async def test_region_config_clone_used_in_biomass_query(self, mock_carbon_service, patch_db_fetch, biomass_rows):
        # The clone actually queried against tbl_biomass_profile comes from
        # tbl_region_config.default_clone, not poly_data['rubber_clone'].
        with patch_db_fetch(
            rows=biomass_rows,
            fetchrow_results=[{"default_clone": "RRIT 251", "default_growth": "weibull", "default_allometry": "hytonen_2018"}],
        ) as mock_get_pool:
            await mock_carbon_service.generate_carbon_profile(
                _poly(rubber_clone="RRIM 600"), [_cohort(10, 100)]
            )
            fake_conn = mock_get_pool.return_value._conn

        # fetch(query, p_code, clone, growth_model, allometry) — clone is arg index 2
        assert fake_conn.calls[-1][0][2] == "RRIT 251"
