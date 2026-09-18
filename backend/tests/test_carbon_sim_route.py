"""Integration tests for POST /api/v1/carbon/sim.

Mirrors test_carbon_route.py's approach for /carbon/assess: the route-level
`service` singleton in app/api/routes/carbon.py is patched so no real DB
connection is needed.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport


GOOD_PAYLOAD = [{
    "p_code": "RAY",
    "clone": "RRIM 600",
    "age": 16,
    "area_m2": 12000.0,
    "growth_model": "weibull",
    "allometry": "chiarawipa",
}]

SIM_RESPONSE = {
    "p_code": "RAY",
    "clone": "RRIM 600",
    "age": 16,
    "area_m2": 12000.0,
    "growth_model": "weibull",
    "allometry": "chiarawipa",
    "status": {
        "status": "pending",
        "status_code": "P01",
        "message": "SIMULATION SKELETON — GROWTH MODEL COMPUTATION NOT YET IMPLEMENTED.",
    },
    "carbon_stock_tCO2e": None,
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
    assert isinstance(data, list)
    assert data[0]["age"] == 16
    assert data[0]["growth_model"] == "weibull"
    assert data[0]["allometry"] == "chiarawipa"
    assert data[0]["carbon_stock_tCO2e"] is None
    assert data[0]["status"]["status"] == "pending"
    mock_service.get_carbon_simulation.assert_awaited_once_with({
        "p_code": "RAY",
        "clone": "RRIM 600",
        "age": 16,
        "area_m2": 12000.0,
        "growth_model": "weibull",
        "allometry": "chiarawipa",
    })


@pytest.mark.asyncio
async def test_sim_returns_list(app, mock_service):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/v1/carbon/sim", json=GOOD_PAYLOAD)
    assert isinstance(resp.json(), list)
    assert len(resp.json()) == 1


@pytest.mark.asyncio
async def test_sim_multiple_items(app, mock_service):
    payload = GOOD_PAYLOAD + [{
        "p_code": "RAY",
        "clone": "RRIM 600",
        "age": 5,
        "area_m2": 3000.0,
        "growth_model": "schumacher",
        "allometry": "hytonen",
    }]
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/v1/carbon/sim", json=payload)
    assert resp.status_code == 200
    assert len(resp.json()) == 2
    assert mock_service.get_carbon_simulation.await_count == 2


@pytest.mark.asyncio
async def test_sim_empty_body_returns_200_empty(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/v1/carbon/sim", json=[])
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_sim_service_error_returns_500(app, mock_service):
    mock_service.get_carbon_simulation = AsyncMock(side_effect=RuntimeError("boom"))
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/v1/carbon/sim", json=GOOD_PAYLOAD)
    assert resp.status_code == 500
    assert "boom" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_sim_missing_field_returns_422(app):
    bad_payload = [{k: v for k, v in GOOD_PAYLOAD[0].items() if k != "growth_model"}]
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/v1/carbon/sim", json=bad_payload)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_sim_wrong_type_returns_422(app):
    bad_payload = [{**GOOD_PAYLOAD[0], "age": "not-a-number"}]
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/v1/carbon/sim", json=bad_payload)
    assert resp.status_code == 422
