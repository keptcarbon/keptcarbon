-- ============================================================================
-- Migration 020 — rename geo_planting_year -> geo_planting_year
-- ============================================================================
-- Run against an EXISTING database (the postgis/init/*.sql|*.sh scripts only
-- run when the Docker volume is created fresh -- a fresh volume already
-- creates the table under the new name, see postgis/init/13-geo-planting-
-- year-schema.sql):
--
--   docker compose exec -T postgis \
--     psql -U keptcarbon -d keptcarbon -v ON_ERROR_STOP=1 \
--     < postgis/migrations/020_rename_geo_planting_year.sql
--
-- Pure rename -- no column/data changes, so no maintenance window required.
-- Renames both the table (created by migration 007) and its p_code/year
-- index to match.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'geo_planting_year'
  ) THEN
    RAISE EXCEPTION 'geo_planting_year does not exist -- migration 020 already applied (or 007 was never run), aborting.';
  END IF;
END $$;

ALTER TABLE public.geo_planting_year RENAME TO geo_planting_year;
ALTER INDEX public.geo_planting_year_p_code_year_idx RENAME TO geo_planting_year_p_code_year_idx;

COMMIT;
