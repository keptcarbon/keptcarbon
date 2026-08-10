"""Integration tests for POST /api/v1/carbon/assess.

The route lives in app/api/routes/carbon.py (not app/api/routes/estimate —
that module doesn't exist) and is mounted under the /api/v1 prefix set in
app/main.py, so the real path is /api/v1/carbon/assess.
"""
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
    "selected_lu_classes": ["A302"],
}]

SUCCESS_PROFILE = [
    {
        "year": 2026,
        "year_at": 0,
        "age": 16,
        "stocks": {"value": 50.0, "ci": 5.0, "ci_lower": 45.0, "ci_upper": 55.0},
        "gain": {"value": 0.0, "ci": 0.0, "ci_lower": 0.0, "ci_upper": 0.0},
    }
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
    with patch("app.api.routes.carbon.service", mock_service):
        from app.main import app as _app
        yield _app


@pytest.mark.asyncio
async def test_assess_success(app, mock_service):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/v1/carbon/assess", json=GOOD_PAYLOAD)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert data[0]["polygon_id"] == "plot_0"
    assert data[0]["carbon_profile"] is not None


@pytest.mark.asyncio
async def test_assess_returns_list(app, mock_service):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/v1/carbon/assess", json=GOOD_PAYLOAD)
    assert isinstance(resp.json(), list)
    assert len(resp.json()) == 1


@pytest.mark.asyncio
async def test_assess_empty_body_returns_200_empty(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/v1/carbon/assess", json=[])
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_assess_service_error_returns_500(app, mock_service):
    from fastapi import HTTPException
    mock_service.get_carbon_profile = AsyncMock(
        side_effect=HTTPException(status_code=500, detail="Internal error")
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/v1/carbon/assess", json=GOOD_PAYLOAD)
    assert resp.status_code == 500
    assert "Internal error" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_assess_missing_selected_lu_classes_returns_422(app):
    # selected_lu_classes is a required field on CarbonAssessRequest
    bad_payload = [{k: v for k, v in GOOD_PAYLOAD[0].items() if k != "selected_lu_classes"}]
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/v1/carbon/assess", json=bad_payload)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_assess_invalid_json_returns_422(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/v1/carbon/assess", content=b"not-json",
                              headers={"Content-Type": "application/json"})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_health_check(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get("/")
    assert resp.status_code == 200
    assert resp.json()["status"] == "active"
