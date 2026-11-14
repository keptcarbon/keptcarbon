-- ==========================================================================
-- Region config history — one row per saved change of a province's
-- tbl_region_config (full snapshot), with when and by whom it was saved.
-- tbl_region_config stays the single current row per province that the
-- backend and app read; is_current marks the snapshot it currently matches.
-- Written by POST /api/rnd/region-config in the same transaction as the
-- upsert; a save that changes nothing adds no row.
-- ==========================================================================

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

-- At most one current snapshot per province.
CREATE UNIQUE INDEX IF NOT EXISTS uq_region_config_history_current
  ON tbl_region_config_history (p_code) WHERE is_current;

CREATE INDEX IF NOT EXISTS idx_region_config_history_p_code
  ON tbl_region_config_history (p_code, saved_at DESC);

-- Backfill: the config each province has now becomes its first (current)
-- history row; who saved it before this log existed is unknown.
INSERT INTO tbl_region_config_history
  (p_code, p_name, lu_version, planting_year_version, planting_year_dist_version, default_spacing,
   default_clone, default_growth, default_allometry, biomass_profile_version, is_current)
SELECT rc.p_code, rc.p_name, rc.lu_version, rc.planting_year_version, rc.planting_year_dist_version, rc.default_spacing,
       rc.default_clone, rc.default_growth, rc.default_allometry, rc.biomass_profile_version, TRUE
FROM tbl_region_config rc
WHERE NOT EXISTS (SELECT 1 FROM tbl_region_config_history h WHERE h.p_code = rc.p_code);
