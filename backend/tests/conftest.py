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
    def __init__(self, rows=None, exc=None, fetchrow_results=None, fetchval_results=None):
        self._rows = rows if rows is not None else []
        self._exc = exc
        # Queues consumed in call order, so a test can script a sequence of
        # fetchrow()/fetchval() results precisely.
        self._fetchrow_results = list(fetchrow_results) if fetchrow_results is not None else None
        self._fetchval_results = list(fetchval_results) if fetchval_results is not None else None
        self.calls = []          # fetch() calls: list of (args, kwargs)
        self.fetchrow_calls = []  # fetchrow() calls: list of (args, kwargs)
        self.fetchval_calls = []  # fetchval() calls: list of (args, kwargs)

    async def fetch(self, *args, **kwargs):
        self.calls.append((args, kwargs))
        if self._exc is not None:
            raise self._exc
        return self._rows

    async def fetchrow(self, *args, **kwargs):
        self.fetchrow_calls.append((args, kwargs))
        if self._exc is not None:
            raise self._exc
        return self._next_queued(self._fetchrow_results)

    async def fetchval(self, *args, **kwargs):
        self.fetchval_calls.append((args, kwargs))
        if self._exc is not None:
            raise self._exc
        return self._next_queued(self._fetchval_results)

    @staticmethod
    def _next_queued(queue):
        """Pop values off a scripted queue in order, but once only one item
        (or none, from the start) remains, keep returning it/None forever --
        so a single-item default (e.g. one region-config row) transparently
        answers any number of calls, while an explicit empty/None queue
        still consistently returns None."""
        if queue is None:
            return None
        if len(queue) > 1:
            return queue.pop(0)
        return queue[0] if queue else None


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


# Stands in for a real tbl_region_config row (RAY) so tests that don't care
# about region-config lookup behavior itself don't need to know about it.
_DEFAULT_REGION_CONFIG_ROW = {
    "default_clone": "RRIM 600",
    "default_growth": "weibull",
    "default_allometry": "hytonen_2018",
    "default_spacing": "2.5x8",
}


@pytest.fixture
def patch_db_fetch():
    """Patch app.services.carbon_service.get_pool to return rows/raise exc.

    generate_carbon_profile does a fetchrow() (tbl_region_config) followed by
    a fetch() (tbl_biomass_profile) on the same connection, so this fakes
    both: fetchrow_results defaults to a RAY-shaped tbl_region_config row
    unless overridden (e.g. fetchrow_results=[None] to simulate an
    unsupported province).

    Usage: patch_db_fetch(rows=biomass_rows)
           patch_db_fetch(exc=OSError(...))
           patch_db_fetch(rows=[], fetchrow_results=[{"default_clone": "FAKE_CLONE", ...}])
    """
    def _apply(rows=None, exc=None, fetchrow_results=None, fetchval_results=None):
        if fetchrow_results is None:
            fetchrow_results = [dict(_DEFAULT_REGION_CONFIG_ROW)]
        fake_pool = _FakePool(_FakeConn(
            rows=rows, exc=exc, fetchrow_results=fetchrow_results, fetchval_results=fetchval_results,
        ))
        return patch("app.services.carbon_service.get_pool", return_value=fake_pool)
    return _apply


@pytest.fixture
def patch_tree_db():
    """Patch app.services.tree_service.get_pool to return fetchrow results.

    TreeService._resolve_spacing_and_density does up to two fetchrow() calls
    per invocation: [default_spacing lookup (only if spacing_system wasn't
    given)] then [tree density lookup]. Pass fetchrow_results in that order.
    """
    def _apply(fetchrow_results=None, exc=None):
        fake_pool = _FakePool(_FakeConn(exc=exc, fetchrow_results=fetchrow_results))
        return patch("app.services.tree_service.get_pool", return_value=fake_pool)
    return _apply
