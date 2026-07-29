-- ============================================================================
-- PRE-CHECK for Migration 001 — READ ONLY (no data is modified)
-- ============================================================================
-- รันบน production ได้อย่างปลอดภัย เพื่อดูว่า "ถ้ารัน migration จริง" ข้อมูลจะถูก
-- จัดการอย่างไร — โดยเฉพาะจำนวนแถว carbon_projects ที่จะผูกเข้าบัญชีสำเร็จ vs
-- ตกไปเป็น guest (เข้าถึงผ่าน UI ไม่ได้)
--
--   docker compose exec -T postgis \
--     psql -U postgres -d keptcarbon -f /path/to/001_PRECHECK.sql
--
-- ไม่มี BEGIN/COMMIT และไม่มี UPDATE/DELETE/ALTER — เป็น SELECT ล้วน
-- ============================================================================

-- (1) ภาพรวม: active carbon_projects จะถูกแบ่งเป็นกี่ประเภท
-- ใช้ u.id นับจำนวน user ที่ match (uuid ยังไม่มีตอนนี้ — migration เป็นคนเพิ่ม)
WITH m AS (
  SELECT cp.id,
         COUNT(u.id) AS n_match
  FROM carbon_projects cp
  LEFT JOIN users u
    ON cp.user_id IN (u.fullname, u.username, u.email)
  WHERE cp.status = 'active'
  GROUP BY cp.id
)
SELECT
  COUNT(*)                                   AS total_active_projects,
  COUNT(*) FILTER (WHERE n_match = 1)        AS will_link_to_account,   -- ✅ ผูกสำเร็จ
  COUNT(*) FILTER (WHERE n_match = 0)        AS will_become_guest,      -- ปกติ = guest จริง
  COUNT(*) FILTER (WHERE n_match > 1)        AS ambiguous_to_guest      -- ⚠️ ชื่อซ้ำ → orphan
FROM m;

-- (2) ⚠️ แถวอันตราย: user_id ตรงกับ "หลายคน" (ชื่อซ้ำ) — พวกนี้เคยเป็นของ user
--     ที่ล็อกอิน แต่จะกลายเป็น guest หลัง migrate ควรตรวจว่ามีจริงไหม
SELECT cp.user_id, cp.project_id, COUNT(u.id) AS matched_users
FROM carbon_projects cp
JOIN users u ON cp.user_id IN (u.fullname, u.username, u.email)
WHERE cp.status = 'active'
GROUP BY cp.id, cp.user_id, cp.project_id
HAVING COUNT(u.id) > 1
ORDER BY matched_users DESC;

-- (3) แถวที่จะกลายเป็น guest ทั้งหมด (ดูว่าเป็น Guest-* จริง หรือมีชื่อคนปนมา)
--     ถ้าเห็น user_id ที่ "ดูเหมือนชื่อคน" แต่ไม่ match แปลว่า user เคยเปลี่ยนชื่อ
--     หรือถูกลบบัญชีไป → ข้อมูลยังอยู่แต่ user เข้าถึงไม่ได้
SELECT cp.user_id, COUNT(*) AS project_count
FROM carbon_projects cp
LEFT JOIN users u ON cp.user_id IN (u.fullname, u.username, u.email)
WHERE cp.status = 'active' AND u.id IS NULL
GROUP BY cp.user_id
ORDER BY project_count DESC;

-- (4) ตัวซ้ำ: (เจ้าของ, project_name) ที่ active มากกว่า 1 แถว
--     migration จะเก็บแถวล่าสุดไว้ แล้ว soft-delete ที่เหลือ (ไม่ลบจริง)
--     ตัวเลขนี้คือจำนวนแถวที่จะถูกซ่อนจาก UI
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY user_id, project_id
           ORDER BY updated_at DESC, id DESC
         ) AS rn
  FROM carbon_projects
  WHERE status = 'active'
)
SELECT COUNT(*) AS duplicate_rows_to_soft_delete
FROM ranked
WHERE rn > 1;

-- (5) users: ตรวจว่ามี fullname ที่แยกชื่อ-นามสกุลได้ปกติไหม
SELECT
  COUNT(*)                                              AS total_users,
  COUNT(*) FILTER (WHERE btrim(COALESCE(fullname,'')) = '')       AS empty_fullname,
  COUNT(*) FILTER (WHERE btrim(COALESCE(fullname,'')) LIKE '% %') AS has_last_name,
  COUNT(*) FILTER (WHERE btrim(COALESCE(fullname,'')) <> ''
                    AND btrim(COALESCE(fullname,'')) NOT LIKE '% %') AS first_name_only
FROM users;
