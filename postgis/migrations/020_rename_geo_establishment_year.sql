-- ============================================================================
-- Migration 020 — rename geo_establishment_year -> geo_planting_year
-- ============================================================================
-- Only needed for a database whose geo_establishment_year table was created
-- by an OLDER copy of migration 007/000 (before those were edited in place
-- to create geo_planting_year directly). Run against an EXISTING database
-- (the postgis/init/*.sql|*.sh scripts only run when the Docker volume is
-- created fresh -- a fresh volume already creates the table under the new
-- name, see postgis/init/13-geo-planting-year-schema.sql):
--
--   docker compose exec -T postgis \
--     psql -U keptcarbon -d keptcarbon -v ON_ERROR_STOP=1 \
--     < postgis/migrations/020_rename_geo_establishment_year.sql
--
-- Pure rename -- no column/data changes, so no maintenance window required.
-- Renames both the table (created by the pre-edit migration 007) and its
-- p_code/year index to match.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'geo_establishment_year'
  ) THEN
    RAISE EXCEPTION 'geo_establishment_year does not exist -- migration 020 already applied, or this database already has geo_planting_year from a fresh install / the edited 007, aborting.';
  END IF;
END $$;

ALTER TABLE public.geo_establishment_year RENAME TO geo_planting_year;
ALTER INDEX public.geo_establishment_year_p_code_year_idx RENAME TO geo_planting_year_p_code_year_idx;

COMMIT;
