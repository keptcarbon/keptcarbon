"""Unit tests for TreeService."""
import pytest
from unittest.mock import patch
from app.core.constants import TREE_DENSITIES, TREE_COUNT_VALIDATION_THRESHOLD


@pytest.fixture
def svc(mock_tree_service):
    return mock_tree_service


def _poly(area_ha: float, tree_count=None, spacing=None):
    svc_mock = None  # placeholder; area is injected via spatial_utils mock
    return {
        "id": "t1",
        "a302_geometry": {"type": "Polygon", "coordinates": []},
        "tree_count": tree_count,
        "spacing_system": spacing,
    }


# ── get_tree_count_user_input ─────────────────────────────────────────────────

class TestGetTreeCountUserInput:

    def test_no_user_count_returns_calculated(self, svc):
        svc.spatial_utils.calculate_area_ha.return_value = 1.0  # 1 ha
        result = svc.get_tree_count_user_input(
            {"id": "p1", "a302_geometry": {}, "tree_count": None, "spacing_system": "2.5x8"}
        )
        assert result["tree_count"] == 500         # 1 ha × 500 trees/ha
        assert result["is_calculated"] is True

    def test_user_within_threshold_is_used(self, svc):
        # calculated = 500; user = 502 → diff = 0.4% < 5%
        svc.spatial_utils.calculate_area_ha.return_value = 1.0
        result = svc.get_tree_count_user_input(
            {"id": "p1", "a302_geometry": {}, "tree_count": 502, "spacing_system": "2.5x8"}
        )
        assert result["tree_count"] == 502
        assert result["is_calculated"] is False

    def test_user_outside_threshold_uses_calculated(self, svc):
        # calculated = 500; user = 1000 → diff = 100% > 5%
        svc.spatial_utils.calculate_area_ha.return_value = 1.0
        result = svc.get_tree_count_user_input(
            {"id": "p1", "a302_geometry": {}, "tree_count": 1000, "spacing_system": "2.5x8"}
        )
        assert result["tree_count"] == 500
        assert result["is_calculated"] is True

    def test_zero_calculated_uses_user_input(self, svc):
        # area = 0 → calculated = 0; can't validate, so trust user input as-is
        svc.spatial_utils.calculate_area_ha.return_value = 0.0
        result = svc.get_tree_count_user_input(
            {"id": "p1", "a302_geometry": {}, "tree_count": 300, "spacing_system": "2.5x8"}
        )
        assert result["tree_count"] == 300
        assert result["is_calculated"] is False

    def test_default_spacing_used_when_not_provided(self, svc):
        svc.spatial_utils.calculate_area_ha.return_value = 1.0
        result = svc.get_tree_count_user_input(
            {"id": "p1", "a302_geometry": {}, "tree_count": None, "spacing_system": None}
        )
        # default spacing "2.5x8" → density 500
        assert result["tree_count"] == 500

    @pytest.mark.parametrize("spacing,density", list(TREE_DENSITIES.items()))
    def test_all_spacing_densities(self, svc, spacing, density):
        svc.spatial_utils.calculate_area_ha.return_value = 1.0
        result = svc.get_tree_count_user_input(
            {"id": "p1", "a302_geometry": {}, "tree_count": None, "spacing_system": spacing}
        )
        assert result["tree_count"] == density

    def test_exact_threshold_boundary_uses_user_input(self, svc):
        # diff exactly == TREE_COUNT_VALIDATION_THRESHOLD (5%) → still within bound
        svc.spatial_utils.calculate_area_ha.return_value = 1.0
        boundary_user = int(500 * (1 + TREE_COUNT_VALIDATION_THRESHOLD))
        result = svc.get_tree_count_user_input(
            {"id": "p1", "a302_geometry": {}, "tree_count": boundary_user, "spacing_system": "2.5x8"}
        )
        assert result["is_calculated"] is False


# ── get_tree_count_raster_pixel ───────────────────────────────────────────────

class TestGetTreeCountRasterPixel:

    def test_homogeneous_uses_full_area(self, svc):
        # 95/100 pixels = 95% > TREE_AGE_HOMOLOGOUS_THRESHOLD (90%)
        svc.spatial_utils.calculate_area_ha.return_value = 2.0
        result = svc.get_tree_count_raster_pixel(
            {"id": "p1", "a302_geometry": {}, "spacing_system": "2.5x8"},
            num_pixel=95, total_pixels=100,
        )
        assert result["tree_count"] == 1000  # 2 ha × 500
        assert result["is_calculated"] is True

    def test_heterogeneous_adjusts_by_pixel_ratio(self, svc):
        # 50/100 = 50% < 90% threshold → area × ratio
        svc.spatial_utils.calculate_area_ha.return_value = 2.0
        result = svc.get_tree_count_raster_pixel(
            {"id": "p1", "a302_geometry": {}, "spacing_system": None},
            num_pixel=50, total_pixels=100,
        )
        # adjusted_area = 2.0 × 0.5 = 1.0 ha; density=500
        assert result["tree_count"] == 500
        assert result["is_calculated"] is True
