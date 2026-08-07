-- ==========================================================================
-- Carbon Projects — บันทึกแปลงยางพาราและผลคาร์บอนของผู้ใช้แต่ละคน
-- ==========================================================================
-- โครงสร้าง:
--   • id             : SERIAL PRIMARY KEY (Auto Increment)
--   • user_uuid      : FK → tbl_users.uuid (ผู้ใช้ที่ล็อกอิน) — NULL ถ้าเป็น guest
--   • guest_key      : คีย์สุ่มปลอดภัยของ guest เช่น Guest-XXXXXXXXXXXXXXXXXXXX — NULL ถ้าล็อกอิน
--   • project_name   : ชื่อโครงการ เช่น "Rubber Farm Rayong"
--   • plantation_info     : JSONB ข้อมูลแปลง
--   • polygons_payload    : JSONB ข้อมูล polygon ที่ส่งไป backend
--   • backend_responses   : JSONB ผลลัพธ์จาก backend
--   • frontend_plots      : JSONB ข้อมูลสำหรับหน้า My Plots
--   • Soft Delete    : status + deleted_at
-- ==========================================================================

CREATE TABLE IF NOT EXISTS carbon_projects (
  id                SERIAL        PRIMARY KEY,

  -- เจ้าของ: ผู้ใช้ที่ล็อกอิน (user_uuid) หรือ guest (guest_key) — อย่างใดอย่างหนึ่งเสมอ
  user_uuid         UUID          REFERENCES tbl_users(uuid),
  guest_key         VARCHAR(100),

  -- ชื่อโครงการ เช่น "Rubber Farm Rayong"
  project_name      VARCHAR(255)  NOT NULL,

  -- ข้อมูลแปลง (JSONB)
  plantation_info   JSONB         NOT NULL DEFAULT '{}'::jsonb,

  -- polygon payload ที่ส่งไป backend (JSONB array)
  polygons_payload  JSONB         NOT NULL DEFAULT '[]'::jsonb,

  -- ผลลัพธ์จาก backend (JSONB array)
  backend_responses JSONB         NOT NULL DEFAULT '[]'::jsonb,

  -- ข้อมูล Plots สำหรับหน้า My Plots (JSONB array)
  frontend_plots    JSONB         NOT NULL DEFAULT '[]'::jsonb,

  -- Soft Delete
  status            VARCHAR(20)   NOT NULL DEFAULT 'active',
  deleted_at        TIMESTAMPTZ   DEFAULT NULL,

  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_project_status CHECK (status IN ('active', 'deleted')),
  -- เจ้าของต้องเป็นประเภทเดียวพอดี (member หรือ guest)
  CONSTRAINT chk_carbon_projects_owner CHECK (num_nonnulls(user_uuid, guest_key) = 1)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_carbon_projects_user_uuid    ON carbon_projects (user_uuid);
CREATE INDEX IF NOT EXISTS idx_carbon_projects_guest_key    ON carbon_projects (guest_key);
CREATE INDEX IF NOT EXISTS idx_carbon_projects_project_name ON carbon_projects (project_name);
CREATE INDEX IF NOT EXISTS idx_carbon_projects_status       ON carbon_projects (status);

-- One active project per name per owner (members and guests tracked separately).
CREATE UNIQUE INDEX IF NOT EXISTS uq_carbon_projects_user_project_active
  ON carbon_projects (user_uuid, project_name)
  WHERE status = 'active' AND user_uuid IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_carbon_projects_guest_project_active
  ON carbon_projects (guest_key, project_name)
  WHERE status = 'active' AND guest_key IS NOT NULL;

DROP TRIGGER IF EXISTS trg_carbon_projects_updated_at ON carbon_projects;
CREATE TRIGGER trg_carbon_projects_updated_at
  BEFORE UPDATE ON carbon_projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
