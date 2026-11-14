import { useState } from "react";
import styles from "./Popup.module.css";

/**
 * Shown when a guest (not logged in) hits the guest quota (tbl_role_quota
 * 'guest' row): kind "plots" -- tried to draw more plots than allowed;
 * kind "projects" -- already holds the allowed number of projects and tried
 * to start another. Prompts them to log in or register to continue.
 * Re-appears every time the guest clicks "วาดแปลงเพิ่ม" while at the limit.
 *
 * kind "projects" + onStartOver: a guest can't see or delete their earlier
 * project (no my-plots without an account), and it outlives the visit via
 * localStorage guest_user_id -- so offer to discard it and start a new one.
 * Logging in instead claims it into the account.
 */
export function GuestLimitPopup({
  open,
  limit,
  kind = "plots",
  onClose,
  onLogin,
  onRegister,
  onStartOver,
}: {
  open: boolean;
  limit: number;
  kind?: "plots" | "projects";
  onClose: () => void;
  onLogin: () => void;
  onRegister: () => void;
  onStartOver?: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  if (!open) return null;
  const canStartOver = kind === "projects" && !!onStartOver;

  const handleStartOver = async () => {
    if (!onStartOver || busy) return;
    setBusy(true);
    try { await onStartOver(); } finally { setBusy(false); }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className={styles.closeBtn}
          aria-label="ปิด"
        >
          <i className="bi bi-x-lg" style={{ fontSize: 16 }} />
        </button>
        <div className={styles.iconMinimal}>
          <i className="bi bi-unlock" />
        </div>
        <div className={styles.chip}>
          <i className="bi bi-info-circle" />
          <span>
            {kind === "plots"
              ? <>ผู้ใช้ทั่วไปวาดได้สูงสุด <b>{limit} แปลง</b></>
              : <>ผู้ใช้ทั่วไปสร้างได้สูงสุด <b>{limit} โครงการ</b></>}
          </span>
        </div>
        <p className={styles.desc}>
          {kind === "plots"
            ? "กรุณาเข้าสู่ระบบหรือสมัครสมาชิกเพื่อวาดแปลงเพิ่ม"
            : canStartOver
              ? <>
                  คุณมีโครงการที่ประเมินไว้ก่อนหน้านี้ เข้าสู่ระบบหรือสมัครสมาชิกเพื่อเก็บโครงการเดิมไว้ในบัญชี
                  หรือเริ่มโครงการใหม่
                  <span className={styles.warningText}>การเริ่มโครงการใหม่จะลบโครงการเดิม</span>
                </>
              : "กรุณาเข้าสู่ระบบหรือสมัครสมาชิกเพื่อสร้างโครงการเพิ่ม"}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button onClick={onLogin} className={styles.buttonPrimary} disabled={busy}>
            เข้าสู่ระบบ
          </button>
          <button onClick={onRegister} className={styles.buttonOutline} disabled={busy}>
            สมัครสมาชิก
          </button>
          {canStartOver && (
            <button onClick={handleStartOver} className={styles.buttonOutline} disabled={busy}>
              {busy ? "กำลังลบโครงการเดิม..." : "ลบโครงการเดิมและเริ่มใหม่"}
            </button>
          )}
          <button onClick={onClose} className={styles.buttonText} disabled={busy}>
            ยกเลิก
          </button>
        </div>
      </div>
    </div>
  );
}
