"use client";

import { useEffect, useRef } from "react";
import {
  Chart,
  DoughnutController,
  ArcElement,
  Tooltip,
  Legend,
  type ChartItem,
} from "chart.js";
import type { Plot } from "@/lib/auth";

Chart.register(DoughnutController, ArcElement, Tooltip, Legend);

const PALETTE = [
  "rgba(132,169,140,0.8)",
  "rgba(82,121,111,0.8)",
  "rgba(58,78,64,0.8)",
  "rgba(168,201,177,0.8)",
  "rgba(97,140,99,0.8)",
];

export default function CarbonChart({ plots }: { plots: Plot[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current || plots.length === 0) return;
    const ctx = canvasRef.current.getContext("2d") as ChartItem;
    chartRef.current = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: plots.map((p) => (p.name as string) ?? ""),
        datasets: [
          {
            data: plots.map((p) => (p.carbonTotal as number) ?? 0),
            backgroundColor: PALETTE,
            borderColor: "rgba(132,169,140,0.3)",
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            labels: { color: "rgba(224,236,228,0.7)", font: { size: 11 } },
          },
        },
      },
    });
    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [plots]);

  if (plots.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: "rgba(224,236,228,0.35)" }}>
        <i
          className="bi bi-pie-chart"
          style={{ fontSize: 32, display: "block", marginBottom: 8 }}
        ></i>
        ยังไม่มีข้อมูลแปลง
      </div>
    );
  }

  return <canvas ref={canvasRef} height={250} />;
}
