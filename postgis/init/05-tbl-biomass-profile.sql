-- ==========================================================================
-- Biomass lookup profiles — per-age AGB/BGB/biomass estimates (+95% CI)
-- used by CarbonService in place of the flat CSVs under
-- backend/app/data/lookup_tables/. One row per (p_code, clone, growth_model,
-- allometry, age) combination, mirroring REGION_CONFIG's
-- biomass_assessment_tables key in app/core/constants.py.
--
-- NOTE: source CSVs report Age in quarter-year steps (0.0, 0.25, 0.5, ...).
-- This table stores Age as INTEGER by design — fractional-age rows are
-- omitted at import time, not rounded/truncated.
-- ==========================================================================

CREATE TABLE IF NOT EXISTS tbl_biomass_profile (
  id                 SERIAL        PRIMARY KEY,

  -- Lookup dimensions (mirror REGION_CONFIG.biomass_assessment_tables key)
  p_code             VARCHAR(10)   NOT NULL,  -- province code, e.g. 'RAY'
  clone              VARCHAR(50)   NOT NULL,  -- e.g. 'RRIM 600', 'RRIT 251'
  growth_model       VARCHAR(50)   NOT NULL,  -- e.g. 'weibull', 'cubic_poly'
  allometry          VARCHAR(50)   NOT NULL,  -- e.g. 'hytonen_2018', 'chiarawipa_2012'

  -- Profile values (per source CSV row, whole-year ages only)
  age                INTEGER       NOT NULL,
  dbh_est            FLOAT,
  agb                FLOAT,
  bgb                FLOAT,
  biomass_est        FLOAT,
  ci                 FLOAT,
  biomass_ci_lower   FLOAT,
  biomass_ci_upper   FLOAT,

  created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_biomass_profile_key UNIQUE (p_code, clone, growth_model, allometry, age)
);

-- Index for lookup by region/clone/model/allometry (age range scans)
CREATE INDEX IF NOT EXISTS idx_biomass_profile_lookup
  ON tbl_biomass_profile (p_code, clone, growth_model, allometry);