-- ============================================================================
-- Migration 014 — tbl_biomass_profile: drop created_at, add version
-- ============================================================================
-- Run against an EXISTING database:
--
--   docker compose exec -T postgis \
--     psql -U keptcarbon -d keptcarbon -v ON_ERROR_STOP=1 \
--     < postgis/migrations/014_biomass_profile_version_column.sql
--
-- created_at was never read by any code path (CarbonService's query selects
-- specific columns, not *) -- dropped as unused. version VARCHAR(10) is
-- added to identify which import batch/vintage of the lookup CSV a row's
-- data came from, mirroring p_code's VARCHAR(10) sizing.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tbl_biomass_profile' AND column_name = 'created_at'
  ) THEN
    RAISE EXCEPTION 'tbl_biomass_profile.created_at does not exist -- migration 014 already applied, aborting.';
  END IF;
END $$;

ALTER TABLE public.tbl_biomass_profile
  DROP COLUMN created_at,
  ADD COLUMN version VARCHAR(10);

COMMIT;
