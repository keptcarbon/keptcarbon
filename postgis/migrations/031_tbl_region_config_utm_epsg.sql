-- ============================================================================
-- Migration 031 — tbl_region_config: add utm_epsg (per-province UTM zone)
-- ============================================================================
-- Run against an EXISTING database (after 016):
--
--   docker compose exec -T postgis \
--     psql -U keptcarbon -d keptcarbon -v ON_ERROR_STOP=1 \
--     < postgis/migrations/031_tbl_region_config_utm_epsg.sql
--
-- The backend used to hard-code EPSG:32647 (UTM zone 47N) for the A302
-- geometry it clips the planting-year raster with. Thailand spans zones 47
-- and 48 (roughly east of 102°E), and each province's rasters are produced in
-- one zone, so the zone is now configured per province:
--   - 32647 = WGS 84 / UTM zone 47N
--   - 32648 = WGS 84 / UTM zone 48N
-- It must match the SRID of that province's geo_planting_year raster.
--
-- Areas (A302_area_m2, tree count) are no longer measured in UTM at all --
-- they're geodesic -- so this only affects raster clipping.
--
-- All existing rows are Rayong (zone 47, 101.x°E) -> 32647.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tbl_region_config'
      AND column_name = 'utm_epsg'
  ) THEN
    RAISE EXCEPTION 'tbl_region_config.utm_epsg already exists -- migration 031 already applied, aborting.';
  END IF;
END $$;

ALTER TABLE tbl_region_config ADD COLUMN utm_epsg INTEGER;

UPDATE tbl_region_config SET utm_epsg = 32647;

ALTER TABLE tbl_region_config
  ALTER COLUMN utm_epsg SET NOT NULL,
  ADD CONSTRAINT chk_region_config_utm_epsg CHECK (utm_epsg IN (32647, 32648));

COMMENT ON COLUMN tbl_region_config.utm_epsg IS
  'UTM zone (EPSG) of this province''s planting-year raster: 32647 = zone 47N, 32648 = zone 48N';

COMMIT;
