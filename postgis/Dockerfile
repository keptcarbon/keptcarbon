# The base postgis/postgis image ships the postgis_raster *extension* (SQL
# functions) but not the raster2pgsql / gdal-bin CLI tools needed to import a
# GeoTIFF into a raster table. Without this, geo_establishment_year (see
# init/13-geo-establishment-year.sh) can never be seeded on a fresh volume.
FROM postgis/postgis:16-3.4

RUN apt-get update \
    && apt-get install -y --no-install-recommends postgis gdal-bin \
    && rm -rf /var/lib/apt/lists/*
