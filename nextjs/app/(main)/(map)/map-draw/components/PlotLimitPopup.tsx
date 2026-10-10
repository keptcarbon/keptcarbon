import styles from "./Popup.module.css";

/**
 * Shown when a logged-in user tries to draw more plots than their role's
 * per-project limit (tbl_role_quota). Guests get GuestLimitPopup instead,
 * which pushes them to log in. Re-appears on every "วาดแปลงเพิ่ม" click
 * while at the limit.
 */
export function PlotLimitPopup({
  open,
  limit,
  onClose,
}: {
  open: boolean;
  limit: number;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className={styles.closeBtn} aria-label="ปิด">
          <i className="bi bi-x-lg" style={{ fontSize: 16 }} />
        </button>
        <div className={styles.iconMinimal}>
          <i className="bi bi-grid-3x3-gap" />
        </div>
        <div className={styles.chip}>
          <i className="bi bi-info-circle" />
          <span>
            หนึ่งโครงการมีได้สูงสุด <b>{limit} แปลง</b>
          </span>
        </div>
        <p className={styles.desc}>
          บันทึกโครงการนี้ แล้วเริ่มโครงการใหม่เพื่อวาดแปลงเพิ่ม
        </p>
        <button onClick={onClose} className={styles.buttonPrimary}>
          ตกลง
        </button>
      </div>
    </div>
  );
}
