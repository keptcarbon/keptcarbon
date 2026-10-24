-- ==========================================================================
-- KeptCarbon Handbook + Textbook — written in the R&D editor
-- (/rnd/kitty-content). Each book is sections (handbook หมวด / textbook
-- บท) → pages (articles / lessons), both ordered by `position`; the
-- sidebar, numbering and prev/next follow that order. A page body is the
-- same JSON block list as tbl_blog.body. Images are bytes in
-- tbl_kitty_page_image (WebP, ≤ 1600 px wide), served by
-- GET /api/kitty-images/<id> — the body's image src holds that URL.
-- ==========================================================================

CREATE TABLE IF NOT EXISTS tbl_kitty_section (
  id          SERIAL        PRIMARY KEY,
  book        VARCHAR(20)   NOT NULL CHECK (book IN ('handbook', 'textbook')),
  title       VARCHAR(200)  NOT NULL CHECK (btrim(title) <> ''),
  icon        VARCHAR(40),                 -- handbook: lucide icon name (kitty/book-icons.ts)
  position    INTEGER       NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_by  INTEGER       REFERENCES tbl_users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_by  INTEGER       REFERENCES tbl_users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_kitty_section_book
  ON tbl_kitty_section (book, position);

CREATE TABLE IF NOT EXISTS tbl_kitty_page (
  id           SERIAL        PRIMARY KEY,
  -- A section can only be deleted once it has no pages.
  section_id   INTEGER       NOT NULL REFERENCES tbl_kitty_section(id) ON DELETE RESTRICT,
  -- Unique across both books.
  slug         VARCHAR(200)  NOT NULL UNIQUE
               CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title        VARCHAR(300)  NOT NULL CHECK (btrim(title) <> ''),
  description  TEXT,                       -- lead text under the title
  tip          TEXT,                       -- textbook: เกร็ดความรู้ beside the lesson
  body         JSONB         NOT NULL DEFAULT '[]'::jsonb,
  position     INTEGER       NOT NULL DEFAULT 0,
  published    BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_by   INTEGER       REFERENCES tbl_users(id) ON DELETE SET NULL,
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_by   INTEGER       REFERENCES tbl_users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_kitty_page_section
  ON tbl_kitty_page (section_id, position);

CREATE TABLE IF NOT EXISTS tbl_kitty_page_image (
  id          SERIAL       PRIMARY KEY,
  page_id     INTEGER      NOT NULL REFERENCES tbl_kitty_page(id) ON DELETE CASCADE,
  mime_type   VARCHAR(30)  NOT NULL CHECK (mime_type IN ('image/webp', 'image/jpeg', 'image/png')),
  data        BYTEA        NOT NULL,
  width       INTEGER,
  height      INTEGER,
  byte_size   INTEGER      NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kitty_page_image_page
  ON tbl_kitty_page_image (page_id);

-- Starting outline (what handbook/content.ts and textbook/content.ts held),
-- with empty bodies — the pages show "เนื้อหากำลังจัดทำ" until written.
-- Only seeded while a book has no sections, so re-running never brings
-- back sections or pages an admin has removed.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tbl_kitty_section WHERE book = 'handbook') THEN
    INSERT INTO tbl_kitty_section (book, title, icon, position) VALUES
      ('handbook', 'เริ่มต้นใช้งาน',     'Rocket',    1),
      ('handbook', 'การประเมินคาร์บอน', 'Map',       2),
      ('handbook', 'การจัดการแปลง',     'MapPinned', 3),
      ('handbook', 'แดชบอร์ด',          'BarChart3', 4),
      ('handbook', 'บัญชีผู้ใช้',          'UserCog',   5);
    INSERT INTO tbl_kitty_page (section_id, slug, title, description, position)
    SELECT s.id, v.slug, v.title, v.description, v.position
    FROM (VALUES
      ('เริ่มต้นใช้งาน',     'register-login',         'สมัครสมาชิกและเข้าสู่ระบบ', 'วิธีสร้างบัญชีผู้ใช้และเข้าสู่ระบบ KeptCarbon', 1),
      ('เริ่มต้นใช้งาน',     'navigation',             'ภาพรวมเมนูของระบบ',       'ทำความรู้จักเมนูหลักและหน้าต่าง ๆ ของ KeptCarbon', 2),
      ('การประเมินคาร์บอน', 'draw-plot',              'วาดแปลง',                'วิธีวาดขอบเขตแปลงบนแผนที่ในระบบ KeptCarbon', 1),
      ('การประเมินคาร์บอน', 'plot-info',              'บันทึกข้อมูลแปลง',         'กรอกข้อมูลแปลงยางพาราเพื่อใช้ในการประเมินคาร์บอน', 2),
      ('การประเมินคาร์บอน', 'assessment-result',      'ดูผลการประเมินคาร์บอน',    'อ่านผลการประเมินปริมาณคาร์บอนกักเก็บของแปลง', 3),
      ('การจัดการแปลง',     'my-plots',               'แปลงของฉัน',             'ดู แก้ไข และจัดการโครงการและแปลงที่บันทึกไว้', 1),
      ('แดชบอร์ด',          'carbon-stock-dashboard', 'ศักยภาพคาร์บอนสะสม',      'ดูภาพรวมศักยภาพคาร์บอนสะสมในแต่ละพื้นที่', 1),
      ('แดชบอร์ด',          'simulation-dashboard',   'จำลองคาร์บอนกักเก็บ',      'จำลองปริมาณคาร์บอนกักเก็บและรายได้ในอนาคต', 2),
      ('บัญชีผู้ใช้',          'profile',                'จัดการโปรไฟล์',           'แก้ไขข้อมูลส่วนตัวและการตั้งค่าบัญชีผู้ใช้', 1)
    ) AS v(section, slug, title, description, position)
    JOIN tbl_kitty_section s ON s.book = 'handbook' AND s.title = v.section
    ON CONFLICT (slug) DO NOTHING;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM tbl_kitty_section WHERE book = 'textbook') THEN
    INSERT INTO tbl_kitty_section (book, title, position) VALUES
      ('textbook', 'ความรู้เบื้องต้นเกี่ยวกับคาร์บอน', 1),
      ('textbook', 'การประเมินคาร์บอน',           2),
      ('textbook', 'แนวทางการจัดการสวนยาง',        3);
    INSERT INTO tbl_kitty_page (section_id, slug, title, position)
    SELECT s.id, v.slug, v.title, v.position
    FROM (VALUES
      ('ความรู้เบื้องต้นเกี่ยวกับคาร์บอน', 'what-is-carbon',               'คาร์บอนคืออะไร', 1),
      ('ความรู้เบื้องต้นเกี่ยวกับคาร์บอน', 'carbon-cycle',                 'วัฏจักรคาร์บอน', 2),
      ('ความรู้เบื้องต้นเกี่ยวกับคาร์บอน', 'carbon-credit',                'ความสำคัญของคาร์บอนเครดิต', 3),
      ('การประเมินคาร์บอน',           'carbon-assessment',            'หลักการประเมินคาร์บอนกักเก็บ', 1),
      ('แนวทางการจัดการสวนยาง',        'rubber-plantation-management', 'การจัดการสวนยางเพื่อกักเก็บคาร์บอน', 1)
    ) AS v(section, slug, title, position)
    JOIN tbl_kitty_section s ON s.book = 'textbook' AND s.title = v.section
    ON CONFLICT (slug) DO NOTHING;
  END IF;
END $$;
