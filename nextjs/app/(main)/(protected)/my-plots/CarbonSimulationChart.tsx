"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { simulateCarbon, type SimulationYearlyPoint } from "@/lib/carbon-api";
import type { SimBaseRow } from "./simulationRequest";

const NET_ZERO_YEAR_CE = 2050;
const BE_OFFSET = 543;

const SLIDER_DEBOUNCE_MS = 500;

// Validated categorical slots (dataviz palette check: passes with secondary
// encoding) — each line also gets its own dash pattern + end label. Short
// labels name the replanting rate, not "max/min": above 100% the simulated
// line rises over the 100% one.
const SERIES = [
  { key: "carbon_stock_upper_tCO2e", label: "ปลูกทดแทน 100%", short: "100%", color: "#2a78d6", dash: "7 5" },
  { key: "carbon_stock_tCO2e", label: "ตามค่าที่ตั้ง", short: "จำลอง", color: "#1e7a47", dash: undefined },
  { key: "carbon_stock_lower_tCO2e", label: "ไม่ปลูกทดแทน (0%)", short: "0%", color: "#eb6834", dash: "2 4" },
] as const;
type SeriesKey = (typeof SERIES)[number]["key"];

const fmt = (v: number) => Math.round(v).toLocaleString("th-TH");

/** Round the axis max up to a 1/2/5 × 10^n step so gridlines land on clean numbers. */
function niceTicks(max: number, count = 5) {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
}

function SliderField({ label, value, min, max, step = 1, unit, onChange, ticks }: {
  label: string; value: number; min: number; max: number; step?: number; unit: string;
  onChange: (v: number) => void; ticks: number[];
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 220 }}>
      <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 13, fontWeight: 700, color: "#17603a" }}>
        {label}
        <span style={{ background: "#fff", border: "1px solid rgba(30,122,71,0.25)", borderRadius: 8, padding: "2px 10px", fontSize: 14, fontWeight: 800, color: "#1e7a47" }}>
          {value} {unit}
        </span>
      </span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Math.round(Number(e.target.value)))}
        style={{ width: "100%", accentColor: "#1e7a47", cursor: "pointer", margin: 0 }}
      />
      <span style={{ position: "relative", height: 14, fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>
        {ticks.map((t) => (
          <span key={t} style={{ position: "absolute", left: `calc(8px + ${(t - min) / (max - min)} * (100% - 16px))`, transform: "translateX(-50%)" }}>{t}</span>
        ))}
      </span>
    </label>
  );
}

export function CarbonSimulationChart({ baseRows, isMobile, unitLabel = "แปลง" }: {
  /** Cohort rows from the plot's assessment (buildSimRows); sliders add rotation/replanting. */
  baseRows: SimBaseRow[];
  isMobile?: boolean;
  /** What the totals are per, shown in the chart title (tCO₂eq/<unitLabel>). */
  unitLabel?: string;
}) {
  const [rotationYear, setRotationYear] = useState(35);
  const [replantingPct, setReplantingPct] = useState(100);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [data, setData] = useState<SimulationYearlyPoint[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The page rebuilds baseRows every render — key the fetch on content, not identity.
  const rowsKey = JSON.stringify(baseRows);
  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    // Debounced so dragging a slider sends one request, not one per step;
    // the previous profile stays on screen until the new one lands.
    const timer = setTimeout(() => {
      const rows = (JSON.parse(rowsKey) as SimBaseRow[]).map((r) => ({
        ...r, rotation_year: rotationYear, replanting_rate: replantingPct / 100,
      }));
      simulateCarbon(rows, ctrl.signal)
        .then((res) => {
          setData(res.carbon_stock_tCO2e_simulation ?? []);
          setError(null);
        })
        .catch((e) => {
          if (ctrl.signal.aborted) return;
          setError(e instanceof Error ? e.message : String(e));
        })
        .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    }, SLIDER_DEBOUNCE_MS);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [rowsKey, rotationYear, replantingPct]);

  const H = isMobile ? 300 : 380;

  return (
    <div style={{ background: "#edfaf3", borderRadius: 16, border: "1px solid rgba(30,122,71,0.15)", padding: isMobile ? "14px 12px 10px" : "18px 20px 14px", boxShadow: "0 10px 30px -5px rgba(30,122,71,0.12)" }}>
      {/* Scenario controls */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: isMobile ? 14 : 32, marginBottom: 16 }}>
        <SliderField label="รอบการปลูก (Rotation)" value={rotationYear} min={15} max={35} unit="ปี"
          onChange={setRotationYear} ticks={[15, 20, 25, 30, 35]} />
        <SliderField label="อัตราการปลูกทดแทน (Replanting)" value={replantingPct} min={0} max={200} unit="%"
          onChange={setReplantingPct} ticks={[0, 50, 100, 150, 200]} />
      </div>

      <div style={{ textAlign: "center", fontSize: isMobile ? 14 : 16, fontWeight: 800, color: "#17603a" }}>
        ปริมาณคาร์บอนกักเก็บจำลอง (tCO₂eq/{unitLabel})
      </div>

      {/* Legend */}
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: isMobile ? "4px 14px" : "4px 22px", margin: "6px 0 4px", fontSize: 12, color: "#475569", fontWeight: 600 }}>
        {SERIES.map((s) => (
          <span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <svg width="26" height="8" aria-hidden="true"><line x1="1" y1="4" x2="25" y2="4" stroke={s.color} strokeWidth={s.dash ? 2 : 3} strokeDasharray={s.dash} strokeLinecap="round" /></svg>
            {s.label}
          </span>
        ))}
      </div>

      <div ref={wrapRef} style={{ position: "relative", width: "100%", height: H }}>
        {width > 0 && data && data.length > 0 && <SimulationPlot data={data} width={width} height={H} isMobile={isMobile} />}
        {!data && !error && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: "#5a7a65", fontSize: 13, fontWeight: 600 }}>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> กำลังคำนวณ...
          </div>
        )}
        {error && (
          <div role="alert" style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, padding: 16, textAlign: "center", background: data ? "rgba(237,250,243,0.85)" : undefined }}>
            <i className="bi bi-exclamation-triangle" style={{ fontSize: 24, color: "#ef4444" }} />
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b" }}>ไม่สามารถจำลองคาร์บอนได้</div>
            <div style={{ fontSize: 12, color: "#64748b", maxWidth: 420 }}>{error}</div>
          </div>
        )}
        {loading && data && !error && (
          <div style={{ position: "absolute", top: 0, right: 0, display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#5a7a65", fontWeight: 600 }}>
            <Loader2 className="size-3 animate-spin" aria-hidden="true" /> กำลังคำนวณ...
          </div>
        )}
      </div>
    </div>
  );
}

