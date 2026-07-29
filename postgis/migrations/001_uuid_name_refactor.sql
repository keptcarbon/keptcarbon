-- ============================================================================
-- Migration 001 — UUID relationships, first/last name split, JSONB,
--                 project_name rename, updated_at triggers
-- ============================================================================
-- Run against an EXISTING database (the postgis/init/*.sql scripts only run
-- when the Docker volume is created fresh):
--
--   docker compose exec -T postgis \
--     psql -U postgres -d keptcarbon -v ON_ERROR_STOP=1 \
--     < postgis/migrations/001_uuid_name_refactor.sql
--
-- IMPORTANT: deploy this together with the matching application code.
-- This script DROPS users.fullname and carbon_projects.user_id, which the
-- old application code reads. The whole script is one transaction — if any
-- step fails, nothing is changed.
-- ============================================================================

BEGIN;

-- gen_random_uuid() is built in on PostgreSQL 13+; the extension covers
-- older versions and is a no-op otherwise.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 1) users — add uuid + first_name / last_name / display_name
-- ============================================================================
ALTER TABLE users
  ADD COLUMN uuid         UUID         NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN first_name   VARCHAR(100) NOT NULL DEFAULT '',
  ADD COLUMN last_name    VARCHAR(100) NOT NULL DEFAULT '',
  ADD COLUMN display_name VARCHAR(255) NOT NULL DEFAULT '';

ALTER TABLE users ADD CONSTRAINT uq_users_uuid UNIQUE (uuid);

-- Backfill names from fullname.
--   display_name : the original fullname, unchanged
--   first_name   : first whitespace-separated token
--   last_name    : everything after the first token; '' when fullname has
--                  no space (e.g. LINE display names, single-word names)
UPDATE users SET
  display_name = btrim(COALESCE(fullname, '')),
  first_name   = split_part(btrim(COALESCE(fullname, '')), ' ', 1),
  last_name    = CASE
                   WHEN btrim(COALESCE(fullname, '')) LIKE '% %'
                     THEN regexp_replace(btrim(fullname), '^\S+\s+', '')
                   ELSE ''
                 END;

-- ============================================================================
-- 2) carbon_projects — ownership via user_uuid (members) / guest_key (guests)
-- ============================================================================
ALTER TABLE carbon_projects
  ADD COLUMN user_uuid UUID REFERENCES users(uuid),
  ADD COLUMN guest_key VARCHAR(100);

-- Backfill user_uuid: the old code stored fullname → username → email
-- (first non-empty) in user_id, so match against all three. Only rows that
-- match EXACTLY ONE user are linked — if two users share a fullname the row
-- is ambiguous and falls through to guest_key below so no data is ever
-- attached to the wrong account.
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

-- Everything unmatched (Guest-* rows and any ambiguous rows) keeps its old
-- identifier as guest_key — nothing is lost; these can be claimed into an
-- account later.
UPDATE carbon_projects
SET guest_key = user_id
WHERE user_uuid IS NULL;

-- Every row must belong to exactly one owner type.
ALTER TABLE carbon_projects
  ADD CONSTRAINT chk_carbon_projects_owner
  CHECK (num_nonnulls(user_uuid, guest_key) = 1);

-- ============================================================================
-- 3) project_id stores a human name ("Rubber Farm Rayong") → rename
-- ============================================================================
ALTER TABLE carbon_projects RENAME COLUMN project_id TO project_name;
ALTER INDEX idx_carbon_projects_project_id
  RENAME TO idx_carbon_projects_project_name;

-- The new uniqueness rule below would fail if historical duplicates exist
-- (the old code allowed them). Keep the most recently updated active row per
-- owner + project and soft-delete the rest — consistent with the existing
-- soft-delete design, no rows are physically removed.
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

-- One active project per name per owner (members and guests separately).
CREATE UNIQUE INDEX uq_carbon_projects_user_project_active
  ON carbon_projects (user_uuid, project_name)
  WHERE status = 'active' AND user_uuid IS NOT NULL;

CREATE UNIQUE INDEX uq_carbon_projects_guest_project_active
  ON carbon_projects (guest_key, project_name)
  WHERE status = 'active' AND guest_key IS NOT NULL;

-- ============================================================================
-- 4) Drop the old string user_id + rebuild indexes
-- ============================================================================
DROP INDEX IF EXISTS idx_carbon_projects_user_id;
DROP INDEX IF EXISTS idx_carbon_projects_active;

ALTER TABLE carbon_projects DROP COLUMN user_id;

CREATE INDEX idx_carbon_projects_user_uuid ON carbon_projects (user_uuid);
CREATE INDEX idx_carbon_projects_guest_key ON carbon_projects (guest_key);

-- ============================================================================
-- 5) JSON → JSONB (defaults must be dropped before the type change and
--    re-created as jsonb afterwards)
-- ============================================================================
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

-- ============================================================================
-- 6) Auto-updated updated_at
-- ============================================================================
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

-- ============================================================================
-- 7) fullname is fully replaced — drop it last (after the carbon_projects
--    backfill above, which still matches against it)
-- ============================================================================
ALTER TABLE users DROP COLUMN fullname;

-- Migration summary, printed before commit
DO $$
DECLARE
  n_users     BIGINT;
  n_linked    BIGINT;
  n_guest     BIGINT;
BEGIN
  SELECT COUNT(*) INTO n_users  FROM users;
  SELECT COUNT(*) INTO n_linked FROM carbon_projects WHERE user_uuid IS NOT NULL;
  SELECT COUNT(*) INTO n_guest  FROM carbon_projects WHERE guest_key IS NOT NULL;
  RAISE NOTICE 'users migrated: %, projects linked to accounts: %, projects kept as guest: %',
    n_users, n_linked, n_guest;
END $$;

COMMIT;
