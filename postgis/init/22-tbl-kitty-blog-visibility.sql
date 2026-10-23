-- ==========================================================================
-- Keppy Blog visibility — the publish / hide switch per blog post, set by
-- R&D or admin on /rnd/kitty-content. Posts themselves live in code
-- (nextjs/app/(main)/(landing)/kitty/blog/content.ts); this table only
-- records which of them are hidden.
--   No row for a slug = published (new posts show up by default).
-- Applies to posts in content.ts only (editor posts use tbl_blog.published).
-- Read by the public blog pages (lib/kitty-blog.ts) and
-- written by PATCH /api/rnd/blog.
-- ==========================================================================

CREATE TABLE IF NOT EXISTS tbl_kitty_blog_visibility (
  slug        VARCHAR(200) PRIMARY KEY,
  published   BOOLEAN      NOT NULL,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_by  INTEGER      REFERENCES tbl_users(id) ON DELETE SET NULL
);
