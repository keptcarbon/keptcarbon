-- ============================================================================
-- Migration 022 — rename tbl_region_config.est_year_version -> planting_year_version
-- ============================================================================
-- Only needed for a database whose tbl_region_config was created by an OLDER
-- copy of migration 016/init 16 (before those were edited in place to use
-- the new column name directly). Run against an EXISTING database (the
-- postgis/init/*.sql scripts only run when the Docker volume is created
-- fresh -- a fresh volume already creates the table with the new name, see
-- postgis/init/16-tbl-region-config.sql):
--
--   docker compose exec -T postgis \
--     psql -U keptcarbon -d keptcarbon -v ON_ERROR_STOP=1 \
--     < postgis/migrations/022_rename_tbl_region_config_est_year_version.sql
--
-- Pure rename -- no data changes, so no maintenance window required.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tbl_region_config' AND column_name = 'est_year_version'
  ) THEN
    RAISE EXCEPTION 'tbl_region_config.est_year_version does not exist -- migration 022 already applied, or this database already has planting_year_version from a fresh install / the edited 016, aborting.';
  END IF;
END $$;

ALTER TABLE tbl_region_config RENAME COLUMN est_year_version TO planting_year_version;

COMMIT;
