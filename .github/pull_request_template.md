## สรุปการเปลี่ยนแปลง

<!-- อธิบายสั้น ๆ ว่า PR นี้ทำอะไร แก้ปัญหาอะไร -->

## Checklist ก่อนขอ merge เข้า main

- [ ] รันผ่าน `docker compose up` และทดสอบ flow ที่เกี่ยวข้องบนเครื่อง local แล้ว
- [ ] CI เขียวหมด (typecheck / build / test ทั้ง nextjs และ backend)
- [ ] **ถ้ามีไฟล์ใหม่ใน `postgis/migrations/`** — แนบ runbook (ตามแบบ `001_DEPLOY_RUNBOOK.md`) พร้อม pre-check script และระบุว่าต้องใช้ maintenance window หรือไม่ (auto-deploy จะ skip PR แบบนี้โดยอัตโนมัติ ต้อง deploy มือ)
- [ ] **ถ้ามี env var ใหม่** — อัปเดต `.env.example` / `nextjs/.env.local.example` และ README แล้ว
- [ ] ไม่มี secret/credential หลุดใน diff
- [ ] ไม่มี breaking change ต่อ API ที่ README อ้างถึงโดยไม่อัปเดตเอกสารคู่กัน
- [ ] Reviewed แล้วอย่างน้อย 1 คน

## ผลกระทบต่อ UAT

<!-- ถ้า merge นี้จะทำให้พฤติกรรมบน UAT เปลี่ยน (ไม่ใช่แค่โค้ดภายใน) ระบุสั้น ๆ ว่าเปลี่ยนอะไร -->