/** The SVG plot + hover layer; only mounted once a profile has arrived. */
function SimulationPlot({ data, width, height: H, isMobile }: {
  data: SimulationYearlyPoint[];
  width: number;
  height: number;
  isMobile?: boolean;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const PL = isMobile ? 44 : 60;
  const PR = isMobile ? 52 : 70;
  const PT = 34;
  const PB = 40;
  const iW = Math.max(0, width - PL - PR);
  const iH = H - PT - PB;

  const minAt = data[0].year_at;
  const maxAt = data[data.length - 1].year_at;
  const yMax = Math.max(1, ...data.flatMap((d) => SERIES.map((s) => d[s.key])));
  const yTicks = niceTicks(yMax, isMobile ? 4 : 5);
  const yTop = yTicks[yTicks.length - 1];

  const xOf = (yearAt: number) => PL + ((yearAt - minAt) / (maxAt - minAt)) * iW;
  const yOf = (v: number) => PT + iH - (v / yTop) * iH;
  const pathFor = (key: SeriesKey) =>
    data.map((d, i) => `${i ? "L" : "M"}${xOf(d.year_at).toFixed(1)},${yOf(d[key]).toFixed(1)}`).join(" ");

  const currentYear = data.find((d) => d.year_at === 0)!.year;
  const netZeroAt = NET_ZERO_YEAR_CE - currentYear;
  const xTickStep = iW < 420 ? 20 : 10;
  const xTicks = data.filter((d) => d.year_at % xTickStep === 0);

  // End-of-line labels, nudged apart so equal values (e.g. overlapping lines) don't collide.
  const last = data[data.length - 1];
  const endLabels = SERIES.map((s) => ({ ...s, y: yOf(last[s.key]) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < endLabels.length; i++) {
    if (endLabels[i].y - endLabels[i - 1].y < 14) endLabels[i].y = endLabels[i - 1].y + 14;
  }

  const handlePointer = (e: React.PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const at = minAt + ((e.clientX - box.left) / box.width) * (maxAt - minAt);
    setHoverIdx(Math.max(0, Math.min(data.length - 1, Math.round(at - minAt))));
  };
  const hovered = hoverIdx !== null ? data[hoverIdx] : null;

  return (
    <>
          <svg width={width} height={H} role="img" aria-label="กราฟจำลองปริมาณคาร์บอนกักเก็บ 3 สถานการณ์ ตั้งแต่ 35 ปีก่อนถึง 35 ปีข้างหน้า" style={{ display: "block", overflow: "visible" }}>
            {/* Past region */}
            <rect x={PL} y={PT} width={xOf(0) - PL} height={iH} fill="rgba(100,116,139,0.06)" />

            {/* Y grid + labels */}
            {yTicks.map((t) => (
              <g key={t}>
                <line x1={PL} x2={PL + iW} y1={yOf(t)} y2={yOf(t)} stroke="rgba(0,0,0,0.07)" strokeDasharray={t ? "3 4" : undefined} />
                <text x={PL - 8} y={yOf(t) + 4} textAnchor="end" fontSize={11} fill="#64748b">{fmt(t)}</text>
              </g>
            ))}

            {/* X ticks (BE years, every 10/20 years around the current year) */}
            {xTicks.map((d) => (
              <text key={d.year_at} x={xOf(d.year_at)} y={PT + iH + 18} textAnchor="middle" fontSize={11}
                fill={d.year_at === 0 ? "#17603a" : "#64748b"} fontWeight={d.year_at === 0 ? 800 : 500}>
                {d.year + BE_OFFSET}
              </text>
            ))}
            <text x={PL + iW / 2} y={PT + iH + 36} textAnchor="middle" fontSize={11} fill="#94a3b8">พ.ศ.</text>

            {/* Current-year marker */}
            <line x1={xOf(0)} x2={xOf(0)} y1={PT} y2={PT + iH} stroke="#475569" strokeWidth={1.5} />
            <text x={xOf(0)} y={PT - 8} textAnchor="middle" fontSize={11} fontWeight={700} fill="#475569">ปัจจุบัน</text>

            {/* Net-zero target marker */}
            {netZeroAt >= minAt && netZeroAt <= maxAt && (
              <g>
                <line x1={xOf(netZeroAt)} x2={xOf(netZeroAt)} y1={PT} y2={PT + iH} stroke="#0f766e" strokeWidth={1.5} strokeDasharray="5 3" />
                <text x={xOf(netZeroAt)} y={PT - 8} textAnchor="middle" fontSize={11} fontWeight={800} fill="#0f766e">
                  Net Zero {NET_ZERO_YEAR_CE + BE_OFFSET}
                </text>
              </g>
            )}

            {/* Lines — central drawn last so it sits on top where scenarios overlap */}
            {[SERIES[2], SERIES[0], SERIES[1]].map((s) => (
              <path key={s.key} d={pathFor(s.key)} fill="none" stroke={s.color} strokeWidth={s.dash ? 2 : 2.5}
                strokeDasharray={s.dash} strokeLinejoin="round" strokeLinecap="round" />
            ))}

            {/* Direct labels at line ends */}
            {endLabels.map((s) => (
              <text key={s.key} x={PL + iW + 6} y={s.y + 4} fontSize={11} fontWeight={700} fill="#334155">
                <tspan fill={s.color}>●</tspan> {s.short}
              </text>
            ))}

            {/* Hover crosshair */}
            {hovered && (
              <g style={{ pointerEvents: "none" }}>
                <line x1={xOf(hovered.year_at)} x2={xOf(hovered.year_at)} y1={PT} y2={PT + iH} stroke="#334155" strokeWidth={1} opacity={0.5} />
                {SERIES.map((s) => (
                  <circle key={s.key} cx={xOf(hovered.year_at)} cy={yOf(hovered[s.key])} r={4.5} fill={s.color} stroke="#edfaf3" strokeWidth={2} />
                ))}
              </g>
            )}

            <rect x={PL} y={PT} width={iW} height={iH} fill="transparent" style={{ cursor: "crosshair", touchAction: "pan-y" }}
              onPointerMove={handlePointer} onPointerDown={handlePointer} onPointerLeave={() => setHoverIdx(null)} />
          </svg>

        {/* Tooltip */}
        {hovered && (() => {
          const x = xOf(hovered.year_at);
          const tipW = 190;
          const left = Math.min(Math.max(x + (x > width / 2 ? -tipW - 12 : 12), 0), width - tipW);
          return (
            <div style={{ position: "absolute", left, top: PT, width: tipW, pointerEvents: "none", background: "#082f20", color: "#fff", borderRadius: 8, padding: "8px 12px", boxShadow: "0 4px 16px rgba(0,0,0,0.35)", fontSize: 12 }}>
              <div style={{ fontWeight: 800, marginBottom: 4 }}>
                พ.ศ. {hovered.year + BE_OFFSET}
                <span style={{ fontWeight: 500, opacity: 0.7 }}> ({hovered.year_at > 0 ? "+" : ""}{hovered.year_at} ปี)</span>
              </div>
              {SERIES.map((s) => (
                <div key={s.key} style={{ display: "flex", justifyContent: "space-between", gap: 8, lineHeight: 1.6 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, opacity: 0.85 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 4, background: s.color }} />{s.short}
                  </span>
                  <strong>{fmt(hovered[s.key])}</strong>
                </div>
              ))}
              <div style={{ marginTop: 4, paddingTop: 4, borderTop: "1px solid rgba(255,255,255,0.15)", opacity: 0.75 }}>
                จำนวนต้น (จำลอง): {hovered.tree_count.toLocaleString("th-TH")} ต้น
              </div>
            </div>
          );
        })()}
    </>
  );
}
