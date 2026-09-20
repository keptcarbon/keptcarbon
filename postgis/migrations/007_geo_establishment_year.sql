-- ============================================================================
-- Migration 007 — geo_planting_year: plantation planting-year raster
-- ============================================================================
-- Run against an EXISTING database (the postgis/init/*.sql|*.sh scripts only
-- run when the Docker volume is created fresh):
--
--   docker compose exec -T postgis \
--     psql -U keptcarbon -d keptcarbon -v ON_ERROR_STOP=1 \
--     < postgis/migrations/007_geo_planting_year.sql
--
--   docker compose exec -T postgis \
--     raster2pgsql -s 32647 -t 100x100 -a -I /rasters/planting_year_rayong.tif \
--       public.geo_planting_year \
--     | docker compose exec -T postgis psql -U keptcarbon -d keptcarbon -v ON_ERROR_STOP=1
--
-- (requires the postgis service to be built from postgis/Dockerfile so
-- raster2pgsql is on PATH, and /rasters mounted per docker-compose.yml --
-- both added alongside this migration)
--
-- Purely additive: creates one new table (geo_planting_year) and its
-- index. Touches no existing table/column, so no maintenance window is
-- required. Schema matches postgis/init/13-geo-planting-year-schema.sql
-- so fresh-volume and existing-database paths can never drift apart.
--
-- Background: backend/app/services/agemap_service.py was refactored
-- (commit a28cab2) to query this table instead of reading
-- backend/app/data/rasters/*.tif directly via rasterio, but the table/load
-- step was never actually added -- this migration fixes that gap. See that
-- commit's parent for the pre-refactor file-based implementation.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'geo_planting_year'
  ) THEN
    RAISE EXCEPTION 'geo_planting_year already exists -- migration 007 already applied, aborting.';
  END IF;
END $$;

CREATE TABLE public.geo_planting_year (
    rid   serial PRIMARY KEY,
    p_code text NOT NULL DEFAULT 'RAY',
    year  integer NOT NULL DEFAULT 2026,
    rast  raster
);

CREATE INDEX geo_planting_year_p_code_year_idx
    ON public.geo_planting_year (p_code, year);

COMMIT;

-- Raster data load (raster2pgsql, run separately -- see header) happens
-- after this commits, since it's a CLI step, not plain SQL.
