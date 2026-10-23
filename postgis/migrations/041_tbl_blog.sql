-- ============================================================================
-- Migration 041 — tbl_blog: Keppy Blog posts written in the R&D editor
-- ============================================================================
-- Run against an EXISTING database:
--
--   docker compose exec -T postgis \
--     psql -U keptcarbon -d keptcarbon -v ON_ERROR_STOP=1 \
--     < postgis/migrations/041_tbl_blog.sql
--
-- Same content as postgis/init/23-tbl-blog.sql. Images are files under
-- nextjs/public/assets/img/blog; the row stores their public paths.
--
-- Deploy this BEFORE the code that writes it (POST /api/rnd/blog).
-- Purely additive; safe to re-run.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS tbl_blog (
  id              SERIAL        PRIMARY KEY,
  slug            VARCHAR(200)  NOT NULL UNIQUE
                  CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title           VARCHAR(300)  NOT NULL,
  category        VARCHAR(50)   NOT NULL,
  published_date  DATE          NOT NULL,
  author          VARCHAR(200),
  cover_image     VARCHAR(300)  NOT NULL,
  body            JSONB         NOT NULL DEFAULT '[]'::jsonb,
  published       BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_by      INTEGER       REFERENCES tbl_users(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_by      INTEGER       REFERENCES tbl_users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_blog_published_date
  ON tbl_blog (published_date DESC);

COMMIT;
