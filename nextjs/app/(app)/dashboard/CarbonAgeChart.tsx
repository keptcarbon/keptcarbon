"use client";

import type { AgeBucket } from "./CarbonDonutChart";

const BUCKET_STYLE: Record<string, { fill: string; bar: string; text: string; icon: string }> = {
  "1-5":   { fill: "#dcfce7", bar: "#4ade80", text: "#14532d", icon: "🌱" },
  "6-12":  { fill: "#bbf7d0", bar: "#22c55e", text: "#14532d", icon: "🌿" },
  "13-18": { fill: "#86efac", bar: "#16a34a", text: "#052e16", icon: "🌳" },
  "19+":   { fill: "#4ade80", bar: "#166534", text: "#052e16", icon: "🌲" },
  "ไม่ระบุ": { fill: "#f3f4f6", bar: "#9ca3af", text: "#374151", icon: "❓" },
};

const LABEL: Record<string, string> = {
  "1-5":   "1–5 ปี",
  "6-12":  "6–12 ปี",
  "13-18": "13–18 ปี",
  "19+":   "19+ ปี",
  "ไม่ระบุ": "ไม่ระบุ",
};

export default function CarbonAgeChart({ buckets }: { buckets: AgeBucket[] }) {
  const nonEmpty = buckets.filter((b) => b.carbon > 0 || b.plotCount > 0);
  const maxCarbon = Math.max(...nonEmpty.map((b) => b.carbon), 1);

  if (!nonEmpty.length) {
    return (
      <div className="dv2-chart-empty">
        <i className="bi bi-bar-chart-line" />
        <p>ยังไม่มีข้อมูลคาร์บอนในระบบ</p>
      </div>
    );
  }

  return (
    <div className="dv3-hbar-container">
      {nonEmpty.map((b) => {
        const style = BUCKET_STYLE[b.bucket] ?? BUCKET_STYLE["ไม่ระบุ"];
        const pct = (b.carbon / maxCarbon) * 100;
        const label = LABEL[b.bucket] ?? b.bucket;

        return (
          <div key={b.bucket} className="dv3-hbar-row">
            {/* Label column */}
            <div className="dv3-hbar-label">
              <span className="dv3-hbar-icon">{style.icon}</span>
              <span>{label}</span>
            </div>

            {/* Bar track */}
            <div className="dv3-hbar-track">
              <div
                className="dv3-hbar-fill"
                style={{
                  width: `${pct}%`,
                  background: `linear-gradient(90deg, ${style.fill}, ${style.bar})`,
                }}
              >
                {pct > 20 && (
                  <span className="dv3-hbar-inline-val" style={{ color: style.text }}>
                    {b.carbon.toLocaleString("th-TH", {
                      maximumFractionDigits: 0,
                    })}{" "}
                    tCO₂
                  </span>
                )}
              </div>
              {pct <= 20 && (
                <span className="dv3-hbar-outside-val">
                  {b.carbon.toLocaleString("th-TH", { maximumFractionDigits: 0 })} tCO₂
                </span>
              )}
            </div>

            {/* Plot count */}
            <div className="dv3-hbar-count">
              {b.plotCount.toLocaleString("th-TH")}
              <span className="dv3-hbar-count-unit"> แปลง</span>
            </div>
          </div>
        );
      })}

      {/* Carbon scale footnote */}
      <div className="dv3-hbar-footnote">
        <i className="bi bi-info-circle" />
        แกนแสดงปริมาณ CO₂ สะสม (tCO₂) ต่อช่วงอายุยาง
      </div>
    </div>
  );
}
