"use client";

import { useState } from "react";
import styles from "./EditPlotModal.module.css";

// Single text-field edit modal — same look as EditPlotModal. Used from the
// list tables: renaming a project (claimed projects often still carry a
// default name) and editing a plot's ข้อมูลแปลง.
export function EditFieldModal({
  title, subtitle, label, icon, placeholder, value, required, requiredMessage, maxLength = 100,
  onClose, onSave, saving, error, isMobile,
}: {
  title: string;
  subtitle: string;
  label: string;
  icon: string;
  placeholder: string;
  value: string;
  required?: boolean;
  requiredMessage?: string;
  maxLength?: number;
  onClose: () => void;
  onSave: (value: string) => void;
  saving?: boolean;
  error?: string | null;
  isMobile: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const [localError, setLocalError] = useState<string | null>(null);
  const shownError = localError ?? error;

  const handleSaveClick = () => {
    const v = draft.trim();
    if (required && !v) { setLocalError(requiredMessage ?? "กรุณากรอกข้อมูล"); return; }
    if (v === value.trim()) { onClose(); return; }
    onSave(v);
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>

        {/* Header */}
        <div className={`${styles.header} ${isMobile ? styles.headerMobile : ""}`}>
          <div className={styles.headerRow}>
            <div className={styles.headerIcon}>
              <i className="bi bi-pencil-square" />
            </div>
            <div>
              <div className={styles.headerTitle}>{title}</div>
              <div className={styles.headerSubtitle}>{subtitle}</div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className={`${styles.body} ${isMobile ? styles.bodyMobile : ""}`}>
          <div className={styles.statusSection}>
            <label className={styles.fieldLabel}>
              <i className={`bi ${icon} ${styles.fieldLabelIcon}`} />
              <span>{label}</span>{required && <span className={styles.requiredMark}>*</span>}
            </label>
            <input
              type="text"
              autoFocus
              maxLength={maxLength}
              value={draft}
              onChange={e => { setDraft(e.target.value); setLocalError(null); }}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleSaveClick(); } }}
              placeholder={placeholder}
              disabled={saving}
              className={styles.input}
              style={{ paddingRight: 14 }}
            />
            {shownError && (
              <div className={styles.statusWarning}>
                <i className="bi bi-exclamation-circle-fill" /> {shownError}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className={`${styles.footer} ${isMobile ? styles.footerMobile : ""}`}>
          <button
            onClick={onClose}
            disabled={saving}
            className={`${styles.btnCancel} ${saving ? styles.btnDisabled : ""}`}
          >ยกเลิก</button>
          <button
            onClick={handleSaveClick}
            disabled={saving}
            className={`${styles.btnSave} ${saving ? styles.btnDisabled : ""}`}
          >
            {saving ? (
              <><i className={`bi bi-arrow-repeat ${styles.spinIcon}`} /> กำลังบันทึก...</>
            ) : (
              <><i className="bi bi-floppy-disk" /> บันทึก</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
