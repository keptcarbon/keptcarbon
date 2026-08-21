-- ============================================================================
-- Migration 016 — create tbl_region_config
-- ============================================================================
-- Run against an EXISTING database (the postgis/init/*.sql scripts only run
-- when the Docker volume is created fresh):
--
--   docker compose exec -T postgis \
--     psql -U keptcarbon -d keptcarbon -v ON_ERROR_STOP=1 \
--     < postgis/migrations/016_tbl_region_config.sql
--
-- Per-province defaults and dataset versions, mirroring
-- backend/app/core/constants.py REGION_CONFIG so the same reference data
-- can eventually be served from the DB instead of a hardcoded dict.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'tbl_region_config'
  ) THEN
    RAISE EXCEPTION 'tbl_region_config already exists -- migration 016 already applied, aborting.';
  END IF;
END $$;

CREATE TABLE tbl_region_config (
  id              SERIAL       PRIMARY KEY,
  p_code          VARCHAR(10)  NOT NULL UNIQUE,  -- province code, e.g. 'RAY'
  p_name          VARCHAR(100) NOT NULL,          -- e.g. 'Rayong'
  lu_ver          INTEGER      NOT NULL,          -- LULC map version (Buddhist-Era year)
  est_year_ver    INTEGER      NOT NULL,          -- establishment-year map version
  def_spacing     VARCHAR(20)  NOT NULL,          -- default tree spacing system, e.g. '2.5x8'
  def_clone       VARCHAR(50)  NOT NULL,          -- default rubber clone, e.g. 'RRIM 600'
  def_growth      VARCHAR(50)  NOT NULL,          -- default growth model, e.g. 'weibull'
  def_allometry   VARCHAR(50)  NOT NULL           -- default allometry equation, e.g. 'hytonen_2018'
);

INSERT INTO tbl_region_config
  (p_code, p_name, lu_ver, est_year_ver, def_spacing, def_clone, def_growth, def_allometry)
VALUES
  ('RAY', 'Rayong', 2567, 2026, '2.5x8', 'RRIM 600', 'weibull', 'hytonen_2018');

COMMIT;
