import pytest
import pandas as pd
import numpy as np
from unittest.mock import MagicMock, patch


# ── Lookup table fixture ──────────────────────────────────────────────────────

@pytest.fixture
def lookup_df():
    """Fake biomass lookup table (Ages 0-35)."""
    ages = list(range(36))
    return pd.DataFrame({
        "Age":              ages,
        "Biomass_Est":      [a * 10.0 for a in ages],
        "Biomass_CI":       [a * 1.0  for a in ages],
        "Biomass_CI_Lower": [a * 9.0  for a in ages],
        "Biomass_CI_Upper": [a * 11.0 for a in ages],
    })


# ── poly_data fixtures ────────────────────────────────────────────────────────

@pytest.fixture
def rayong_poly_data():
    """Minimal poly_data dict for a Rayong rubber plot."""
    return {
        "id": "test_plot",
        "province_code": "RAY",
        "rubber_clone": "RRIM 600",
        "year_of_planting": 2015,
        "tree_count": 500,
        "spacing_system": "2.5x8",
        "a302_geometry": {
            "type": "Polygon",
            "coordinates": [[[100.0, 12.0], [100.01, 12.0], [100.01, 12.01], [100.0, 12.01], [100.0, 12.0]]]
        },
    }


@pytest.fixture
def mock_carbon_service():
    """CarbonService with all heavy __init__ deps mocked out."""
    with patch("app.services.carbon_service.ProvinceService"), \
         patch("app.services.carbon_service.LanduseService"), \
         patch("app.services.carbon_service.AgeMapService"), \
         patch("app.services.carbon_service.TreeService"), \
         patch("app.services.carbon_service.SpatialUtils"):
        from app.services.carbon_service import CarbonService
        svc = CarbonService()
        yield svc


@pytest.fixture
def mock_tree_service():
    """TreeService with SpatialUtils mocked."""
    with patch("app.services.tree_service.SpatialUtils") as mock_su:
        from app.services.tree_service import TreeService
        svc = TreeService()
        svc.spatial_utils = mock_su.return_value
        yield svc
