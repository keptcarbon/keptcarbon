-- ============================================================================
-- Migration 038 — tbl_role_quota (+ history): per-role project / plot limits
-- ============================================================================
-- Run against an EXISTING database:
--
--   docker compose exec -T postgis \
--     psql -U keptcarbon -d keptcarbon -v ON_ERROR_STOP=1 \
--     < postgis/migrations/038_tbl_role_quota.sql
--
-- Same content as postgis/init/21-tbl-role-quota.sql. Starting limits:
--   guest 1 project / 5 plots, user 3 / 7, officer 5 / 20, rd unlimited.
-- 'admin' gets no row on purpose (no row = may not create projects/plots).
--
-- Deploy this BEFORE the code that reads it: without the table every project
-- save fails.
--
-- Purely additive; safe to re-run (existing quota rows are left as they are).
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS tbl_role_quota (
  role                   VARCHAR(20)  PRIMARY KEY,
  max_projects           INTEGER      CHECK (max_projects IS NULL OR max_projects > 0),
  max_plots_per_project  INTEGER      CHECK (max_plots_per_project IS NULL OR max_plots_per_project > 0),
  updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_by             INTEGER      REFERENCES tbl_users(id) ON DELETE SET NULL
);

INSERT INTO tbl_role_quota (role, max_projects, max_plots_per_project) VALUES
  ('guest',   1,    5),
  ('user',    3,    7),
  ('officer', 5,    20),
  ('rd',      NULL, NULL)
ON CONFLICT (role) DO NOTHING;

CREATE TABLE IF NOT EXISTS tbl_role_quota_history (
  id                     SERIAL       PRIMARY KEY,
  role                   VARCHAR(20)  NOT NULL,
  max_projects           INTEGER,
  max_plots_per_project  INTEGER,
  saved_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  saved_by               INTEGER      REFERENCES tbl_users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_role_quota_history_saved_at
  ON tbl_role_quota_history (saved_at DESC);

INSERT INTO tbl_role_quota_history (role, max_projects, max_plots_per_project)
SELECT q.role, q.max_projects, q.max_plots_per_project
FROM tbl_role_quota q
WHERE NOT EXISTS (SELECT 1 FROM tbl_role_quota_history h WHERE h.role = q.role);

COMMIT;
