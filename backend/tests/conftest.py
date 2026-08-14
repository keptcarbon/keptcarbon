import pytest
from unittest.mock import MagicMock, patch


# ── Biomass lookup table fixture ────────────────────────────────────────────
# Mirrors the row shape returned by the tbl_biomass_profile query in
# CarbonService.generate_carbon_profile (asyncpg Record → dict-subscriptable).

@pytest.fixture
def biomass_rows():
    """Fake biomass lookup rows (ages 0-35)."""
    ages = list(range(36))
    return [
        {
            "age": a,
            "biomass_est": a * 10.0,
            "biomass_ci_lower": a * 9.0,
            "biomass_ci_upper": a * 11.0,
        }
        for a in ages
    ]


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


# ── Fake asyncpg pool/connection ────────────────────────────────────────────
# CarbonService.generate_carbon_profile does:
#   pool = get_pool(); async with pool.acquire() as conn: await conn.fetch(...)
# These fakes let tests control what that fetch() returns/raises without a
# real database.

class _FakeConn:
    def __init__(self, rows=None, exc=None):
        self._rows = rows if rows is not None else []
        self._exc = exc
        self.calls = []  # list of (args, kwargs) for each fetch() call

    async def fetch(self, *args, **kwargs):
        self.calls.append((args, kwargs))
        if self._exc is not None:
            raise self._exc
        return self._rows


class _FakeAcquireCtx:
    def __init__(self, conn):
        self._conn = conn

    async def __aenter__(self):
        return self._conn

    async def __aexit__(self, *exc_info):
        return False


class _FakePool:
    def __init__(self, conn):
        self._conn = conn

    def acquire(self):
        return _FakeAcquireCtx(self._conn)


@pytest.fixture
def patch_db_fetch():
    """Patch app.services.carbon_service.get_pool to return rows/raise exc.

    Usage: patch_db_fetch(rows=biomass_rows) or patch_db_fetch(exc=OSError(...))
    """
    def _apply(rows=None, exc=None):
        fake_pool = _FakePool(_FakeConn(rows=rows, exc=exc))
        return patch("app.services.carbon_service.get_pool", return_value=fake_pool)
    return _apply
