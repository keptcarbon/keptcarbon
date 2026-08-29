import styles from "./Popup.module.css";

/**
 * Shown once, right after a guest's drawn-but-unsaved plots come back after
 * login. Two distinct restore paths trigger it (see map-draw/page.tsx):
 *   1. The >GUEST_PLOT_LIMIT flow — GuestLimitPopup's login/register stashes
 *      the plots to sessionStorage (stashGuestDrawSnapshot) and restores them
 *      client-side after auth (the resumeLoadedRef effect). Never touches
 *      /api/plots/claim — these plots were only ever in React state.
 *   2. The post-login guest-project claim redirect — auth-context.tsx's
 *      refresh() -> POST /api/plots/claim -> 200 ->
 *      router.push(`/map-draw?project=...&action=calc`), for plots that were
 *      already auto-saved to the DB as a guest_key draft (e.g. via
 *      "ประมวลผล"). That redirect already gates on the claim call
 *      succeeding, so by the time this page can show the popup the 200 has
 *      been captured upstream.
 */
export function ClaimSuccessPopup({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={`${styles.iconCircle} ${styles.iconSuccess}`}>
          <i className="bi bi-check-circle-fill" />
        </div>
        <h3 className={styles.title}>นำเข้าข้อมูลแปลงสำเร็จ !!</h3>
        <p className={styles.desc}>
          นำเข้าข้อมูลแปลงที่วาดไปก่อนหน้านี้เข้าโครงการสำเร็จ 
          คุณสามารถวาดแปลงเพิ่มเติมและกดบันทึกเพื่ออัปเดตข้อมูลได้
        </p>
        <button onClick={onClose} className={`${styles.button} ${styles.buttonSuccess}`}>
          ตกลง
        </button>
      </div>
    </div>
  );
}
