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
  lu_version          INTEGER      NOT NULL,          -- LULC map version (Buddhist-Era year)
  planting_year_version    INTEGER      NOT NULL,     -- planting-year map version
  default_spacing     VARCHAR(20)  NOT NULL,          -- default tree spacing system, e.g. '2.5x8'
  default_clone       VARCHAR(50)  NOT NULL,          -- default rubber clone, e.g. 'RRIM 600'
  default_growth      VARCHAR(50)  NOT NULL,          -- default growth model, e.g. 'weibull'
  default_allometry   VARCHAR(50)  NOT NULL           -- default allometry equation, e.g. 'hytonen_2018'
);

INSERT INTO tbl_region_config
  (p_code, p_name, lu_version, planting_year_version, default_spacing, default_clone, default_growth, default_allometry)
VALUES
  ('RAY', 'Rayong', 2567, 2026, '2.5x8', 'RRIM 600', 'weibull', 'hytonen_2018');

COMMIT;
