"""Tests for LocationService (POST /api/v1/plots/locate).

The SQL runs against PostGIS, so these cover the row → result mapping and the
route wiring with the pool mocked out; the query itself was checked against
the dev database.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport

from app.services.location_service import LocationService


def _row(**overrides):
    row = {
        "region_th": "ภาคตะวันออก", "province_th": "ระยอง", "district_th": "แกลง",
        "subdistrict_th": "ทางเกวียน", "p_code": "RAY", "supported": True,
        "in_subdistrict": True, "in_district": True, "in_province": True,
    }
    for prefix, box in (("s", (101.6, 12.7, 101.7, 12.8)),
                        ("d", (101.5, 12.6, 101.8, 12.9)),
                        ("p", (100.9, 12.5, 101.8, 13.1))):
        row[f"{prefix}_xmin"], row[f"{prefix}_ymin"], row[f"{prefix}_xmax"], row[f"{prefix}_ymax"] = box
    row.update(overrides)
    return row


def test_point_inside_subdistrict():
    r = LocationService._to_result("a", _row())
    assert r["level"] == "subdistrict"
    assert r["supported"] is True
    assert (r["province_code"], r["province_th"], r["district_th"], r["subdistrict_th"]) == ("RAY", "ระยอง", "แกลง", "ทางเกวียน")
    assert r["subdistrict_bbox"] == [101.6, 12.7, 101.7, 12.8]
    assert r["province_bbox"] == [100.9, 12.5, 101.8, 13.1]


def test_bbox_spanning_subdistricts_stops_at_district():
    r = LocationService._to_result("a", _row(in_subdistrict=False))
    assert r["level"] == "district"
    assert r["district_th"] == "แกลง"
    assert r["subdistrict_th"] is None and r["subdistrict_bbox"] is None


def test_bbox_spanning_districts_stops_at_province():
    r = LocationService._to_result("a", _row(in_subdistrict=False, in_district=False))
    assert r["level"] == "province"
    assert r["province_th"] == "ระยอง"
    assert r["district_th"] is None and r["district_bbox"] is None


def test_bbox_spanning_provinces():
    r = LocationService._to_result("a", _row(in_subdistrict=False, in_district=False, in_province=False))
    assert r["level"] == "multi_province"
    assert r["province_code"] is None and r["province_bbox"] is None


def test_no_match():
    r = LocationService._to_result("a", None)
    assert r["level"] == "none"
    assert r["supported"] is False


def test_unsupported_province():
    r = LocationService._to_result("a", _row(p_code="CHB", province_th="ชลบุรี", supported=False))
    assert r["level"] == "subdistrict"
    assert r["supported"] is False


def test_unnamed_subdistrict_falls_back_to_province():
    # Bangkok: one geo_subdistrict polygon with no names, no geo_district row.
    r = LocationService._to_result("a", _row(
        district_th=None, subdistrict_th=None, in_district=None,
        p_code="BKK", province_th="กรุงเทพมหานคร",
    ))
    assert r["level"] == "province"
    assert r["subdistrict_th"] is None and r["district_th"] is None


@pytest.mark.asyncio
async def test_locate_route_echoes_ids():
    conn = MagicMock()
    conn.fetchrow = AsyncMock(side_effect=[_row(), None])
    pool = MagicMock()
    pool.acquire.return_value.__aenter__ = AsyncMock(return_value=conn)
    pool.acquire.return_value.__aexit__ = AsyncMock(return_value=False)

    with patch("app.services.location_service.get_pool", return_value=pool):
        from app.main import app
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/api/v1/plots/locate", json={"items": [
                {"id": "p1", "geometry": {"type": "Point", "coordinates": [101.65, 12.75]}},
                {"id": "p2", "geometry": {"type": "Point", "coordinates": [101.0, 10.0]}},
            ]})

    assert resp.status_code == 200
    results = resp.json()["results"]
    assert [r["id"] for r in results] == ["p1", "p2"]
    assert results[0]["level"] == "subdistrict"
    assert results[1]["level"] == "none"


@pytest.mark.asyncio
async def test_locate_route_rejects_empty_items():
    from app.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/v1/plots/locate", json={"items": []})
    assert resp.status_code == 422
