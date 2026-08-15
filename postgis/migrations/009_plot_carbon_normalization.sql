-- ============================================================================
-- Migration 009 — normalized plot/carbon schema (projects, plots,
--                 plot_landuse_overlaps, plot_assessments, plot_carbon_yearly)
-- ============================================================================
-- Run against an EXISTING database (the postgis/init/*.sql scripts only run
-- when the Docker volume is created fresh):
--
--   docker compose exec -T postgis \
--     psql -U keptcarbon -d keptcarbon -v ON_ERROR_STOP=1 \
--     < postgis/migrations/009_plot_carbon_normalization.sql
--
-- Purely additive: creates five new tables. Does NOT touch carbon_projects
-- or any column the running application reads today, so no maintenance
-- window is required and no app code needs to change to deploy this.
--
-- carbon_projects today stores plots, land-use overlaps, and yearly carbon
-- results as four JSONB arrays (plantation_info, polygons_payload,
-- backend_responses, frontend_plots) merged by id on every save. This
-- migration stands up the normalized replacement alongside it:
--
--   projects                 -- header only (was: carbon_projects row)
--   plots                    -- one row per polygon (was: plantation_info[] x polygons_payload[])
--   plot_landuse_overlaps    -- one row per LU overlap (was: plantation_info[].lu_polygon[])
--   plot_assessments         -- one row per backend run, APPENDED not overwritten
--                                (was: backend_responses[], previously clobbered on save)
--   plot_carbon_yearly       -- one row per (assessment, year) (was: backend_responses[].carbon_profile[])
--
-- frontend_plots has no replacement table here — in the normalized schema
-- it becomes a view/query over the tables above instead of a fourth
-- hand-synced JSON copy. Not created by this migration.
--
-- Out of scope for this migration (separate follow-up steps):
--   * backfilling these tables from existing carbon_projects rows
--   * a matching postgis/init/*.sql script for fresh-volume installs
--   * cutting the application over and eventually dropping carbon_projects
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'projects'
  ) THEN
    RAISE EXCEPTION 'projects already exists -- migration 009 already applied, aborting.';
  END IF;
END $$;

CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================================
-- 1) projects — header (owner + name); was the carbon_projects row itself
-- ============================================================================
CREATE TABLE projects (
  id            SERIAL        PRIMARY KEY,

  -- Owner: logged-in user (user_uuid) or guest (guest_uuid) — exactly one.
  user_uuid     UUID          REFERENCES tbl_users(uuid),
  guest_uuid    VARCHAR(100),

  project_name  VARCHAR(255)  NOT NULL,

  status        VARCHAR(20)   NOT NULL DEFAULT 'active',
  deleted_at    TIMESTAMPTZ   DEFAULT NULL,

  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_projects_status CHECK (status IN ('active', 'deleted')),
  CONSTRAINT chk_projects_owner CHECK (num_nonnulls(user_uuid, guest_uuid) = 1)
);

CREATE INDEX idx_projects_user_uuid    ON projects (user_uuid);
CREATE INDEX idx_projects_guest_uuid   ON projects (guest_uuid);
CREATE INDEX idx_projects_project_name ON projects (project_name);
CREATE INDEX idx_projects_status       ON projects (status);

-- One active project per name per owner (members and guests tracked separately).
CREATE UNIQUE INDEX uq_projects_user_project_active
  ON projects (user_uuid, project_name)
  WHERE status = 'active' AND user_uuid IS NOT NULL;

CREATE UNIQUE INDEX uq_projects_guest_project_active
  ON projects (guest_uuid, project_name)
  WHERE status = 'active' AND guest_uuid IS NOT NULL;

CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 2) plots — one row per polygon; was plantation_info[] merged with
--    polygons_payload[] by polygon_id
-- ============================================================================
CREATE TABLE plots (
  id                    SERIAL        PRIMARY KEY,
  project_id            INTEGER       NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Client-generated stable id for a polygon within a project (was: polygon_id).
  polygon_id            VARCHAR(100)  NOT NULL,

  geometry              geometry(Geometry, 4326) NOT NULL,
  area_m2               DOUBLE PRECISION,
  province_code         VARCHAR(10),

  -- Per-polygon processing/classification result (was: plantation_info[].status).
  status                VARCHAR(20),
  status_code           VARCHAR(50),
  message               TEXT,

  -- Assessment request parameters (was: polygons_payload[] fields).
  year_of_planting      SMALLINT,
  rubber_clone          VARCHAR(50),
  tree_count            INTEGER,
  spacing_system        VARCHAR(50),
  project_type          VARCHAR(50),
  selected_lu_classes   TEXT[]        NOT NULL DEFAULT '{}',

  -- Soft delete: a plot can be removed from a project without deleting the
  -- project. No separate 'active'/'deleted' enum — deleted_at IS NULL means
  -- active, since `status` above already carries a different meaning here.
  deleted_at            TIMESTAMPTZ   DEFAULT NULL,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_plots_project_polygon ON plots (project_id, polygon_id);
CREATE INDEX idx_plots_project_id     ON plots (project_id);
CREATE INDEX idx_plots_geometry       ON plots USING GIST (geometry);
CREATE INDEX idx_plots_province_code  ON plots (province_code);

CREATE TRIGGER trg_plots_updated_at
  BEFORE UPDATE ON plots
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 3) plot_landuse_overlaps — one row per LU overlap polygon; was
--    plantation_info[].lu_polygon[]
-- ============================================================================
CREATE TABLE plot_landuse_overlaps (
  id                  SERIAL        PRIMARY KEY,
  plot_id             INTEGER       NOT NULL REFERENCES plots(id) ON DELETE CASCADE,

  lu_class            VARCHAR(50),
  lu_class_desc_th    VARCHAR(255),
  geometry            geometry(Geometry, 4326) NOT NULL,
  area_m2             DOUBLE PRECISION,
  area_percent        DOUBLE PRECISION,

  -- Recomputed wholesale from source LU polygons on each classification run,
  -- not edited in place -- no updated_at trigger needed.
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_plot_landuse_overlaps_plot_id  ON plot_landuse_overlaps (plot_id);
CREATE INDEX idx_plot_landuse_overlaps_geometry ON plot_landuse_overlaps USING GIST (geometry);
CREATE INDEX idx_plot_landuse_overlaps_lu_class ON plot_landuse_overlaps (lu_class);

-- ============================================================================
-- 4) plot_assessments — one row per backend /carbon/assess run, APPENDED
--    (was: backend_responses[], previously overwritten in place on save)
-- ============================================================================
CREATE TABLE plot_assessments (
  id                   SERIAL        PRIMARY KEY,
  plot_id              INTEGER       NOT NULL REFERENCES plots(id) ON DELETE CASCADE,

  status               VARCHAR(20),
  status_code          VARCHAR(50),
  message              TEXT,
  message_th           TEXT,

  ci                   DOUBLE PRECISION,
  assess_parameters    JSONB         NOT NULL DEFAULT '{}'::jsonb,
  model_version        VARCHAR(50),

  -- Exactly one current assessment per plot; older rows are kept as history.
  is_current           BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_plot_assessments_plot_id ON plot_assessments (plot_id);

CREATE UNIQUE INDEX uq_plot_assessments_current
  ON plot_assessments (plot_id)
  WHERE is_current;

-- ============================================================================
-- 5) plot_carbon_yearly — one row per (assessment, year); was
--    backend_responses[].carbon_profile[]
-- ============================================================================
CREATE TABLE plot_carbon_yearly (
  id                SERIAL        PRIMARY KEY,
  assessment_id     INTEGER       NOT NULL REFERENCES plot_assessments(id) ON DELETE CASCADE,

  year              SMALLINT      NOT NULL,
  year_at           SMALLINT,
  age               DOUBLE PRECISION,

  stock_value       DOUBLE PRECISION,
  stock_ci          DOUBLE PRECISION,
  stock_ci_lower    DOUBLE PRECISION,
  stock_ci_upper    DOUBLE PRECISION,

  gain_value        DOUBLE PRECISION,
  gain_ci           DOUBLE PRECISION,
  gain_ci_lower     DOUBLE PRECISION,
  gain_ci_upper     DOUBLE PRECISION
);

CREATE UNIQUE INDEX uq_plot_carbon_yearly_assessment_year
  ON plot_carbon_yearly (assessment_id, year);
CREATE INDEX idx_plot_carbon_yearly_assessment_id ON plot_carbon_yearly (assessment_id);

COMMIT;