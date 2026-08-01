# Deploy Runbook — Migration 001 (UUID + name split)

**Author:** schema refactor · **Migration:** `001_uuid_name_refactor.sql`

## ⚠️ อ่านก่อน (TL;DR)

Migration นี้ **ลบคอลัมน์ `users.fullname` และ `carbon_projects.user_id`** ที่โค้ดเวอร์ชันเก่าใช้อยู่
→ schema กับโค้ด **ต้องเปลี่ยนพร้อมกัน** ไม่งั้นเว็บล่มในช่วงคาบเกี่ยว
→ วิธีที่แนะนำคือ **ปิดเว็บสั้น ๆ (maintenance window ~1-2 นาที)** แล้วทำตามลำดับด้านล่าง

**ห้าม** migrate ทิ้งไว้แล้วค่อย deploy วันหลัง และ **ห้าม** deploy โค้ดใหม่ก่อน migrate

---

## ก่อนเริ่ม (Pre-flight)

1. **รัน pre-check (read-only) เพื่อดูผลกระทบก่อน** — สำคัญมากถ้ามีข้อมูลจริง
   ```bash
   docker compose exec -T postgis \
     psql -U postgres -d keptcarbon -f /docker-entrypoint-initdb.d/../001_PRECHECK.sql
   # หรือ pipe ไฟล์เข้าไป:  psql ... < postgis/migrations/001_PRECHECK.sql
   ```
   ดูค่า `will_link_to_account` (ควรเท่ากับจำนวนโปรเจกต์ของ user ที่ล็อกอิน) และ
   `ambiguous_to_guest` (ควรเป็น 0 — ถ้าไม่ใช่ แปลว่ามีชื่อซ้ำ ต้องแก้มือก่อน migrate)
2. **Backup ฐานข้อมูลก่อน**
   ```bash
   docker compose exec -T postgis \
     pg_dump -U postgres -d keptcarbon -Fc > backup_pre_001_$(date +%Y%m%d_%H%M).dump
   ```
3. ตรวจว่า build โค้ดใหม่ผ่าน (`npx tsc --noEmit` ใน `nextjs/`)
4. แจ้งผู้ใช้ล่วงหน้าถ้ามี traffic (ประกาศ maintenance)

---

## ลำดับการ Deploy (production)

```
1. เปิดหน้า maintenance / หยุดรับ traffic เข้าแอป
2. รัน migration  ────────────┐
3. deploy โค้ดใหม่             │  ทำติดกัน ให้ช่วงนี้สั้นที่สุด
4. verify (ดูหัวข้อด้านล่าง) ──┘
5. ปิดหน้า maintenance / เปิดรับ traffic
```

### 2) รัน migration
```bash
docker compose exec -T postgis \
  psql -U postgres -d keptcarbon -v ON_ERROR_STOP=1 \
  < postgis/migrations/001_uuid_name_refactor.sql
```
- ทั้งไฟล์อยู่ใน `BEGIN … COMMIT` เดียว → ถ้า error กลางคัน จะ **rollback ทั้งหมดอัตโนมัติ** (schema ไม่เปลี่ยน)
- ตอนจบจะพิมพ์บรรทัดสรุป เช่น
  `NOTICE: users migrated: 12, projects linked to accounts: 30, projects kept as guest: 5`

### 3) deploy โค้ดใหม่
ตามวิธี deploy ปกติของทีม (build image ใหม่ / push / restart คอนเทนเนอร์ nextjs)

---

## Verify หลัง migrate + deploy

รัน SQL ตรวจสภาพ schema:
```sql
-- คอลัมน์ใหม่ต้องมี, คอลัมน์เก่าต้องหาย
\d users            -- ต้องเห็น uuid, first_name, last_name, display_name; ไม่มี fullname
\d carbon_projects  -- ต้องเห็น user_uuid, guest_key, project_name; ไม่มี user_id, project_id

-- ทุกโปรเจกต์ต้องมีเจ้าของประเภทเดียวพอดี (ไม่มีแถวที่ทั้ง null)
SELECT COUNT(*) FROM carbon_projects
WHERE num_nonnulls(user_uuid, guest_key) <> 1;   -- ต้องได้ 0
```

เช็คฝั่งแอป (smoke test):
- [ ] ล็อกอินด้วย email/password → เห็นชื่อบน Header ถูกต้อง
- [ ] เข้าหน้าโปรไฟล์ → ช่อง ชื่อ/นามสกุล มีข้อมูลเดิม, กดบันทึกได้
- [ ] หน้า My Plots → เห็นโปรเจกต์เดิมของ user ครบ
- [ ] สมัครสมาชิกใหม่ (ช่อง ชื่อ + นามสกุล แยกกัน) → สำเร็จ
- [ ] วาดแปลงแบบ guest แล้วล็อกอิน → โปรเจกต์ guest ถูกดึงเข้าบัญชี (ฟีเจอร์ claim)
- [ ] ล็อกอิน OAuth (Google/LINE/Facebook) อย่างน้อย 1 ตัว

---

## Rollback (ถ้าพัง)

Migration เป็น transaction เดียว — ถ้า SQL error มันไม่ commit อยู่แล้ว ไม่ต้องทำอะไร

แต่ถ้า migrate สำเร็จแล้วเจอปัญหาตอน verify และต้องถอย:
1. deploy โค้ด**เวอร์ชันเก่า**กลับ (rollback image)
2. restore ฐานข้อมูลจาก backup:
   ```bash
   docker compose exec -T postgis \
     pg_restore -U postgres -d keptcarbon --clean --if-exists < backup_pre_001_XXXX.dump
   ```
> ไม่มี down-migration script เพราะ migration ลบคอลัมน์ทิ้ง — การถอยต้องใช้ backup เท่านั้น
> **ดังนั้น backup ในขั้น pre-flight คือสิ่งที่ห้ามข้าม**

---

## หมายเหตุสำหรับ fresh install

ถ้าสร้าง environment ใหม่จากศูนย์ (volume ว่าง) **ไม่ต้องรัน migration นี้** — สคริปต์ใน
`postgis/init/*.sql` ถูกอัปเดตให้เป็น schema ใหม่แล้ว จะรันอัตโนมัติตอนสร้าง volume ครั้งแรก
Migration ไฟล์นี้ใช้เฉพาะกับฐานข้อมูล **ที่มีข้อมูลเดิมอยู่แล้ว** เท่านั้น
