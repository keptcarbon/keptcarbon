-- ============================================================================
-- Migration 019 — create tbl_planting_year_dist
-- ============================================================================
-- Run against an EXISTING database (the postgis/init/*.sql scripts only run
-- when the Docker volume is created fresh):
--
--   docker compose exec -T postgis \
--     psql -U keptcarbon -d keptcarbon -v ON_ERROR_STOP=1 \
--     < postgis/migrations/019_tbl_planting_year_dist.sql
--
-- Planting-year distribution — per-(province, district, subdistrict, year
-- bucket) area breakdown of the establishment-year raster. Backs the
-- "Establishment Year Distribution" category in the R&D data-management
-- import wizard. One row per (p_code, tambon_idn, lu_year, plaining_year,
-- year) combination; year = 0 is the unclassified/no-data pixel bucket.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'tbl_planting_year_dist'
  ) THEN
    RAISE EXCEPTION 'tbl_planting_year_dist already exists -- migration 019 already applied, aborting.';
  END IF;
END $$;

CREATE TABLE tbl_planting_year_dist (
  id                 SERIAL        PRIMARY KEY,

  -- Location (subdistrict-level breakdown within a province)
  p_code             VARCHAR(10)   NOT NULL,  -- province code, e.g. 'RAY'
  prov_code          VARCHAR(10)   NOT NULL,  -- e.g. '21'
  prov_name_th       VARCHAR(100)  NOT NULL,
  amphoe_idn         VARCHAR(10)   NOT NULL,  -- district code, e.g. '2103'
  amphoe_name_th     VARCHAR(100)  NOT NULL,
  tambon_idn         VARCHAR(10)   NOT NULL,  -- subdistrict code, e.g. '210311'
  tambon_name_th     VARCHAR(100)  NOT NULL,

  -- Source raster version this breakdown was computed from (mirrors
  -- tbl_region_config.lu_version / est_year_version)
  lu_year            INTEGER       NOT NULL,  -- LULC map version (Buddhist-Era year), e.g. 2567
  plaining_year      INTEGER       NOT NULL,  -- establishment-year map version, e.g. 2026

  -- Distribution row (one planting-year bucket's share of the subdistrict)
  year               INTEGER       NOT NULL,  -- planting year; 0 = unclassified/no-data
  pixel_count        INTEGER       NOT NULL,
  sqr_m              FLOAT         NOT NULL,  -- raw area (pixel_count x pixel resolution^2)
  percent            FLOAT         NOT NULL,  -- share of the subdistrict's classified area
  adj_sqr_m          FLOAT         NOT NULL,  -- adjustment delta in square meters (can be negative)
  sqr_m_adj          FLOAT         NOT NULL,  -- final adjusted area

  CONSTRAINT uq_planting_year_dist UNIQUE (p_code, tambon_idn, lu_year, plaining_year, year)
);

CREATE INDEX idx_planting_year_dist_lookup
  ON tbl_planting_year_dist (p_code, lu_year, plaining_year);

COMMIT;
