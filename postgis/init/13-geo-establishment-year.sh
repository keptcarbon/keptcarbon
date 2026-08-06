#!/bin/bash
# Loads geo_establishment_year raster data on a fresh volume. Runs after
# 13-geo-establishment-year-schema.sql (docker-entrypoint-initdb.d executes
# files in this directory in lexical order) via the postgis image's own
# initdb hook, so $POSTGRES_USER / $POSTGRES_DB are already exported.
#
# Requires raster2pgsql, which the base postgis/postgis image does NOT ship
# -- see postgis/Dockerfile. Source raster lives in
# backend/app/data/rasters/establishment_year_rayong.tif, bind-mounted here
# as /rasters (see docker-compose.yml).
set -euo pipefail

RASTER=/rasters/establishment_year_rayong.tif

if [ ! -f "$RASTER" ]; then
  echo "13-geo-establishment-year.sh: $RASTER not found, skipping raster load" >&2
  exit 0
fi

EXISTING=$(psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -tAc \
  "SELECT count(*) FROM geo_establishment_year")
if [ "$EXISTING" -gt 0 ]; then
  echo "13-geo-establishment-year.sh: geo_establishment_year already populated, skipping" >&2
  exit 0
fi

raster2pgsql -s 32647 -t 100x100 -a -I "$RASTER" public.geo_establishment_year \
  | psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c \
  "DO \$\$ BEGIN RAISE NOTICE 'geo_establishment_year seeded: % raster tiles', (SELECT count(*) FROM geo_establishment_year); END \$\$;"
