"""Unit tests for SpatialUtils."""
import pytest
from shapely.geometry import Polygon
from app.services.spatial_utils import SpatialUtils


@pytest.fixture
def svc():
    return SpatialUtils()


# A square polygon in EPSG:32647 metres (100m × 100m = 0.01 ha near Rayong)
SQUARE_UTM = {
    "type": "Polygon",
    "coordinates": [[[700000.0, 1400000.0],
                      [700100.0, 1400000.0],
                      [700100.0, 1400100.0],
                      [700000.0, 1400100.0],
                      [700000.0, 1400000.0]]],
}


class TestCalculateAreaHa:

    def test_returns_float(self, svc):
        area = svc.calculate_area_ha(SQUARE_UTM)
        assert isinstance(area, float)

    def test_100m_square_is_one_hundredth_ha(self, svc):
        area = svc.calculate_area_ha(SQUARE_UTM)
        assert abs(area - 1.0) < 0.001          # 100×100 m² = 10000 m² = 1.0 ha

    def test_accepts_shapely_geometry(self, svc):
        geom = Polygon([(700000, 1400000), (700100, 1400000),
                        (700100, 1400100), (700000, 1400100)])
        area = svc.calculate_area_ha(geom)
        assert abs(area - 1.0) < 0.001

    def test_larger_polygon_has_larger_area(self, svc):
        big = {
            "type": "Polygon",
            "coordinates": [[[700000.0, 1400000.0],
                              [701000.0, 1400000.0],
                              [701000.0, 1401000.0],
                              [700000.0, 1401000.0],
                              [700000.0, 1400000.0]]],
        }
        small_area = svc.calculate_area_ha(SQUARE_UTM)
        big_area   = svc.calculate_area_ha(big)
        assert big_area > small_area

    def test_near_zero_polygon(self, svc):
        tiny = {
            "type": "Polygon",
            "coordinates": [[[700000.0, 1400000.0],
                              [700000.1, 1400000.0],
                              [700000.1, 1400000.1],
                              [700000.0, 1400000.1],
                              [700000.0, 1400000.0]]],
        }
        area = svc.calculate_area_ha(tiny)
        assert area >= 0.0
