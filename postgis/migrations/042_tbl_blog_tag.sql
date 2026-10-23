-- ============================================================================
-- Migration 042 — tbl_blog_tag + tbl_blog_tag_map: Keppy Blog tags
-- ============================================================================
-- Run against an EXISTING database (after 041 — the map references tbl_blog):
--
--   docker compose exec -T postgis \
--     psql -U keptcarbon -d keptcarbon -v ON_ERROR_STOP=1 \
--     < postgis/migrations/042_tbl_blog_tag.sql
--
-- Same content as postgis/init/24-tbl-blog-tag.sql.
-- Deploy this BEFORE the code that reads it (tag suggestions, saving tags).
-- Purely additive; safe to re-run.
-- ============================================================================

BEGIN;
CREATE TABLE IF NOT EXISTS tbl_blog_tag (
  id          SERIAL       PRIMARY KEY,
  name        VARCHAR(30)  NOT NULL CHECK (btrim(name) <> ''),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_by  INTEGER      REFERENCES tbl_users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_blog_tag_name_lower
  ON tbl_blog_tag (lower(name));

CREATE TABLE IF NOT EXISTS tbl_blog_tag_map (
  blog_id  INTEGER  NOT NULL REFERENCES tbl_blog(id) ON DELETE CASCADE,
  tag_id   INTEGER  NOT NULL REFERENCES tbl_blog_tag(id) ON DELETE CASCADE,
  position SMALLINT NOT NULL DEFAULT 0,   -- order the author entered them (cards show the first 3)
  PRIMARY KEY (blog_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_blog_tag_map_tag
  ON tbl_blog_tag_map (tag_id);

COMMIT;
