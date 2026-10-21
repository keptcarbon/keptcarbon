-- ============================================================================
-- 039 — schema changes that exist ONLY in postgis/init/*.sql on `dev`
--       (no numbered migration file), needed by the current dev code.
-- ============================================================================
--   A. geo_landuse -> tbl_landuse, geo_planting_year -> tbl_planting_year
--      (+ index renames)                                 commit 6b27627
--   B. tbl_region_config.planting_year_version DROP NOT NULL   commit 2c8aaa4
--   C. tbl_region_config.planting_year_dist_version column     commit 719b684
--   D. tbl_region_config_history table + backfill              commit 6b0f05e
--
-- Run AFTER 013 (which still targets geo_landuse) and BEFORE 033/035 if those
-- haven't been applied yet (they read tbl_landuse / tbl_planting_year).
-- Every step is guarded — safe to re-run.
--
--   docker exec -i keptcarbon-postgis \
--     psql -U postgres -d keptcarbon_dev -v ON_ERROR_STOP=1 < 039_init_only_gaps.sql
-- ============================================================================

BEGIN;

-- A. table renames ----------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.geo_landuse') IS NOT NULL AND to_regclass('public.tbl_landuse') IS NULL THEN
    ALTER TABLE public.geo_landuse RENAME TO tbl_landuse;
    RAISE NOTICE 'renamed geo_landuse -> tbl_landuse';
  END IF;
  IF to_regclass('public.geo_landuse_p_code_year_idx') IS NOT NULL THEN
    ALTER INDEX public.geo_landuse_p_code_year_idx RENAME TO tbl_landuse_p_code_year_idx;
  END IF;
  IF to_regclass('public.geo_landuse_geom_idx') IS NOT NULL THEN
    ALTER INDEX public.geo_landuse_geom_idx RENAME TO tbl_landuse_geom_idx;
  END IF;

  IF to_regclass('public.geo_planting_year') IS NOT NULL AND to_regclass('public.tbl_planting_year') IS NULL THEN
    ALTER TABLE public.geo_planting_year RENAME TO tbl_planting_year;
    RAISE NOTICE 'renamed geo_planting_year -> tbl_planting_year';
  END IF;
  IF to_regclass('public.geo_planting_year_p_code_year_idx') IS NOT NULL THEN
    ALTER INDEX public.geo_planting_year_p_code_year_idx RENAME TO tbl_planting_year_p_code_year_idx;
  END IF;
END $$;

-- B + C. tbl_region_config columns ------------------------------------------
ALTER TABLE tbl_region_config ALTER COLUMN planting_year_version DROP NOT NULL;
ALTER TABLE tbl_region_config ADD COLUMN IF NOT EXISTS planting_year_dist_version VARCHAR(20);

-- D. tbl_region_config_history (same as postgis/init/20-tbl-region-config-history.sql)
CREATE TABLE IF NOT EXISTS tbl_region_config_history (
  id                          SERIAL       PRIMARY KEY,
  p_code                      VARCHAR(10)  NOT NULL,
  p_name                      VARCHAR(100) NOT NULL,
  lu_version                  INTEGER      NOT NULL,
  planting_year_version       INTEGER,
  planting_year_dist_version  VARCHAR(20),
  default_spacing             VARCHAR(20)  NOT NULL,
  default_clone               VARCHAR(50)  NOT NULL,
  default_growth              VARCHAR(50)  NOT NULL,
  default_allometry           VARCHAR(50)  NOT NULL,
  biomass_profile_version     VARCHAR(50)  NOT NULL,
  is_current                  BOOLEAN      NOT NULL DEFAULT FALSE,
  saved_at                    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  saved_by                    INTEGER      REFERENCES tbl_users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_region_config_history_current
  ON tbl_region_config_history (p_code) WHERE is_current;
CREATE INDEX IF NOT EXISTS idx_region_config_history_p_code
  ON tbl_region_config_history (p_code, saved_at DESC);

INSERT INTO tbl_region_config_history
  (p_code, p_name, lu_version, planting_year_version, planting_year_dist_version, default_spacing,
   default_clone, default_growth, default_allometry, biomass_profile_version, is_current)
SELECT rc.p_code, rc.p_name, rc.lu_version, rc.planting_year_version, rc.planting_year_dist_version, rc.default_spacing,
       rc.default_clone, rc.default_growth, rc.default_allometry, rc.biomass_profile_version, TRUE
FROM tbl_region_config rc
WHERE NOT EXISTS (SELECT 1 FROM tbl_region_config_history h WHERE h.p_code = rc.p_code);

COMMIT;