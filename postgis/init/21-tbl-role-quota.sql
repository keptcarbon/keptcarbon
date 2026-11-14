-- ==========================================================================
-- Role quota — how many projects an account of each role may own and how
-- many plots each project may hold. One row per role; admin edits it on
-- /admin/quotas. 'guest' is the not-logged-in visitor on /map-draw.
--   NULL = unlimited.
--   No row for a role (e.g. 'admin') = may not create projects/plots at all.
-- Enforced server-side in POST /api/plots, PATCH /api/plots/[id] and
-- POST /api/plots/claim (lib/quota.ts). Only active projects with at least
-- one active plot count; lowering a limit never deletes anything, it only
-- blocks adding more.
-- ==========================================================================

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

-- One row per saved change of a role's quota (who, when, the new values).
-- Written by PUT /api/admin/quotas in the same transaction as the update.
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

-- Backfill: the starting values become each role's first history row.
INSERT INTO tbl_role_quota_history (role, max_projects, max_plots_per_project)
SELECT q.role, q.max_projects, q.max_plots_per_project
FROM tbl_role_quota q
WHERE NOT EXISTS (SELECT 1 FROM tbl_role_quota_history h WHERE h.role = q.role);
