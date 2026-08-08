"""Unit tests for CarbonService.generate_carbon_profile."""
import pytest
from unittest.mock import patch, MagicMock
from fastapi import HTTPException
from app.core.constants import CARBON_FRACTION, CARBON_EQUIVALENT_FACTOR


# ── helpers ───────────────────────────────────────────────────────────────────

def _poly(province_code="RAY", rubber_clone="RRIM 600"):
    return {"id": "p1", "province_code": province_code, "rubber_clone": rubber_clone}


def _cohort(age, tree_count):
    return {"age": age, "tree_count": tree_count}


# ── province / clone validation ───────────────────────────────────────────────

class TestValidation:

    def test_unsupported_province_raises_422(self, mock_carbon_service, lookup_df):
        with patch("app.services.carbon_service.pd.read_csv", return_value=lookup_df):
            with pytest.raises(HTTPException) as exc:
                mock_carbon_service.generate_carbon_profile(
                    _poly(province_code="UNKNOWN"), [_cohort(10, 100)]
                )
        assert exc.value.status_code == 422
        assert "UNKNOWN" in exc.value.detail

    def test_unsupported_clone_raises_422(self, mock_carbon_service, lookup_df):
        with patch("app.services.carbon_service.pd.read_csv", return_value=lookup_df):
            with pytest.raises(HTTPException) as exc:
                mock_carbon_service.generate_carbon_profile(
                    _poly(rubber_clone="FAKE_CLONE"), [_cohort(10, 100)]
                )
        assert exc.value.status_code == 422
        assert "FAKE_CLONE" in exc.value.detail

    def test_missing_csv_raises_500(self, mock_carbon_service):
        with patch("app.services.carbon_service.pd.read_csv", side_effect=FileNotFoundError("no file")):
            with pytest.raises(HTTPException) as exc:
                mock_carbon_service.generate_carbon_profile(_poly(), [_cohort(10, 100)])
        assert exc.value.status_code == 500
        assert "Failed to load lookup file" in exc.value.detail


# ── carbon conversion formula ─────────────────────────────────────────────────

class TestCarbonFormula:

    def test_conversion_formula(self, mock_carbon_service, lookup_df):
        """Result must equal (biomass_est × tree_count × CF × CEF) / 1000."""
        age = 10
        tree_count = 100
        biomass_est = lookup_df.loc[lookup_df["Age"] == age, "Biomass_Est"].iloc[0]  # 100.0

        with patch("app.services.carbon_service.pd.read_csv", return_value=lookup_df):
            profile = mock_carbon_service.generate_carbon_profile(
                _poly(), [_cohort(age, tree_count)]
            )

        current_year_entry = profile[0]
        expected = round((biomass_est * tree_count * CARBON_FRACTION * CARBON_EQUIVALENT_FACTOR) / 1000, 4)
        assert current_year_entry["total_carbon_tCO2e"] == expected

    def test_ci_lower_less_than_estimate(self, mock_carbon_service, lookup_df):
        with patch("app.services.carbon_service.pd.read_csv", return_value=lookup_df):
            profile = mock_carbon_service.generate_carbon_profile(_poly(), [_cohort(10, 100)])
        for entry in profile:
            assert entry["ci_lower_tCO2e"] <= entry["total_carbon_tCO2e"]

    def test_ci_upper_greater_than_estimate(self, mock_carbon_service, lookup_df):
        with patch("app.services.carbon_service.pd.read_csv", return_value=lookup_df):
            profile = mock_carbon_service.generate_carbon_profile(_poly(), [_cohort(10, 100)])
        for entry in profile:
            assert entry["ci_upper_tCO2e"] >= entry["total_carbon_tCO2e"]


# ── profile structure ─────────────────────────────────────────────────────────

class TestProfileStructure:

    def test_each_entry_has_required_keys(self, mock_carbon_service, lookup_df):
        with patch("app.services.carbon_service.pd.read_csv", return_value=lookup_df):
            profile = mock_carbon_service.generate_carbon_profile(_poly(), [_cohort(10, 100)])
        assert len(profile) > 0
        for entry in profile:
            assert "year" in entry
            assert "total_carbon_tCO2e" in entry
            assert "ci_lower_tCO2e" in entry
            assert "ci_upper_tCO2e" in entry

    def test_years_are_sequential(self, mock_carbon_service, lookup_df):
        with patch("app.services.carbon_service.pd.read_csv", return_value=lookup_df):
            profile = mock_carbon_service.generate_carbon_profile(_poly(), [_cohort(10, 100)])
        years = [e["year"] for e in profile]
        assert years == sorted(years)
        assert all(years[i+1] - years[i] == 1 for i in range(len(years)-1))

    def test_profile_length_respects_age_limit(self, mock_carbon_service, lookup_df):
        # cohort age=10 → limit = 35-10 = 25 years of profile
        with patch("app.services.carbon_service.pd.read_csv", return_value=lookup_df):
            profile = mock_carbon_service.generate_carbon_profile(_poly(), [_cohort(10, 100)])
        assert len(profile) == 26     # offsets 0-25 inclusive

    def test_old_plantation_shorter_profile(self, mock_carbon_service, lookup_df):
        with patch("app.services.carbon_service.pd.read_csv", return_value=lookup_df):
            young = mock_carbon_service.generate_carbon_profile(_poly(), [_cohort(5, 100)])
            old   = mock_carbon_service.generate_carbon_profile(_poly(), [_cohort(20, 100)])
        assert len(young) > len(old)

    def test_zero_biomass_entries_excluded(self, mock_carbon_service, lookup_df):
        # Age 0 has Biomass_Est = 0 → should not appear in projections
        with patch("app.services.carbon_service.pd.read_csv", return_value=lookup_df):
            profile = mock_carbon_service.generate_carbon_profile(_poly(), [_cohort(0, 100)])
        co2_values = [e["total_carbon_tCO2e"] for e in profile]
        assert all(v > 0 for v in co2_values)


# ── multiple cohorts ──────────────────────────────────────────────────────────

class TestMultipleCohorts:

    def test_multiple_cohorts_sum_correctly(self, mock_carbon_service, lookup_df):
        """Two equal cohorts should produce 2× the CO₂ of one cohort."""
        with patch("app.services.carbon_service.pd.read_csv", return_value=lookup_df):
            single = mock_carbon_service.generate_carbon_profile(_poly(), [_cohort(10, 100)])
            double = mock_carbon_service.generate_carbon_profile(_poly(), [_cohort(10, 100), _cohort(10, 100)])

        for s, d in zip(single, double):
            assert abs(d["total_carbon_tCO2e"] - 2 * s["total_carbon_tCO2e"]) < 0.001

    def test_rrit251_clone_uses_different_table(self, mock_carbon_service, lookup_df):
        with patch("app.services.carbon_service.pd.read_csv", return_value=lookup_df) as mock_csv:
            mock_carbon_service.generate_carbon_profile(
                _poly(rubber_clone="RRIT 251"), [_cohort(10, 100)]
            )
        loaded_path = str(mock_csv.call_args[0][0])
        assert "rrit251" in loaded_path
