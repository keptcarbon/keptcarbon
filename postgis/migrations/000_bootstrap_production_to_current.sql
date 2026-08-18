-- ============================================================================
-- Migration 000 — bootstrap an existing pre-refactor database (users,
-- carbon_projects, geo_country/region/province/district/subdistrict only —
-- no tbl_* tables) up to the current schema, in one shot.
-- ============================================================================
-- WHY THIS FILE EXISTS
--
-- postgis/migrations/001_uuid_name_refactor.sql .. 012_retire_carbon_projects.sql
-- assume every step in between was already applied. In practice several
-- schema changes were only ever added to postgis/init/*.sql (which auto-runs
-- on a brand-new empty Docker volume) and NEVER got a matching numbered
-- migration for an existing, already-populated database:
--
--   - users -> tbl_users rename + google_user_id/facebook_user_id columns
--     (commits 6b75eba, 6d08e34, 0b4325c — init-only, no migration)
--   - tbl_auth_logs table creation (commit 782d6cf — init-only, no migration)
--   - tbl_biomass_profile table creation, schema only (commit a28cab2 —
--     init-only; migration 008 only seeds data, assumes the table exists)
--
-- Running 001..012 back-to-back on a real existing database fails partway
-- (006 does `ALTER TABLE tbl_users ...`, which doesn't exist yet). This file
-- fills those 3 gaps at the right point in the sequence and inlines every
-- migration 001-012 (content verbatim, own per-step guards preserved) into
-- ONE transaction, so the whole bootstrap is atomic: either everything
-- applies, or nothing does.
--
-- Also note: postgis/init/12-geo-landuse.sql (used by both migration 004 and
-- 005 via `\i`) was regenerated in place after the 005 redesign, so it now
-- already produces the POST-005 schema (lu_year, integer lu_id_l1/l2/l3)
-- directly. Applying 004 then 005 back-to-back against a database that has
-- never had geo_landuse would make 005's own "already applied" guard fire
-- and abort the whole script. This file therefore applies that file ONCE
-- (guarded the way 004 originally was) instead of twice — see the geo_landuse
-- section below.
--
-- ----------------------------------------------------------------------------
-- HOW TO RUN
--
-- Must run against the postgis container itself (uses `\i /docker-entrypoint-
-- initdb.d/...` to pull in the large geo_thailand/geo_landuse/biomass data
-- files, same mechanism migrations 002/004/008 already use) — NOT a generic
-- psql client from elsewhere:
--
--   docker compose exec -T postgis \
--     psql -U postgres -d keptcarbon -v ON_ERROR_STOP=1 \
--     < postgis/migrations/000_bootstrap_production_to_current.sql
--
-- Prerequisites (do not skip — see 001_DEPLOY_RUNBOOK.md, same rules apply
-- to this whole bootstrap, not just migration 001):
--   1. Run 001_PRECHECK.sql first (read-only) and review its output —
--      especially `ambiguous_to_guest`, which must be 0.
--   2. Take a full backup:
--        docker compose exec -T postgis \
--          pg_dump -U postgres -d keptcarbon -Fc > backup_pre_000_$(date +%Y%m%d_%H%M).dump
--   3. Maintenance window: stop app traffic before running this, deploy the
--      matching (current) app code immediately after it commits, then reopen
--      traffic. The app code already expects tbl_users/tbl_projects/etc —
--      don't run old code against the new schema or vice versa.
--
-- AFTER this commits, one manual step remains that this file cannot do (it
-- needs the raster2pgsql CLI binary, not plain SQL):
--
--   docker compose exec -T postgis \
--     raster2pgsql -s 32647 -t 100x100 -a -I /rasters/establishment_year_rayong.tif \
--       public.geo_establishment_year \
--   | docker compose exec -T postgis psql -U postgres -d keptcarbon -v ON_ERROR_STOP=1
--
-- (requires the postgis service built from postgis/Dockerfile so
-- raster2pgsql is on PATH, and /rasters mounted per docker-compose.yml)
--
-- Rollback: this is one transaction — if anything errors, nothing commits
-- and the database is left exactly as it was. There is no down-migration
-- script (several steps drop columns/tables); if you need to back out after
-- a successful commit, restore from the pre-flight backup.
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- ----------------------------------------------------------------------------
-- 0) Sanity guard: confirm we're starting from the expected pre-refactor
--    baseline before touching anything.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'users'
  ) THEN
    RAISE EXCEPTION 'Table "users" not found -- this script expects the pre-migration baseline (users, carbon_projects, no tbl_* tables). Check \dt and diff against dev by hand before running this; do not just re-run it.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'tbl_users'
  ) THEN
    RAISE EXCEPTION 'Table "tbl_users" already exists -- this bootstrap (or part of it) appears to already be applied. Aborting to avoid double-applying.';
  END IF;
END $$;

-- ============================================================================
-- STEP 1 — 001_uuid_name_refactor.sql
--   users: + uuid/first_name/last_name/display_name, drop fullname
--   carbon_projects: + user_uuid/guest_key, project_id -> project_name,
--                     JSON -> JSONB, dedupe active rows, updated_at triggers
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE users
  ADD COLUMN uuid         UUID         NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN first_name   VARCHAR(100) NOT NULL DEFAULT '',
  ADD COLUMN last_name    VARCHAR(100) NOT NULL DEFAULT '',
  ADD COLUMN display_name VARCHAR(255) NOT NULL DEFAULT '';

ALTER TABLE users ADD CONSTRAINT uq_users_uuid UNIQUE (uuid);

UPDATE users SET
  display_name = btrim(COALESCE(fullname, '')),
  first_name   = split_part(btrim(COALESCE(fullname, '')), ' ', 1),
  last_name    = CASE
                   WHEN btrim(COALESCE(fullname, '')) LIKE '% %'
                     THEN regexp_replace(btrim(fullname), '^\S+\s+', '')
                   ELSE ''
                 END;

ALTER TABLE carbon_projects
  ADD COLUMN user_uuid UUID REFERENCES users(uuid),
  ADD COLUMN guest_key VARCHAR(100);

WITH candidate AS (
  SELECT cp.id                              AS cp_id,
         u.uuid                             AS user_uuid,
         COUNT(*) OVER (PARTITION BY cp.id) AS match_count
  FROM carbon_projects cp
  JOIN users u
    ON cp.user_id IN (u.fullname, u.username, u.email)
)
UPDATE carbon_projects cp
SET user_uuid = c.user_uuid
FROM candidate c
WHERE cp.id = c.cp_id
  AND c.match_count = 1;

UPDATE carbon_projects
SET guest_key = user_id
WHERE user_uuid IS NULL;

ALTER TABLE carbon_projects
  ADD CONSTRAINT chk_carbon_projects_owner
  CHECK (num_nonnulls(user_uuid, guest_key) = 1);

ALTER TABLE carbon_projects RENAME COLUMN project_id TO project_name;
ALTER INDEX idx_carbon_projects_project_id
  RENAME TO idx_carbon_projects_project_name;

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY COALESCE(user_uuid::text, guest_key), project_name
           ORDER BY updated_at DESC, id DESC
         ) AS rn
  FROM carbon_projects
  WHERE status = 'active'
)
UPDATE carbon_projects cp
SET status = 'deleted', deleted_at = NOW(), updated_at = NOW()
FROM ranked r
WHERE cp.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX uq_carbon_projects_user_project_active
  ON carbon_projects (user_uuid, project_name)
  WHERE status = 'active' AND user_uuid IS NOT NULL;

CREATE UNIQUE INDEX uq_carbon_projects_guest_project_active
  ON carbon_projects (guest_key, project_name)
  WHERE status = 'active' AND guest_key IS NOT NULL;

DROP INDEX IF EXISTS idx_carbon_projects_user_id;
DROP INDEX IF EXISTS idx_carbon_projects_active;

ALTER TABLE carbon_projects DROP COLUMN user_id;

CREATE INDEX idx_carbon_projects_user_uuid ON carbon_projects (user_uuid);
CREATE INDEX idx_carbon_projects_guest_key ON carbon_projects (guest_key);

ALTER TABLE carbon_projects
  ALTER COLUMN plantation_info   DROP DEFAULT,
  ALTER COLUMN polygons_payload  DROP DEFAULT,
  ALTER COLUMN backend_responses DROP DEFAULT,
  ALTER COLUMN frontend_plots    DROP DEFAULT;

ALTER TABLE carbon_projects
  ALTER COLUMN plantation_info   TYPE JSONB USING plantation_info::jsonb,
  ALTER COLUMN polygons_payload  TYPE JSONB USING polygons_payload::jsonb,
  ALTER COLUMN backend_responses TYPE JSONB USING backend_responses::jsonb,
  ALTER COLUMN frontend_plots    TYPE JSONB USING frontend_plots::jsonb;

ALTER TABLE carbon_projects
  ALTER COLUMN plantation_info   SET DEFAULT '{}'::jsonb,
  ALTER COLUMN polygons_payload  SET DEFAULT '[]'::jsonb,
  ALTER COLUMN backend_responses SET DEFAULT '[]'::jsonb,
  ALTER COLUMN frontend_plots    SET DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_carbon_projects_updated_at ON carbon_projects;
CREATE TRIGGER trg_carbon_projects_updated_at
  BEFORE UPDATE ON carbon_projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE users DROP COLUMN fullname;

DO $$
DECLARE
  n_users     BIGINT;
  n_linked    BIGINT;
  n_guest     BIGINT;
BEGIN
  SELECT COUNT(*) INTO n_users  FROM users;
  SELECT COUNT(*) INTO n_linked FROM carbon_projects WHERE user_uuid IS NOT NULL;
  SELECT COUNT(*) INTO n_guest  FROM carbon_projects WHERE guest_key IS NOT NULL;
  RAISE NOTICE '[step 1/14] users migrated: %, projects linked to accounts: %, projects kept as guest: %',
    n_users, n_linked, n_guest;
END $$;

-- ============================================================================
-- STEP 2 (GAP A, untracked) — users -> tbl_users rename + OAuth columns
--   Only ever applied to postgis/init/*.sql (fresh installs). Production's
--   original "users" table has had line_user_id since its very first schema
--   (b564be7) but never google_user_id/facebook_user_id, added later
--   (commits 6b75eba, 6d08e34) to the init script only.
-- ============================================================================

ALTER TABLE users RENAME TO tbl_users;

ALTER TABLE tbl_users
  ADD COLUMN IF NOT EXISTS google_user_id   VARCHAR(100) UNIQUE,
  ADD COLUMN IF NOT EXISTS facebook_user_id VARCHAR(100) UNIQUE;

CREATE INDEX IF NOT EXISTS idx_users_google_uid   ON tbl_users (google_user_id);
CREATE INDEX IF NOT EXISTS idx_users_facebook_uid ON tbl_users (facebook_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_lower ON tbl_users (LOWER(email));

DO $$
BEGIN
  RAISE NOTICE '[step 2/14] users renamed to tbl_users, google_user_id/facebook_user_id columns added';
END $$;

-- ============================================================================
-- STEP 3 — 002_geo_thailand.sql
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'geo_thailand'
  ) THEN
    RAISE EXCEPTION 'geo_thailand already exists -- migration 002 already applied, aborting.';
  END IF;
END $$;

\i /docker-entrypoint-initdb.d/06-geo-thailand.sql

DO $$
DECLARE
  n_provinces BIGINT;
BEGIN
  SELECT COUNT(*) INTO n_provinces FROM geo_thailand;
  RAISE NOTICE '[step 3/14] geo_thailand seeded: % provinces', n_provinces;
END $$;

-- ============================================================================
-- STEP 4 — 003_geo_district_subdistrict_gist.sql
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'geo_district_geom_idx'
  ) THEN
    RAISE EXCEPTION 'geo_district_geom_idx already exists -- migration 003 already applied, aborting.';
  END IF;
END $$;

CREATE INDEX geo_district_geom_idx ON public.geo_district USING gist (geom);
CREATE INDEX geo_subdistrict_geom_idx ON public.geo_subdistrict USING gist (geom);

DO $$
DECLARE
  n_district    BIGINT;
  n_subdistrict BIGINT;
BEGIN
  SELECT COUNT(*) INTO n_district    FROM geo_district;
  SELECT COUNT(*) INTO n_subdistrict FROM geo_subdistrict;
  RAISE NOTICE '[step 4/14] GiST indexes created: geo_district (% rows), geo_subdistrict (% rows)',
    n_district, n_subdistrict;
END $$;

-- ============================================================================
-- STEP 5 — 004_geo_landuse.sql + 005_geo_landuse_redesign.sql, COLLAPSED
--   postgis/init/12-geo-landuse.sql already reflects the post-005 schema
--   (lu_year, integer lu_id_l1/l2/l3) -- applying 004 then 005 back-to-back
--   here would make 005's own guard fire "already applied" and abort this
--   whole transaction. There is no old-design table to redesign away from on
--   a database that has never had geo_landuse, so this applies it once.
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'geo_landuse'
  ) THEN
    RAISE EXCEPTION 'geo_landuse already exists -- migrations 004/005 already applied, aborting.';
  END IF;
END $$;

\i /docker-entrypoint-initdb.d/12-geo-landuse.sql

DO $$
DECLARE
  n_features BIGINT;
BEGIN
  SELECT COUNT(*) INTO n_features FROM geo_landuse;
  RAISE NOTICE '[step 5/14] geo_landuse seeded (post-005 schema): % land-use features', n_features;
END $$;

-- ============================================================================
-- STEP 6 — 006_users_reset_token.sql
-- ============================================================================

ALTER TABLE tbl_users
  ADD COLUMN IF NOT EXISTS reset_token         TEXT,
  ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tbl_users_reset_token
  ON tbl_users (reset_token) WHERE reset_token IS NOT NULL;

DO $$
BEGIN
  RAISE NOTICE '[step 6/14] tbl_users.reset_token / reset_token_expires columns added';
END $$;

-- ============================================================================
-- STEP 7 (GAP B, untracked) — tbl_auth_logs table creation
--   Only ever applied to postgis/init/04-tbl-auth-logs.sql (fresh installs,
--   commit 782d6cf). No numbered migration creates it for an existing DB.
-- ============================================================================

CREATE TABLE IF NOT EXISTS tbl_auth_logs (
  id            BIGSERIAL PRIMARY KEY,
  uuid          UUID REFERENCES tbl_users(uuid) ON DELETE SET NULL,
  email         VARCHAR(255) NOT NULL,
  event_type    VARCHAR(20)  NOT NULL,
  provider      VARCHAR(20)  NOT NULL,
  ip_address    VARCHAR(45),
  user_agent    TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_logs_uuid       ON tbl_auth_logs (uuid);
CREATE INDEX IF NOT EXISTS idx_auth_logs_created_at ON tbl_auth_logs (created_at DESC);

DO $$
BEGIN
  RAISE NOTICE '[step 7/14] tbl_auth_logs created';
END $$;

-- ============================================================================
-- STEP 8 — 007_geo_establishment_year.sql (schema only — raster load is a
--   separate manual step documented in the file header above; it cannot be
--   embedded in plain SQL)
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'geo_establishment_year'
  ) THEN
    RAISE EXCEPTION 'geo_establishment_year already exists -- migration 007 already applied, aborting.';
  END IF;
END $$;

CREATE TABLE public.geo_establishment_year (
    rid   serial PRIMARY KEY,
    p_code text NOT NULL DEFAULT 'RAY',
    year  integer NOT NULL DEFAULT 2026,
    rast  raster
);

CREATE INDEX geo_establishment_year_p_code_year_idx
    ON public.geo_establishment_year (p_code, year);

DO $$
BEGIN
  RAISE NOTICE '[step 8/14] geo_establishment_year table created (EMPTY — raster2pgsql load still required, see file header)';
END $$;

-- ============================================================================
-- STEP 9 (GAP C, untracked) — tbl_biomass_profile table creation
--   Only ever applied to postgis/init/05-tbl-biomass-profile.sql (fresh
--   installs, commit a28cab2). Migration 008 only seeds data and assumes
--   this table already exists.
-- ============================================================================

CREATE TABLE IF NOT EXISTS tbl_biomass_profile (
  id                 SERIAL        PRIMARY KEY,
  p_code             VARCHAR(10)   NOT NULL,
  clone              VARCHAR(50)   NOT NULL,
  growth_model       VARCHAR(50)   NOT NULL,
  allometry          VARCHAR(50)   NOT NULL,
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

CREATE INDEX IF NOT EXISTS idx_biomass_profile_lookup
  ON tbl_biomass_profile (p_code, clone, growth_model, allometry);

DO $$
BEGIN
  RAISE NOTICE '[step 9/14] tbl_biomass_profile created (empty)';
END $$;

-- ============================================================================
-- STEP 10 — 008_biomass_profile_data.sql
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM tbl_biomass_profile LIMIT 1) THEN
    RAISE EXCEPTION 'tbl_biomass_profile already has rows -- migration 008 already applied, aborting.';
  END IF;
END $$;

\i /docker-entrypoint-initdb.d/14-biomass-profile-data.sql

DO $$
DECLARE
  n_rows BIGINT;
BEGIN
  SELECT COUNT(*) INTO n_rows FROM tbl_biomass_profile;
  RAISE NOTICE '[step 10/14] tbl_biomass_profile seeded: % rows', n_rows;
END $$;

-- ============================================================================
-- STEP 11 — 009_plot_carbon_normalization.sql
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'tbl_projects'
  ) THEN
    RAISE EXCEPTION 'tbl_projects already exists -- migration 009 already applied, aborting.';
  END IF;
END $$;

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE tbl_projects (
  id            SERIAL        PRIMARY KEY,
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

CREATE INDEX idx_projects_user_uuid    ON tbl_projects (user_uuid);
CREATE INDEX idx_projects_guest_uuid   ON tbl_projects (guest_uuid);
CREATE INDEX idx_projects_project_name ON tbl_projects (project_name);
CREATE INDEX idx_projects_status       ON tbl_projects (status);

CREATE UNIQUE INDEX uq_projects_user_project_active
  ON tbl_projects (user_uuid, project_name)
  WHERE status = 'active' AND user_uuid IS NOT NULL;

CREATE UNIQUE INDEX uq_projects_guest_project_active
  ON tbl_projects (guest_uuid, project_name)
  WHERE status = 'active' AND guest_uuid IS NOT NULL;

CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON tbl_projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE tbl_plots (
  id                    SERIAL        PRIMARY KEY,
  project_id            INTEGER       NOT NULL REFERENCES tbl_projects(id) ON DELETE CASCADE,
  polygon_id            VARCHAR(100)  NOT NULL,
  geometry              geometry(Geometry, 4326) NOT NULL,
  area_m2               DOUBLE PRECISION,
  province_code         VARCHAR(10),
  status                VARCHAR(20),
  status_code           VARCHAR(50),
  message               TEXT,
  year_of_planting      SMALLINT,
  rubber_clone          VARCHAR(50),
  tree_count            INTEGER,
  spacing_system        VARCHAR(50),
  project_type          VARCHAR(50),
  selected_lu_classes   TEXT[]        NOT NULL DEFAULT '{}',
  deleted_at            TIMESTAMPTZ   DEFAULT NULL,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_plots_project_polygon ON tbl_plots (project_id, polygon_id);
CREATE INDEX idx_plots_project_id     ON tbl_plots (project_id);
CREATE INDEX idx_plots_geometry       ON tbl_plots USING GIST (geometry);
CREATE INDEX idx_plots_province_code  ON tbl_plots (province_code);

CREATE TRIGGER trg_plots_updated_at
  BEFORE UPDATE ON tbl_plots
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE tbl_plot_landuse_overlaps (
  id                  SERIAL        PRIMARY KEY,
  plot_id             INTEGER       NOT NULL REFERENCES tbl_plots(id) ON DELETE CASCADE,
  lu_class            VARCHAR(50),
  lu_class_desc_th    VARCHAR(255),
  geometry            geometry(Geometry, 4326) NOT NULL,
  area_m2             DOUBLE PRECISION,
  area_percent        DOUBLE PRECISION,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_plot_landuse_overlaps_plot_id  ON tbl_plot_landuse_overlaps (plot_id);
CREATE INDEX idx_plot_landuse_overlaps_geometry ON tbl_plot_landuse_overlaps USING GIST (geometry);
CREATE INDEX idx_plot_landuse_overlaps_lu_class ON tbl_plot_landuse_overlaps (lu_class);

CREATE TABLE tbl_plot_assessments (
  id                   SERIAL        PRIMARY KEY,
  plot_id              INTEGER       NOT NULL REFERENCES tbl_plots(id) ON DELETE CASCADE,
  status               VARCHAR(20),
  status_code          VARCHAR(50),
  message              TEXT,
  message_th           TEXT,
  ci                   DOUBLE PRECISION,
  assess_parameters    JSONB         NOT NULL DEFAULT '{}'::jsonb,
  model_version        VARCHAR(50),
  is_current           BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_plot_assessments_plot_id ON tbl_plot_assessments (plot_id);

CREATE UNIQUE INDEX uq_plot_assessments_current
  ON tbl_plot_assessments (plot_id)
  WHERE is_current;

CREATE TABLE tbl_plot_carbon_yearly (
  id                SERIAL        PRIMARY KEY,
  assessment_id     INTEGER       NOT NULL REFERENCES tbl_plot_assessments(id) ON DELETE CASCADE,
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
  ON tbl_plot_carbon_yearly (assessment_id, year);
CREATE INDEX idx_plot_carbon_yearly_assessment_id ON tbl_plot_carbon_yearly (assessment_id);

DO $$
BEGIN
  RAISE NOTICE '[step 11/14] tbl_projects/tbl_plots/tbl_plot_landuse_overlaps/tbl_plot_assessments/tbl_plot_carbon_yearly created';
END $$;

-- ============================================================================
-- STEP 12 — 010_backfill_plot_carbon_data.sql
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM tbl_plots LIMIT 1) THEN
    RAISE EXCEPTION 'tbl_plots already has rows -- migration 010 already applied (or tbl_plots is not empty), aborting.';
  END IF;
END $$;

INSERT INTO tbl_projects (id, user_uuid, guest_uuid, project_name, status, deleted_at, created_at, updated_at)
SELECT id, user_uuid, guest_key, project_name, status, deleted_at, created_at, updated_at
FROM carbon_projects
ON CONFLICT (id) DO NOTHING;

SELECT setval(pg_get_serial_sequence('tbl_projects', 'id'), COALESCE((SELECT MAX(id) FROM tbl_projects), 1), true);

INSERT INTO tbl_plots (
  project_id, polygon_id, geometry, area_m2, province_code,
  status, status_code, message,
  year_of_planting, rubber_clone, tree_count, spacing_system, project_type,
  selected_lu_classes, created_at, updated_at
)
SELECT
  cp.id,
  fp.value->>'id',
  ST_SetSRID(ST_GeomFromGeoJSON(pinfo.value->>'geometry'), 4326),
  NULLIF(pinfo.value->>'area_m2', '')::double precision,
  pinfo.value->>'province_code',
  pinfo.value->'status'->>'status',
  pinfo.value->'status'->>'status_code',
  pinfo.value->'status'->>'message',
  NULLIF(payload.value->>'year_of_planting', '')::double precision::smallint,
  payload.value->>'rubber_clone',
  NULLIF(payload.value->>'tree_count', '')::double precision::integer,
  payload.value->>'spacing_system',
  payload.value->>'project_type',
  ARRAY(SELECT jsonb_array_elements_text(COALESCE(payload.value->'selected_lu_classes', '[]'::jsonb))),
  cp.created_at,
  cp.updated_at
FROM carbon_projects cp
CROSS JOIN LATERAL jsonb_array_elements(
  CASE jsonb_typeof(cp.frontend_plots) WHEN 'array' THEN cp.frontend_plots ELSE '[]'::jsonb END
) WITH ORDINALITY AS fp(value, ord)
LEFT JOIN LATERAL jsonb_array_elements(
  CASE jsonb_typeof(cp.plantation_info) WHEN 'array' THEN cp.plantation_info ELSE '[]'::jsonb END
) WITH ORDINALITY AS pinfo(value, ord) ON pinfo.ord = fp.ord
LEFT JOIN LATERAL jsonb_array_elements(
  CASE jsonb_typeof(cp.polygons_payload) WHEN 'array' THEN cp.polygons_payload ELSE '[]'::jsonb END
) AS payload(value) ON payload.value->>'id' = fp.value->>'id'
WHERE fp.value->>'id' IS NOT NULL
  AND pinfo.value->'geometry' IS NOT NULL
  AND pinfo.value->'geometry' != 'null'::jsonb
ON CONFLICT (project_id, polygon_id) DO NOTHING;

INSERT INTO tbl_plot_landuse_overlaps (plot_id, lu_class, lu_class_desc_th, geometry, area_m2, area_percent, created_at)
SELECT
  pl.id,
  lu.value->>'lu_class',
  lu.value->>'lu_class_desc_th',
  ST_SetSRID(ST_GeomFromGeoJSON(lu.value->>'geometry'), 4326),
  NULLIF(lu.value->>'area_m2', '')::double precision,
  NULLIF(lu.value->>'area_percent', '')::double precision,
  cp.created_at
FROM carbon_projects cp
CROSS JOIN LATERAL jsonb_array_elements(
  CASE jsonb_typeof(cp.frontend_plots) WHEN 'array' THEN cp.frontend_plots ELSE '[]'::jsonb END
) WITH ORDINALITY AS fp(value, ord)
JOIN LATERAL jsonb_array_elements(
  CASE jsonb_typeof(cp.plantation_info) WHEN 'array' THEN cp.plantation_info ELSE '[]'::jsonb END
) WITH ORDINALITY AS pinfo(value, ord) ON pinfo.ord = fp.ord
CROSS JOIN LATERAL jsonb_array_elements(
  CASE jsonb_typeof(pinfo.value->'lu_polygon') WHEN 'array' THEN pinfo.value->'lu_polygon' ELSE '[]'::jsonb END
) AS lu(value)
JOIN tbl_plots pl
  ON pl.project_id = cp.id AND pl.polygon_id = fp.value->>'id'
WHERE lu.value->'geometry' IS NOT NULL
  AND lu.value->'geometry' != 'null'::jsonb;

INSERT INTO tbl_plot_assessments (plot_id, status, status_code, message, message_th, ci, assess_parameters, model_version, is_current, created_at)
SELECT
  pl.id,
  br.value->'status'->>'status',
  br.value->'status'->>'status_code',
  br.value->'status'->>'message',
  br.value->'status'->>'message_th',
  NULLIF(br.value->>'ci', '')::double precision,
  COALESCE(br.value->'assess_parameters', '{}'::jsonb),
  NULL,
  TRUE,
  cp.updated_at
FROM carbon_projects cp
CROSS JOIN LATERAL jsonb_array_elements(
  CASE jsonb_typeof(cp.backend_responses) WHEN 'array' THEN cp.backend_responses ELSE '[]'::jsonb END
) AS br(value)
JOIN tbl_plots pl
  ON pl.project_id = cp.id AND pl.polygon_id = br.value->>'polygon_id';

INSERT INTO tbl_plot_carbon_yearly (
  assessment_id, year, year_at, age,
  stock_value, stock_ci, stock_ci_lower, stock_ci_upper,
  gain_value, gain_ci, gain_ci_lower, gain_ci_upper
)
SELECT
  pa.id,
  NULLIF(yr.value->>'year', '')::double precision::smallint,
  NULLIF(yr.value->>'year_at', '')::double precision::smallint,
  NULLIF(yr.value->>'age', '')::double precision,
  NULLIF(yr.value->'stocks'->>'value', '')::double precision,
  NULLIF(yr.value->'stocks'->>'ci', '')::double precision,
  NULLIF(yr.value->'stocks'->>'ci_lower', '')::double precision,
  NULLIF(yr.value->'stocks'->>'ci_upper', '')::double precision,
  NULLIF(yr.value->'gain'->>'value', '')::double precision,
  NULLIF(yr.value->'gain'->>'ci', '')::double precision,
  NULLIF(yr.value->'gain'->>'ci_lower', '')::double precision,
  NULLIF(yr.value->'gain'->>'ci_upper', '')::double precision
FROM carbon_projects cp
CROSS JOIN LATERAL jsonb_array_elements(
  CASE jsonb_typeof(cp.backend_responses) WHEN 'array' THEN cp.backend_responses ELSE '[]'::jsonb END
) AS br(value)
JOIN tbl_plots pl
  ON pl.project_id = cp.id AND pl.polygon_id = br.value->>'polygon_id'
JOIN tbl_plot_assessments pa
  ON pa.plot_id = pl.id AND pa.is_current
CROSS JOIN LATERAL jsonb_array_elements(
  CASE jsonb_typeof(br.value->'carbon_profile') WHEN 'array' THEN br.value->'carbon_profile' ELSE '[]'::jsonb END
) AS yr(value)
ON CONFLICT (assessment_id, year) DO NOTHING;

DO $$
DECLARE
  n_source_projects  BIGINT;
  n_projects         BIGINT;
  n_source_plots     BIGINT;
  n_plots            BIGINT;
  n_overlaps         BIGINT;
  n_assessments      BIGINT;
  n_yearly           BIGINT;
  mismatch           RECORD;
  n_mismatched       INT := 0;
BEGIN
  SELECT COUNT(*) INTO n_source_projects FROM carbon_projects;
  SELECT COUNT(*) INTO n_projects        FROM tbl_projects;
  SELECT COUNT(*) INTO n_source_plots
    FROM carbon_projects cp,
         LATERAL jsonb_array_elements(
           CASE jsonb_typeof(cp.frontend_plots) WHEN 'array' THEN cp.frontend_plots ELSE '[]'::jsonb END
         ) AS fp(value);
  SELECT COUNT(*) INTO n_plots       FROM tbl_plots;
  SELECT COUNT(*) INTO n_overlaps    FROM tbl_plot_landuse_overlaps;
  SELECT COUNT(*) INTO n_assessments FROM tbl_plot_assessments;
  SELECT COUNT(*) INTO n_yearly      FROM tbl_plot_carbon_yearly;

  RAISE NOTICE '[step 12/14] carbon_projects: % rows -> tbl_projects: % rows', n_source_projects, n_projects;
  RAISE NOTICE '[step 12/14] frontend_plots[] entries: % -> tbl_plots: % rows (% skipped: missing id or geometry)',
    n_source_plots, n_plots, n_source_plots - n_plots;
  RAISE NOTICE '[step 12/14] tbl_plot_landuse_overlaps: % rows, tbl_plot_assessments: % rows, tbl_plot_carbon_yearly: % rows',
    n_overlaps, n_assessments, n_yearly;

  FOR mismatch IN
    SELECT
      cp.id,
      jsonb_array_length(CASE jsonb_typeof(cp.frontend_plots) WHEN 'array' THEN cp.frontend_plots ELSE '[]'::jsonb END) AS n_frontend,
      jsonb_array_length(CASE jsonb_typeof(cp.plantation_info) WHEN 'array' THEN cp.plantation_info ELSE '[]'::jsonb END) AS n_plantation
    FROM carbon_projects cp
  LOOP
    IF mismatch.n_frontend != mismatch.n_plantation THEN
      n_mismatched := n_mismatched + 1;
      RAISE WARNING 'carbon_projects.id=% has mismatched array lengths -- frontend_plots: %, plantation_info: % -- positional join may be wrong for this project''s geometry/status/tbl_plot_landuse_overlaps, review by hand',
        mismatch.id, mismatch.n_frontend, mismatch.n_plantation;
    END IF;
  END LOOP;

  IF n_mismatched = 0 THEN
    RAISE NOTICE '[step 12/14] positional join check: all % project(s) have matching frontend_plots/plantation_info array lengths', n_source_projects;
  ELSE
    RAISE NOTICE '[step 12/14] positional join check: % of % project(s) flagged above -- review before trusting their tbl_plots.geometry/status and tbl_plot_landuse_overlaps rows', n_mismatched, n_source_projects;
  END IF;
END $$;

-- ============================================================================
-- STEP 13 — 011_add_plot_owner_name.sql
-- ============================================================================

ALTER TABLE tbl_plots ADD COLUMN owner_name VARCHAR(255);

UPDATE tbl_plots pl
SET owner_name = fp.value->>'ownerName'
FROM carbon_projects cp
CROSS JOIN LATERAL jsonb_array_elements(
  CASE jsonb_typeof(cp.frontend_plots) WHEN 'array' THEN cp.frontend_plots ELSE '[]'::jsonb END
) AS fp(value)
WHERE pl.project_id = cp.id
  AND pl.polygon_id = fp.value->>'id'
  AND fp.value->>'ownerName' IS NOT NULL;

DO $$
DECLARE
  n_plots  BIGINT;
  n_owner  BIGINT;
BEGIN
  SELECT COUNT(*) INTO n_plots FROM tbl_plots;
  SELECT COUNT(*) INTO n_owner FROM tbl_plots WHERE owner_name IS NOT NULL;
  RAISE NOTICE '[step 13/14] tbl_plots: % rows, % with owner_name backfilled', n_plots, n_owner;
END $$;

-- ============================================================================
-- STEP 14 — 012_retire_carbon_projects.sql
--   Renames rather than drops -- costs nothing, keeps data recoverable, and
--   any surviving code path still querying carbon_projects by name now fails
--   loudly instead of silently reading stale data.
-- ============================================================================

ALTER TABLE carbon_projects RENAME TO carbon_projects_deprecated_20260816;

SELECT setval(pg_get_serial_sequence('tbl_projects', 'id'), COALESCE((SELECT MAX(id) FROM tbl_projects), 1), true);

DO $$
BEGIN
  RAISE NOTICE '[step 14/14] carbon_projects renamed to carbon_projects_deprecated_20260816, tbl_projects_id_seq caught up';
END $$;

-- ============================================================================
-- Done — final summary
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '=============================================================';
  RAISE NOTICE 'Bootstrap complete. Schema now matches dev (001-012 + gaps A/B/C).';
  RAISE NOTICE 'REMINDER: geo_establishment_year is EMPTY -- run the raster2pgsql';
  RAISE NOTICE 'load step from this file''s header comment before deploying app';
  RAISE NOTICE 'code that depends on plantation age-map lookups.';
  RAISE NOTICE '=============================================================';
END $$;

COMMIT;
