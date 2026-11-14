import { useEffect, useState } from "react";
import styles from "./Popup.module.css";

type ProjectSummary = { dbProjectId: number; projectName: string; plotCount: number };

/**
 * Shown when a logged-in user is at their role's project limit
 * (tbl_role_quota) and tries to start, save or claim one more project.
 * Lists their projects so they can soft-delete one right here; onFreed
 * fires after a delete succeeds so the caller can retry what was blocked
 * (e.g. claiming the guest draft). Cancel keeps everything as it is -- a
 * blocked guest draft stays a draft and is offered again next time.
 */
export function ProjectLimitPopup({
  open,
  limit,
  onClose,
  onFreed,
}: {
  open: boolean;
  limit: number | null;
  onClose: () => void;
  onFreed: () => void;
}) {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setProjects(null);
    setConfirmId(null);
    setError(null);
    fetch("/api/plots?summary=true", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { projects: [] }))
      .then((data) => setProjects(Array.isArray(data.projects) ? data.projects : []))
      .catch(() => setProjects([]));
  }, [open]);

  if (!open) return null;

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/plots/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      onFreed();
    } catch {
      setError("ลบโครงการไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setDeletingId(null);
      setConfirmId(null);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className={styles.closeBtn} aria-label="ปิด">
          <i className="bi bi-x-lg" style={{ fontSize: 16 }} />
        </button>
        <div className={styles.iconMinimal}>
          <i className="bi bi-folder2-open" />
        </div>
        <div className={styles.chip}>
          <i className="bi bi-info-circle" />
          <span>
            บัญชีของคุณสร้างได้สูงสุด <b>{limit ?? "-"} โครงการ</b>
          </span>
        </div>
        <p className={styles.desc}>
          ลบโครงการเดิม 1 โครงการเพื่อสร้างโครงการใหม่ หรือกดยกเลิกเพื่อเก็บไว้ตามเดิม
        </p>

        <div style={{ maxHeight: 240, overflowY: "auto", textAlign: "left", marginBottom: 14, border: "1px solid #e6f0ea", borderRadius: 12 }}>
          {projects === null && (
            <div style={{ padding: 16, textAlign: "center" }}>
              <div className="spinner-border spinner-border-sm text-success" role="status" />
            </div>
          )}
          {projects?.length === 0 && (
            <div style={{ padding: 16, textAlign: "center", fontSize: 13, color: "#5a7a65" }}>ไม่พบโครงการ</div>
          )}
          {projects?.map((p, i) => (
            <div
              key={p.dbProjectId}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderTop: i === 0 ? "none" : "1px solid #f1f5f9" }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#1a3d2b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.projectName}
                </div>
                <div style={{ fontSize: 12, color: "#5a7a65" }}>{p.plotCount} แปลง</div>
              </div>
              {confirmId === p.dbProjectId ? (
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={() => handleDelete(p.dbProjectId)}
                    disabled={deletingId !== null}
                    style={{ border: "none", borderRadius: 8, background: "#dc3545", color: "#fff", fontSize: 12, padding: "5px 10px", cursor: "pointer" }}
                  >
                    {deletingId === p.dbProjectId ? "กำลังลบ…" : "ยืนยันลบ"}
                  </button>
                  <button
                    onClick={() => setConfirmId(null)}
                    disabled={deletingId !== null}
                    style={{ border: "1px solid #e6f0ea", borderRadius: 8, background: "#fff", color: "#1a3d2b", fontSize: 12, padding: "5px 10px", cursor: "pointer" }}
                  >
                    ไม่ลบ
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmId(p.dbProjectId)}
                  disabled={deletingId !== null}
                  aria-label={`ลบโครงการ ${p.projectName}`}
                  style={{ border: "1px solid #f5c2c7", borderRadius: 8, background: "#fff", color: "#dc3545", fontSize: 12, padding: "5px 10px", cursor: "pointer" }}
                >
                  <i className="bi bi-trash3 me-1" />ลบ
                </button>
              )}
            </div>
          ))}
        </div>

        {error && <p className={styles.warningText}>{error}</p>}

        <button onClick={onClose} className={styles.buttonText}>
          ยกเลิก
        </button>
      </div>
    </div>
  );
}
