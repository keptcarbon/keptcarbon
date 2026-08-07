import styles from "./Popup.module.css";

export type ErrorPopupInfo = { title: string; desc: string };

export function ErrorPopup({ popup, onClose }: { popup: ErrorPopupInfo | null; onClose: () => void }) {
  if (!popup) return null;
  const isInfo = popup.title === "แจ้งเตือนข้อมูล";
  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={`${styles.iconCircle} ${isInfo ? styles.iconInfo : styles.iconError}`}>
          <i className={`bi ${isInfo ? "bi-info-circle-fill" : "bi-x-circle-fill"}`} />
        </div>
        <h3 className={styles.title}>
          {popup.title}
        </h3>
        <p className={styles.desc}>
          {popup.desc}
        </p>
        <button
          onClick={onClose}
          className={`${styles.button} ${isInfo ? styles.buttonInfo : styles.buttonError}`}
        >
          ตกลง
        </button>
      </div>
    </div>
  );
}