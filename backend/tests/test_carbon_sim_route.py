"""Integration tests for POST /api/v1/carbon/sim.

Mirrors test_carbon_route.py's approach for /carbon/assess: the route-level
`service` singleton in app/api/routes/carbon.py is patched so no real DB
connection is needed.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException
from httpx import AsyncClient, ASGITransport


GOOD_ROW = {
    "p_code": "RAY",
    "clone": "RRIM 600",
    "growth_model": "weibull",
    "allometry": "chiarawipa",
    "biomass_profile_version": "v1",
    "year_of_planting": 2010,
    "area_m2": 12000.0,
    "spacing_system": "2.5x8",
}
GOOD_PAYLOAD = [GOOD_ROW]

SIM_RESPONSE = {
    "status": {
        "status": "success",
        "status_code": "S05",
        "message": "CARBON SIMULATION PROFILE GENERATED.",
    },
    "rows": [{**GOOD_ROW, "tree_count": 600, "rotation_year": 35, "replanting_rate": 1.0}],
    "total_area_m2": 12000.0,
    "total_tree_count": 600,
    "carbon_stock_tCO2e_simulation": [{
        "year": 2026,
        "year_at": 0,
        "tree_count": 600,
        "carbon_stock_tCO2e": 120.5,
        "carbon_stock_upper_tCO2e": 120.5,
        "carbon_stock_lower_tCO2e": 120.5,
    }],
}


@pytest.fixture
def mock_service():
    svc = MagicMock()
    svc.get_carbon_simulation = AsyncMock(return_value=SIM_RESPONSE)
    return svc


@pytest.fixture
def app(mock_service):
    """Return the FastAPI app with the route-level service replaced."""
    with patch("app.api.routes.carbon.service", mock_service):
        from app.main import app as _app
        yield _app


@pytest.mark.asyncio
async def test_sim_success(app, mock_service):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/v1/carbon/sim", json=GOOD_PAYLOAD)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"]["status_code"] == "S05"
    assert data["total_tree_count"] == 600
    assert data["rows"][0]["growth_model"] == "weibull"
    assert data["carbon_stock_tCO2e_simulation"][0]["carbon_stock_tCO2e"] == 120.5
    # Optional fields are filled with their schema defaults before reaching the service
    mock_service.get_carbon_simulation.assert_awaited_once_with([{
        **GOOD_ROW,
        "tree_count": None,
        "rotation_year": 35,
        "replanting_rate": 1.0,
    }])


@pytest.mark.asyncio
async def test_sim_multiple_rows_sent_as_one_batch(app, mock_service):
    payload = GOOD_PAYLOAD + [{**GOOD_ROW, "year_of_planting": 2020, "growth_model": "schumacher"}]
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/v1/carbon/sim", json=payload)
    assert resp.status_code == 200
    mock_service.get_carbon_simulation.assert_awaited_once()
    assert len(mock_service.get_carbon_simulation.await_args.args[0]) == 2


@pytest.mark.asyncio
async def test_sim_service_error_returns_500(app, mock_service):
    mock_service.get_carbon_simulation = AsyncMock(side_effect=RuntimeError("boom"))
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/v1/carbon/sim", json=GOOD_PAYLOAD)
    assert resp.status_code == 500
    assert "boom" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_sim_service_http_exception_passes_through(app, mock_service):
    mock_service.get_carbon_simulation = AsyncMock(
        side_effect=HTTPException(status_code=422, detail="No biomass profile for p_code='RAY'")
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/v1/carbon/sim", json=GOOD_PAYLOAD)
    assert resp.status_code == 422
    assert resp.json()["detail"] == "No biomass profile for p_code='RAY'"


@pytest.mark.asyncio
async def test_sim_missing_field_returns_422(app):
    bad_payload = [{k: v for k, v in GOOD_PAYLOAD[0].items() if k != "growth_model"}]
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/v1/carbon/sim", json=bad_payload)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_sim_wrong_type_returns_422(app):
    bad_payload = [{**GOOD_ROW, "year_of_planting": "not-a-number"}]
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/v1/carbon/sim", json=bad_payload)
    assert resp.status_code == 422
