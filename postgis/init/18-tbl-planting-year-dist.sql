-- ==========================================================================
-- Planting-year distribution — per-(province, district, subdistrict, year
-- bucket) area breakdown of the establishment-year raster, aggregated at
-- import time from geo_establishment_year for a given lu_year/plaining_year
-- version pair. Backs the "Establishment Year Distribution" category in the
-- R&D data-management import wizard (nextjs/app/(admin)/rnd/data-management).
--
-- One row per (p_code, tambon_idn, lu_year, plaining_year, year) combination.
-- year = 0 is the unclassified/no-data pixel bucket, not an actual planting
-- year.
-- ==========================================================================

CREATE TABLE IF NOT EXISTS tbl_planting_year_dist (
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

-- Index for lookup/duplicate-check by province + raster version
CREATE INDEX IF NOT EXISTS idx_planting_year_dist_lookup
  ON tbl_planting_year_dist (p_code, lu_year, plaining_year);
