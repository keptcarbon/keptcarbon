-- ==========================================================================
-- Keppy Blog tags — free-form keywords added on /rnd/kitty-content/blog/new
-- (chip input, auto-completed from tbl_blog_tag via GET /api/rnd/blog-tags).
-- Used to rank "บทความที่เกี่ยวข้อง": posts sharing more tags come first.
--   tbl_blog_tag      one row per distinct tag; name is unique ignoring case
--   tbl_blog_tag_map  which tags a tbl_blog post has (gone with the post)
-- ==========================================================================

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
