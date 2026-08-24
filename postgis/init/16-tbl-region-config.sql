-- ==========================================================================
-- Region config lookup — per-province defaults and dataset versions.
-- Mirrors backend/app/core/constants.py REGION_CONFIG.
-- ==========================================================================

CREATE TABLE IF NOT EXISTS tbl_region_config (
  id              SERIAL       PRIMARY KEY,
  p_code          VARCHAR(10)  NOT NULL UNIQUE,  -- province code, e.g. 'RAY'
  p_name          VARCHAR(100) NOT NULL,          -- e.g. 'Rayong'
  lu_version          INTEGER      NOT NULL,          -- LULC map version (Buddhist-Era year)
  est_year_version    INTEGER      NOT NULL,          -- establishment-year map version
  default_spacing     VARCHAR(20)  NOT NULL,          -- default tree spacing system, e.g. '2.5x8'
  default_clone       VARCHAR(50)  NOT NULL,          -- default rubber clone, e.g. 'RRIM 600'
  default_growth      VARCHAR(50)  NOT NULL,          -- default growth model, e.g. 'weibull'
  default_allometry   VARCHAR(50)  NOT NULL           -- default allometry equation, e.g. 'hytonen_2018'
);

INSERT INTO tbl_region_config
  (p_code, p_name, lu_version, est_year_version, default_spacing, default_clone, default_growth, default_allometry)
VALUES
  ('RAY', 'Rayong', 2567, 2026, '2.5x8', 'RRIM 600', 'weibull', 'hytonen_2018')
ON CONFLICT (p_code) DO NOTHING;
