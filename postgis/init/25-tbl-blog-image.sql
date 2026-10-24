-- ==========================================================================
-- Keppy Blog images — every cover and body image, stored as bytes in the
-- database (no files on disk). Uploads are resized (≤ 1600 px wide) and
-- converted to WebP before saving. Served by GET /api/blog-images/<id>
-- with long-lived caching — an id's bytes never change; replacing an image
-- adds a new row. tbl_blog.cover_image / body image src hold that URL.
-- Rows go with their post (ON DELETE CASCADE); images a post stops using
-- are deleted when the post is saved.
-- ==========================================================================

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
