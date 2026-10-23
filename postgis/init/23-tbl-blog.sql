-- ==========================================================================
-- Keppy Blog posts written on /rnd/kitty-content/blog/new (POST
-- /api/rnd/blog). One row per post, keyed by its URL slug
-- (/kitty/blog/<slug>/).
--   cover_image / body image src: public paths of the uploaded files in
--   nextjs/public/assets/img/blog — <slug>-cover.<ext>,
--   <slug>-blog-img-01.<ext>, … (see the route for the naming).
--   body: the post's blocks, same shape as PostBlock in
--   kitty/blog/content.ts ({type: "paragraph" | "heading" | "quote" |
--   "quote-<colour>" | "image", …}).
--   category: a blogCategories id from content.ts (news / activity / carbon).
-- ==========================================================================

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
