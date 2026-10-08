-- ============================================================================
-- Migration 034 — tbl_region_config: drop utm_epsg
-- ============================================================================
-- Run against an EXISTING database (after 031), AFTER deploying the backend
-- and Next.js versions that no longer read the column (the old backend
-- selects utm_epsg and would fail once it is gone):
--
--   docker compose exec -T postgis \
--     psql -U keptcarbon -d keptcarbon -v ON_ERROR_STOP=1 \
--     < postgis/migrations/034_drop_tbl_region_config_utm_epsg.sql
--
-- The UTM zone no longer needs configuring: AgeMapService reads the SRID
-- straight from the province's geo_planting_year tiles (ST_SRID(rast)) and
-- reprojects the WGS84 plot geometry into it before clipping. A province's
-- raster can be imported in EPSG:32647 (47N) or EPSG:32648 (48N); a
-- province spanning both zones uses one zone for its whole raster.
--
-- Safe to re-run: does nothing when the column is already gone.
-- ============================================================================

BEGIN;

ALTER TABLE tbl_region_config DROP CONSTRAINT IF EXISTS chk_region_config_utm_epsg;
ALTER TABLE tbl_region_config DROP COLUMN IF EXISTS utm_epsg;

COMMIT;
