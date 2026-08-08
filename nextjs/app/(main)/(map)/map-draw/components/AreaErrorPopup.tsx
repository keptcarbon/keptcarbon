export type AreaError = { rai: number; sqm: number; tooSmall?: boolean };

export function AreaErrorPopup({ error, onClose }: { error: AreaError | null; onClose: () => void }) {
  if (!error) return null;
  return (
    <div className="mds-area-popup-overlay" onClick={onClose}>
      <div className="mds-area-popup" onClick={(e) => e.stopPropagation()}>
        <div className="mds-area-popup-icon">
          <i className="bi bi-exclamation-triangle-fill" />
        </div>
        <div className="mds-area-popup-content">
          <h3>{error.tooSmall ? "พื้นที่แปลงเล็กเกินไป" : "พื้นที่แปลงใหญ่เกินไป"}</h3>
          <p>
            ขนาดแปลงที่วาดคือ <strong>{error.rai.toFixed(2)} ไร่</strong> ({Math.round(error.sqm).toLocaleString()} ตร.ม.)
            {error.tooSmall
              ? <> ซึ่งน้อยกว่าเกณฑ์ขั้นต่ำ <strong>1 ไร่</strong></>
              : <> ซึ่งเกินกว่าเกณฑ์สูงสุด <strong>500 ไร่</strong></>
            }
          </p>
          <div className="mds-area-popup-hint">
            {error.tooSmall
              ? "กรุณาวาดแปลงใหม่ให้มีพื้นที่อย่างน้อย 1 ไร่"
              : "กรุณาปรับลดขอบเขตแปลง หรือแบ่งเป็นหลายแปลง"
            }
          </div>
        </div>
        <button className="mds-area-popup-close" onClick={onClose}>
          ตกลง
        </button>
      </div>
    </div>
  );
}