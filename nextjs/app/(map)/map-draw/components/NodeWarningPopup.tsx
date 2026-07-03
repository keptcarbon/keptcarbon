export function NodeWarningPopup({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="mds-node-warn-overlay" onClick={onClose}>
      <div className="mds-node-warn-popup" onClick={(e) => e.stopPropagation()}>
        <div className="mds-node-warn-icon">
          <i className="bi bi-pentagon-fill" />
          <span className="mds-node-warn-badge">3+</span>
        </div>
        <div className="mds-node-warn-content">
          <h3>ไม่สามารถลบจุดได้</h3>
          <p>แปลงที่วาดต้องมีอย่างน้อย 3 จุด<br />จึงจะสร้างพื้นที่แปลงได้</p>
        </div>
        <button className="mds-node-warn-btn" onClick={onClose}>
          รับทราบ
        </button>
      </div>
    </div>
  );
}