-- ============================================================================
-- Migration 021 — rename tbl_planting_year_dist district/subdistrict columns
-- ============================================================================
-- Only needed for a database whose tbl_planting_year_dist was created by an
-- OLDER copy of migration 019/init 18 (before those were edited in place to
-- use the new column names directly). Run against an EXISTING database (the
-- postgis/init/*.sql scripts only run when the Docker volume is created
-- fresh -- a fresh volume already creates the table with the new names, see
-- postgis/init/18-tbl-planting-year-dist.sql):
--
--   docker compose exec -T postgis \
--     psql -U keptcarbon -d keptcarbon -v ON_ERROR_STOP=1 \
--     < postgis/migrations/021_rename_tbl_planting_year_dist_columns.sql
--
-- Pure rename -- no data changes, so no maintenance window required. The
-- uq_planting_year_dist UNIQUE constraint and idx_planting_year_dist_lookup
-- index don't embed these column names, so nothing else needs renaming.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tbl_planting_year_dist' AND column_name = 'amphoe_idn'
  ) THEN
    RAISE EXCEPTION 'tbl_planting_year_dist.amphoe_idn does not exist -- migration 021 already applied, or this database already has the new column names from a fresh install / the edited 019, aborting.';
  END IF;
END $$;

ALTER TABLE tbl_planting_year_dist RENAME COLUMN amphoe_idn TO district_idn;
ALTER TABLE tbl_planting_year_dist RENAME COLUMN amphoe_name_th TO district_name_th;
ALTER TABLE tbl_planting_year_dist RENAME COLUMN tambon_idn TO subdistrict_idn;
ALTER TABLE tbl_planting_year_dist RENAME COLUMN tambon_name_th TO subdistrict_name_th;

COMMIT;
