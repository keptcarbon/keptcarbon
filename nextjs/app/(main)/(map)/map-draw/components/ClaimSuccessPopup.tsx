import styles from "./Popup.module.css";

/**
 * Shown once, right after a guest's drawn plots have been reconciled into the
 * account following login (see the reconcile effect in map-draw/page.tsx):
 *   - Path A: the plots were already saved to the DB as a guest_uuid project
 *     (the guest had clicked "ประมวลผล"); POST /api/plots/claim flips that row
 *     to the account in place. The popup fires as soon as that 200 lands.
 *   - Path B: the plots existed only in a client snapshot; they're restored
 *     into step 2 and auto-saved as a user-owned project. The popup fires from
 *     onAutoSaveComplete, i.e. only after the row actually exists.
 * Either way the project is now real and in "แปลงของฉัน" by the time this shows.
 */
export function ClaimSuccessPopup({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={`${styles.iconCircle} ${styles.iconSuccess}`}>
          <i className="bi bi-check-circle-fill" />
        </div>
        <h3 className={styles.title}>บันทึกแปลงเข้าบัญชีแล้ว !!</h3>
        <p className={styles.desc}>
          แปลงที่วาดไว้ก่อนเข้าสู่ระบบถูกบันทึกเข้าโครงการในบัญชีของคุณเรียบร้อยแล้ว
          คุณสามารถวาดแปลงเพิ่มเติม แก้ไขชื่อโครงการ และกดบันทึกเพื่ออัปเดตข้อมูลได้
        </p>
        <button onClick={onClose} className={`${styles.button} ${styles.buttonSuccess}`}>
          ตกลง
        </button>
      </div>
    </div>
  );
}
