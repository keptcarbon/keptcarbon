"""Integration tests for POST /api/estimate."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport


GEOMETRY = {
    "type": "MultiPolygon",
    "coordinates": [[[[101.438, 12.807], [101.445, 12.809],
                       [101.447, 12.802], [101.439, 12.800],
                       [101.438, 12.807]]]]
}

GOOD_PAYLOAD = [{
    "id": "plot_0",
    "geometry": GEOMETRY,
    "year_of_planting": 2010,
    "rubber_clone": "RRIM 600",
    "tree_count": 500,
    "spacing_system": "2.5x8",
}]

SUCCESS_PROFILE = [
    {"year": 2026, "total_carbon_tCO2e": 50.0, "ci_lower_tCO2e": 45.0, "ci_upper_tCO2e": 55.0}
]

SUCCESS_RESPONSE = {
    "polygon_id": "plot_0",
    "status": {"status": "success", "status_code": "S03", "message": "OK"},
    "carbon_profile": SUCCESS_PROFILE,
}


@pytest.fixture
def mock_service():
    svc = MagicMock()
    svc.get_carbon_profile = AsyncMock(return_value=SUCCESS_RESPONSE)
    return svc


@pytest.fixture
def app(mock_service):
    """Return the FastAPI app with the route-level service replaced."""
    with patch("app.api.routes.estimate.service", mock_service):
        from app.main import app as _app
        yield _app


@pytest.mark.asyncio
async def test_estimate_success(app, mock_service):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/estimate", json=GOOD_PAYLOAD)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert data[0]["polygon_id"] == "plot_0"
    assert data[0]["carbon_profile"] is not None


@pytest.mark.asyncio
async def test_estimate_returns_list(app, mock_service):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/estimate", json=GOOD_PAYLOAD)
    assert isinstance(resp.json(), list)
    assert len(resp.json()) == 1


@pytest.mark.asyncio
async def test_estimate_empty_body_returns_200_empty(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/estimate", json=[])
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_estimate_service_error_returns_500(app, mock_service):
    from fastapi import HTTPException
    mock_service.get_carbon_profile = AsyncMock(
        side_effect=HTTPException(status_code=500, detail="Internal error")
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/estimate", json=GOOD_PAYLOAD)
    assert resp.status_code == 500
    assert "Internal error" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_estimate_invalid_json_returns_422(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/estimate", content=b"not-json",
                             headers={"Content-Type": "application/json"})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_health_check(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get("/")
    assert resp.status_code == 200
    assert resp.json()["status"] == "active"
