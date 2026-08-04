import styles from "./Popup.module.css";

/**
 * Shown when a guest (not logged in) tries to draw more than the allowed
 * number of plots. Prompts them to log in or register to continue.
 * Re-appears every time the guest clicks "วาดแปลงเพิ่ม" while at the limit.
 */
export function GuestLimitPopup({
  open,
  limit,
  onClose,
  onLogin,
  onRegister,
}: {
  open: boolean;
  limit: number;
  onClose: () => void;
  onLogin: () => void;
  onRegister: () => void;
}) {
  if (!open) return null;
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
            ผู้ใช้ทั่วไปวาดได้สูงสุด <b>{limit} แปลง</b>
          </span>
        </div>
        <p className={styles.desc}>
          กรุณาเข้าสู่ระบบหรือสมัครสมาชิกเพื่อวาดแปลงเพิ่ม
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button onClick={onLogin} className={styles.buttonPrimary}>
            เข้าสู่ระบบ
          </button>
          <button onClick={onRegister} className={styles.buttonOutline}>
            สมัครสมาชิก
          </button>
          <button onClick={onClose} className={styles.buttonText}>
            ยกเลิก
          </button>
        </div>
      </div>
    </div>
  );
}
