-- ==========================================================================
-- Carbon Projects — บันทึกแปลงยางพาราและผลคาร์บอนของผู้ใช้แต่ละคน
-- ==========================================================================

CREATE TABLE IF NOT EXISTS carbon_projects (
  id              VARCHAR(50)   PRIMARY KEY,
  user_id         INTEGER       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            VARCHAR(255)  NOT NULL DEFAULT '',
  area_rai        NUMERIC(12,4) NOT NULL DEFAULT 0,
  carbon_total    NUMERIC(16,4) NOT NULL DEFAULT 0,
  rubber_age      INTEGER       NOT NULL DEFAULT 0,
  plant_year_be   INTEGER,
  trees           INTEGER,
  variety         VARCHAR(100),
  spacing         VARCHAR(50),
  owner_name      VARCHAR(255),
  province        VARCHAR(100),
  plant_status    VARCHAR(20),
  processed       BOOLEAN       NOT NULL DEFAULT FALSE,
  lu_checked      JSONB,
  forecast        JSONB,
  carbon_profile  JSONB,
  backend_data    JSONB,
  geom            geometry(Geometry, 4326),
  boundary_geom   geometry(Geometry, 4326),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_carbon_projects_user_id ON carbon_projects (user_id);
CREATE INDEX IF NOT EXISTS idx_carbon_projects_name    ON carbon_projects (name);
CREATE INDEX IF NOT EXISTS idx_carbon_projects_geom    ON carbon_projects USING GIST (geom)
  WHERE geom IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_carbon_projects_boundary ON carbon_projects USING GIST (boundary_geom)
  WHERE boundary_geom IS NOT NULL;
