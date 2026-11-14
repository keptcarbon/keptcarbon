-- ============================================================================
-- Migration 018 — add tbl_tree_density.tree_density_rai
-- ============================================================================
-- Run against an EXISTING database (the postgis/init/*.sql scripts only run
-- when the Docker volume is created fresh):
--
--   docker compose exec -T postgis \
--     psql -U keptcarbon -d keptcarbon -v ON_ERROR_STOP=1 \
--     < postgis/migrations/018_tbl_tree_density_add_rai.sql
--
-- tree_density_rai is a generated column so it can never drift from
-- tree_density_ha -- 1 hectare = 6.25 rai, so density/rai = density/ha / 6.25,
-- rounded to the nearest whole tree.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tbl_tree_density' AND column_name = 'tree_density_rai'
  ) THEN
    RAISE EXCEPTION 'tbl_tree_density.tree_density_rai already exists -- migration 018 already applied, aborting.';
  END IF;
END $$;

ALTER TABLE tbl_tree_density
  ADD COLUMN tree_density_rai INTEGER GENERATED ALWAYS AS (ROUND(tree_density_ha / 6.25)::INTEGER) STORED;

COMMIT;
