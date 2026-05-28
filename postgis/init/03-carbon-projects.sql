-- ==========================================================================
-- Carbon Projects — บันทึกแปลงยางพาราและผลคาร์บอนของผู้ใช้แต่ละคน
-- ==========================================================================
-- โครงสร้างใหม่:
--   • id             : SERIAL PRIMARY KEY (Auto Increment)
--   • user_id        : ชื่อผู้ใช้ หรือ Guest-<timestamp>-<random>
--   • project_id     : ชื่อโครงการ หรือ Guestprojects-<timestamp>-<random>
--   • plantation_info     : JSON ข้อมูลแปลง
--   • polygons_payload    : JSON ข้อมูล polygon ที่ส่งไป backend
--   • backend_responses   : JSON ผลลัพธ์จาก backend
--   • Soft Delete    : status + deleted_at
--   • History Table  : carbon_projects_history (audit trail)
-- ==========================================================================

-- ==========================================================================
-- 1) Main Table: carbon_projects
-- ==========================================================================
CREATE TABLE IF NOT EXISTS carbon_projects (
  -- Primary Key — Auto Increment
  id                SERIAL        PRIMARY KEY,

  -- ผู้ใช้: ถ้ายังไม่ล็อกอิน → Guest-<timestamp>-<random>  เช่น Guest-1748503939-9281
  --        ถ้าล็อกอินแล้ว   → username ของผู้ใช้            เช่น ponlakrit
  user_id           VARCHAR(100)  NOT NULL,

  -- โครงการ: ถ้ายังไม่ล็อกอิน → Guestprojects-<timestamp>-<random>  เช่น Guestprojects-1748503939-1122
  --          ถ้าล็อกอินแล้ว   → ชื่อโครงการที่ผู้ใช้ตั้ง              เช่น Rubber Farm Rayong
  project_id        VARCHAR(255)  NOT NULL,

  -- ข้อมูลแปลง (JSON) — ส่งมาทั้งก้อน
  -- ตัวอย่าง: { "polygon_id": "parcel-0-...", "province_code": "RAY", "geometry": {...}, "area_m2": 24968.2684, "status": {...}, "lu_polygon": [...] }
  plantation_info   JSON          NOT NULL DEFAULT '{}',

  -- ข้อมูล polygon payload ที่ส่งไป backend (JSON array)
  -- ตัวอย่าง: [{ "id": "plot-0", "geometry": {...}, "year_of_planting": null, ... }]
  polygons_payload  JSON          NOT NULL DEFAULT '[]',

  -- ผลลัพธ์จาก backend (JSON array)
  -- ตัวอย่าง: [{ "polygon_id": "plot-0", "status": {...}, "carbon_profile": [...], "estimated_parameters": {...} }]
  backend_responses JSON          NOT NULL DEFAULT '[]',

  -- ข้อมูล Plots ที่ประมวลผลแล้วสำหรับแสดงผลหน้า My Plots (JSON array)
  frontend_plots    JSON          NOT NULL DEFAULT '[]',

  -- Soft Delete: สถานะของ record
  --   'active'  = ใช้งานปกติ
  --   'deleted' = ถูกลบแล้ว (ไม่แสดงหน้าเว็บ แต่ยังอยู่ใน DB)
  status            VARCHAR(20)   NOT NULL DEFAULT 'active',

  -- Soft Delete: เวลาที่ถูกลบ (NULL = ยังไม่ถูกลบ)
  deleted_at        TIMESTAMPTZ   DEFAULT NULL,

  -- Timestamps
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Indexes สำหรับ carbon_projects
CREATE INDEX IF NOT EXISTS idx_carbon_projects_user_id
  ON carbon_projects (user_id);

CREATE INDEX IF NOT EXISTS idx_carbon_projects_project_id
  ON carbon_projects (project_id);

CREATE INDEX IF NOT EXISTS idx_carbon_projects_status
  ON carbon_projects (status);

-- Partial index: ค้นหาเฉพาะ record ที่ยังไม่ถูกลบ (ใช้บ่อยที่สุด)
CREATE INDEX IF NOT EXISTS idx_carbon_projects_active
  ON carbon_projects (user_id, project_id)
  WHERE status = 'active';



ALTER TABLE carbon_projects
  ADD CONSTRAINT chk_project_status
  CHECK (status IN ('active', 'deleted'));



