"""Unit tests for TreeService.

get_tree_count_user_input/get_tree_count_raster_pixel are async and read
spacing/density from Postgres (tbl_region_config.default_spacing,
tbl_tree_density) via app.core.database.get_pool() -- not from the old
TREE_DENSITIES/DEFAULT_SPACING_SYSTEM constants. Tests fake that DB call via
the patch_tree_db fixture (see conftest.py) instead of hitting a real
database.
"""
import pytest
from app.core.constants import TREE_COUNT_VALIDATION_THRESHOLD

# Mirrors postgis/init/15-tbl-tree-density.sql.
TREE_DENSITIES = {
    "2.5x8": 500,
    "3x7": 475,
    "3x8": 419,
    "2.5x7": 569,
    "3x6": 556,
}


@pytest.fixture
def svc(mock_tree_service):
    return mock_tree_service


def _density_row(spacing):
    return {"tree_density_ha": TREE_DENSITIES[spacing]}


# ── get_tree_count_user_input ─────────────────────────────────────────────────

class TestGetTreeCountUserInput:

    @pytest.mark.asyncio
    async def test_no_user_count_returns_calculated(self, svc, patch_tree_db):
        svc.spatial_utils.calculate_area_ha.return_value = 1.0  # 1 ha
        with patch_tree_db(fetchrow_results=[_density_row("2.5x8")]):
            result = await svc.get_tree_count_user_input(
                {"id": "p1", "province_code": "RAY", "a302_geometry": {}, "tree_count": None, "spacing_system": "2.5x8"}
            )
        assert result["tree_count"] == 500         # 1 ha × 500 trees/ha
        assert result["is_calculated"] is True

    @pytest.mark.asyncio
    async def test_user_within_threshold_is_used(self, svc, patch_tree_db):
        # calculated = 500; user = 502 → diff = 0.4% < 5%
        svc.spatial_utils.calculate_area_ha.return_value = 1.0
        with patch_tree_db(fetchrow_results=[_density_row("2.5x8")]):
            result = await svc.get_tree_count_user_input(
                {"id": "p1", "province_code": "RAY", "a302_geometry": {}, "tree_count": 502, "spacing_system": "2.5x8"}
            )
        assert result["tree_count"] == 502
        assert result["is_calculated"] is False

    @pytest.mark.asyncio
    async def test_user_outside_threshold_uses_calculated(self, svc, patch_tree_db):
        # calculated = 500; user = 1000 → diff = 100% > 5%
        svc.spatial_utils.calculate_area_ha.return_value = 1.0
        with patch_tree_db(fetchrow_results=[_density_row("2.5x8")]):
            result = await svc.get_tree_count_user_input(
                {"id": "p1", "province_code": "RAY", "a302_geometry": {}, "tree_count": 1000, "spacing_system": "2.5x8"}
            )
        assert result["tree_count"] == 500
        assert result["is_calculated"] is True

    @pytest.mark.asyncio
    async def test_zero_calculated_uses_user_input(self, svc, patch_tree_db):
        # area = 0 → calculated = 0; can't validate, so trust user input as-is
        svc.spatial_utils.calculate_area_ha.return_value = 0.0
        with patch_tree_db(fetchrow_results=[_density_row("2.5x8")]):
            result = await svc.get_tree_count_user_input(
                {"id": "p1", "province_code": "RAY", "a302_geometry": {}, "tree_count": 300, "spacing_system": "2.5x8"}
            )
        assert result["tree_count"] == 300
        assert result["is_calculated"] is False

    @pytest.mark.asyncio
    async def test_default_spacing_used_when_not_provided(self, svc, patch_tree_db):
        svc.spatial_utils.calculate_area_ha.return_value = 1.0
        # No spacing_system → looks up tbl_region_config.default_spacing first,
        # then tbl_tree_density for that spacing.
        with patch_tree_db(fetchrow_results=[{"default_spacing": "2.5x8"}, _density_row("2.5x8")]):
            result = await svc.get_tree_count_user_input(
                {"id": "p1", "province_code": "RAY", "a302_geometry": {}, "tree_count": None, "spacing_system": None}
            )
        assert result["tree_count"] == 500

    @pytest.mark.parametrize("spacing,density", list(TREE_DENSITIES.items()))
    @pytest.mark.asyncio
    async def test_all_spacing_densities(self, svc, patch_tree_db, spacing, density):
        svc.spatial_utils.calculate_area_ha.return_value = 1.0
        with patch_tree_db(fetchrow_results=[_density_row(spacing)]):
            result = await svc.get_tree_count_user_input(
                {"id": "p1", "province_code": "RAY", "a302_geometry": {}, "tree_count": None, "spacing_system": spacing}
            )
        assert result["tree_count"] == density

    @pytest.mark.asyncio
    async def test_exact_threshold_boundary_uses_user_input(self, svc, patch_tree_db):
        # diff exactly == TREE_COUNT_VALIDATION_THRESHOLD (5%) → still within bound
        svc.spatial_utils.calculate_area_ha.return_value = 1.0
        boundary_user = int(500 * (1 + TREE_COUNT_VALIDATION_THRESHOLD))
        with patch_tree_db(fetchrow_results=[_density_row("2.5x8")]):
            result = await svc.get_tree_count_user_input(
                {"id": "p1", "province_code": "RAY", "a302_geometry": {}, "tree_count": boundary_user, "spacing_system": "2.5x8"}
            )
        assert result["is_calculated"] is False


# ── get_tree_count_raster_pixel ───────────────────────────────────────────────

class TestGetTreeCountRasterPixel:

    @pytest.mark.asyncio
    async def test_homogeneous_uses_full_area(self, svc, patch_tree_db):
        # 95/100 pixels = 95% > TREE_AGE_HOMOLOGOUS_THRESHOLD (90%)
        svc.spatial_utils.calculate_area_ha.return_value = 2.0
        with patch_tree_db(fetchrow_results=[_density_row("2.5x8")]):
            result = await svc.get_tree_count_raster_pixel(
                {"id": "p1", "province_code": "RAY", "a302_geometry": {}, "spacing_system": "2.5x8"},
                num_pixel=95, total_pixels=100,
            )
        assert result["tree_count"] == 1000  # 2 ha × 500
        assert result["is_calculated"] is True

    @pytest.mark.asyncio
    async def test_heterogeneous_adjusts_by_pixel_ratio(self, svc, patch_tree_db):
        # 50/100 = 50% < 90% threshold → area × ratio; density is hardcoded
        # 500 in this branch, no DB lookup involved.
        svc.spatial_utils.calculate_area_ha.return_value = 2.0
        result = await svc.get_tree_count_raster_pixel(
            {"id": "p1", "province_code": "RAY", "a302_geometry": {}, "spacing_system": None},
            num_pixel=50, total_pixels=100,
        )
        # adjusted_area = 2.0 × 0.5 = 1.0 ha; density=500
        assert result["tree_count"] == 500
        assert result["is_calculated"] is True
