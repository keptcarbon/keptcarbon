-- ============================================================================
-- Migration 040 — tbl_kitty_blog_visibility: Keppy Blog publish / hide switch
-- ============================================================================
-- Run against an EXISTING database:
--
--   docker compose exec -T postgis \
--     psql -U keptcarbon -d keptcarbon -v ON_ERROR_STOP=1 \
--     < postgis/migrations/040_tbl_kitty_blog_visibility.sql
--
-- Same content as postgis/init/22-tbl-kitty-blog-visibility.sql.
-- No row for a slug = published, so every existing post stays visible.
--
-- Deploy this BEFORE the code that reads it: without the table the switch on
-- /rnd/kitty-content can't save (the public blog pages still show every post).
--
-- Purely additive; safe to re-run.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS tbl_kitty_blog_visibility (
  slug        VARCHAR(200) PRIMARY KEY,
  published   BOOLEAN      NOT NULL,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_by  INTEGER      REFERENCES tbl_users(id) ON DELETE SET NULL
);

COMMIT;
