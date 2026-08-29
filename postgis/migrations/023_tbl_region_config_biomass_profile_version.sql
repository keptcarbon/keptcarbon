-- ============================================================================
-- Migration 023 — tbl_region_config: add biomass_profile_version column
-- ============================================================================
-- Run against an EXISTING database (the postgis/init/*.sql scripts only run
-- when the Docker volume is created fresh -- a fresh volume already creates
-- the column, see postgis/init/16-tbl-region-config.sql):
--
--   docker compose exec -T postgis \
--     psql -U keptcarbon -d keptcarbon -v ON_ERROR_STOP=1 \
--     < postgis/migrations/023_tbl_region_config_biomass_profile_version.sql
--
-- Column is NOT NULL, so existing rows are backfilled with placeholder 'v1'
-- before the constraint is applied.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tbl_region_config' AND column_name = 'biomass_profile_version'
  ) THEN
    RAISE EXCEPTION 'tbl_region_config.biomass_profile_version already exists -- migration 023 already applied, aborting.';
  END IF;
END $$;

ALTER TABLE public.tbl_region_config
  ADD COLUMN biomass_profile_version VARCHAR(50);

UPDATE public.tbl_region_config
  SET biomass_profile_version = 'v1'
  WHERE biomass_profile_version IS NULL;

ALTER TABLE public.tbl_region_config
  ALTER COLUMN biomass_profile_version SET NOT NULL;

COMMIT;
