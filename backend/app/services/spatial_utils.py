import geopandas as gpd
from shapely.geometry import shape


class SpatialUtils:
    def calculate_area(self, geometry_obj) -> float:
        """Calculates metric area in hectares (EPSG:32647)."""
        # GeoJSON geometry dict -> Shapely geometry
        poly_geom = shape(geometry_obj) if isinstance(geometry_obj, dict) else geometry_obj

        # Create plantation GeoDataFrame
        poly_gdf = gpd.GeoDataFrame(
            index=[0],
            crs="EPSG:32647",
            geometry=[poly_geom]
        )

        area_m2 = poly_gdf.geometry[0].area
        return float(area_m2)

    def calculate_area_ha(self, geometry_obj) -> float:
        area_m2 = self.calculate_area(geometry_obj)
        # Convert to hectares
        return float(area_m2 / 10000.0)