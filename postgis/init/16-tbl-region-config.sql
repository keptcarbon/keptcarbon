-- ==========================================================================
-- Region config lookup — per-province defaults and dataset versions.
-- Mirrors backend/app/core/constants.py REGION_CONFIG.
-- ==========================================================================

CREATE TABLE IF NOT EXISTS tbl_region_config (
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
  ('RAY', 'Rayong', 2567, 2026, '2.5x8', 'RRIM 600', 'weibull', 'hytonen_2018')
ON CONFLICT (p_code) DO NOTHING;
