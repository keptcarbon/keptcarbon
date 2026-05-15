"use client";

import { useEffect, useRef } from "react";
import {
  Chart,
  DoughnutController,
  ArcElement,
  Tooltip,
  type ChartItem,
} from "chart.js";

Chart.register(DoughnutController, ArcElement, Tooltip);

export type AgeBucket = { bucket: string; plotCount: number; carbon: number };

const COLORS = ["#4ade80", "#22c55e", "#16a34a", "#166534", "#d1fae5"];
const LABEL_MAP: Record<string, string> = {
  "1-5":   "1–5 ปี",
  "6-12":  "6–12 ปี",
  "13-18": "13–18 ปี",
  "19+":   "19+ ปี",
  "ไม่ระบุ": "ไม่ระบุ",
};

export default function CarbonDonutChart({
  buckets,
  total,
}: {
  buckets: AgeBucket[];
  total: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  const nonEmpty = buckets.filter((b) => b.plotCount > 0);

  useEffect(() => {
    if (!canvasRef.current || !nonEmpty.length) return;
    chartRef.current?.destroy();

    const ctx = canvasRef.current.getContext("2d") as ChartItem;
    chartRef.current = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: nonEmpty.map((b) => LABEL_MAP[b.bucket] ?? b.bucket),
        datasets: [
          {
            data: nonEmpty.map((b) => b.plotCount),
            backgroundColor: nonEmpty.map((_, i) => COLORS[i % COLORS.length]),
            borderWidth: 3,
            borderColor: "#ffffff",
            hoverOffset: 8,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "70%",
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(15,45,28,0.92)",
            titleColor: "#4ade80",
            bodyColor: "#d1fae5",
            padding: 12,
            cornerRadius: 10,
            callbacks: {
              label: (ctx) => {
                const val = ctx.parsed as number;
                const pct = total > 0 ? ((val / total) * 100).toFixed(1) : "0";
                return ` ${val.toLocaleString("th-TH")} แปลง (${pct}%)`;
              },
            },
          },
        },
      },
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buckets, total]);

  if (!nonEmpty.length) {
    return (
      <div className="dv2-chart-empty">
        <i className="bi bi-pie-chart" />
        <p>ยังไม่มีข้อมูลในระบบ</p>
      </div>
    );
  }

  return (
    <div className="dv3-donut-wrap">
      {/* Canvas with centred total */}
      <div className="dv3-donut-canvas-box">
        <canvas ref={canvasRef} />
        <div className="dv3-donut-center">
          <span className="dv3-donut-center-val">
            {total.toLocaleString("th-TH")}
          </span>
          <span className="dv3-donut-center-label">แปลง</span>
        </div>
      </div>

      {/* Legend */}
      <div className="dv3-donut-legend">
        {nonEmpty.map((b, i) => {
          const pct = total > 0 ? ((b.plotCount / total) * 100).toFixed(1) : "0";
          return (
            <div key={b.bucket} className="dv3-donut-legend-row">
              <span
                className="dv3-donut-dot"
                style={{ background: COLORS[i % COLORS.length] }}
              />
              <span className="dv3-donut-legend-label">
                {LABEL_MAP[b.bucket] ?? b.bucket}
              </span>
              <span className="dv3-donut-legend-count">
                {b.plotCount.toLocaleString("th-TH")}
              </span>
              <span className="dv3-donut-legend-pct">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
