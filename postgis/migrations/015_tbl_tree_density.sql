-- ============================================================================
-- Migration 015 — create tbl_tree_density
-- ============================================================================
-- Run against an EXISTING database (the postgis/init/*.sql scripts only run
-- when the Docker volume is created fresh):
--
--   docker compose exec -T postgis \
--     psql -U keptcarbon -d keptcarbon -v ON_ERROR_STOP=1 \
--     < postgis/migrations/015_tbl_tree_density.sql
--
-- Spacing-system -> planting-density lookup, mirroring
-- backend/app/core/constants.py TREE_DENSITIES so the same reference data
-- can eventually be served from the DB instead of a hardcoded dict.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'tbl_tree_density'
  ) THEN
    RAISE EXCEPTION 'tbl_tree_density already exists -- migration 015 already applied, aborting.';
  END IF;
END $$;

CREATE TABLE tbl_tree_density (
  id                SERIAL       PRIMARY KEY,
  tree_spacing      VARCHAR(20)  NOT NULL UNIQUE,  -- e.g. '2.5x8'
  tree_density_ha   INTEGER      NOT NULL,          -- trees per hectare
  "desc"            TEXT
);

INSERT INTO tbl_tree_density (tree_spacing, tree_density_ha, "desc") VALUES
  ('2.5x8', 500, 'Recommended standard for flat terrain'),
  ('3x7',   475, 'Common for sloped areas'),
  ('3x8',   419, 'Common for sloped areas'),
  ('2.5x7', 569, 'Common for newly planted flat zones'),
  ('3x6',   556, 'Common for newly planted flat zones');

COMMIT;
