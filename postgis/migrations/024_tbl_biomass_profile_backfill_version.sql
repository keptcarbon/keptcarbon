-- ============================================================================
-- Migration 024 — tbl_biomass_profile: backfill version = 'v1'
-- ============================================================================
-- Run against an EXISTING database (the postgis/init/*.sql scripts only run
-- when the Docker volume is created fresh -- a fresh volume already inserts
-- version = 'v1' directly, see postgis/init/14-biomass-profile-data.sql):
--
--   docker compose exec -T postgis \
--     psql -U keptcarbon -d keptcarbon -v ON_ERROR_STOP=1 \
--     < postgis/migrations/024_tbl_biomass_profile_backfill_version.sql
--
-- Every existing row belongs to the same single import batch (10
-- clone/growth_model/allometry combinations x 36 ages, p_code=RAY, loaded by
-- migration 008/init 14) and version has been NULL for all of them since
-- migration 014 added the column -- 'v1' tags that one batch as the first
-- vintage so tbl_region_config.biomass_profile_version (see migration 023)
-- can be sourced from real tbl_biomass_profile.version values instead of
-- being a free-standing label.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM tbl_biomass_profile WHERE version IS NULL
  ) THEN
    RAISE EXCEPTION 'tbl_biomass_profile has no NULL-version rows -- migration 024 already applied, or there is no data to backfill, aborting.';
  END IF;
END $$;

UPDATE tbl_biomass_profile SET version = 'v1' WHERE version IS NULL;

COMMIT;
