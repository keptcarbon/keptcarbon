import styles from "./Popup.module.css";

export function StepWarningPopup({
  open,
  isLoggedIn,
  plotsSaved,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  isLoggedIn: boolean;
  plotsSaved: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={`${styles.iconCircle} ${styles.iconDanger}`}>
          <i className="bi bi-exclamation-triangle-fill" />
        </div>
        <h3 className={styles.titleDanger}>
          {isLoggedIn ? "เริ่มโครงการใหม่หรือไม่?" : "แน่ใจหรือไม่?"}
        </h3>
        <p className={styles.desc}>
          {isLoggedIn
            ? "ต้องการที่จะเริ่มกำหนดขอบเขตและสร้างโครงการใหม่"
            : "หากกลับไปข้อมูลที่ทำไว้จะหายไป"}
          {isLoggedIn && !plotsSaved && (
            <>
              <br />
              <span className={styles.warningText}>
                คำเตือน:ไม่ได้ทำการบันทึกข้อมูลแปลงที่วาดไว้ในระบบ
              </span>
            </>
          )}
        </p>
        <div className={styles.buttonRow}>
          <button
            onClick={onCancel}
            className={styles.buttonSecondary}
          >
            ยกเลิก
          </button>
          <button
            onClick={onConfirm}
            className={styles.buttonDanger}
          >
            ตกลง
          </button>
        </div>
      </div>
    </div>
  );
}