-- ============================================================================
-- Migration 043 — tbl_blog_image: Keppy Blog images stored in the database
-- ============================================================================
-- Run against an EXISTING database (after 041):
--
--   docker compose exec -T postgis \
--     psql -U keptcarbon -d keptcarbon -v ON_ERROR_STOP=1 \
--     < postgis/migrations/043_tbl_blog_image.sql
--
-- Same content as postgis/init/25-tbl-blog-image.sql.
-- Then move images of posts saved before this change out of
-- nextjs/public/assets/img/blog into the table:
--
--   docker compose exec nextjs node scripts/migrate-blog-images-to-db.mjs
--
-- Deploy this BEFORE the code that uses it. Purely additive; safe to re-run.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS tbl_blog_image (
  id          SERIAL       PRIMARY KEY,
  blog_id     INTEGER      NOT NULL REFERENCES tbl_blog(id) ON DELETE CASCADE,
  mime_type   VARCHAR(30)  NOT NULL CHECK (mime_type IN ('image/webp', 'image/jpeg', 'image/png')),
  data        BYTEA        NOT NULL,
  width       INTEGER,
  height      INTEGER,
  byte_size   INTEGER      NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blog_image_blog
  ON tbl_blog_image (blog_id);

COMMIT;
