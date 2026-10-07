"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  simulateEconomics,
  type CarbonEconomicsResponse,
  type EconomicsCosts,
  type EconomicsScheduleYear,
} from "@/lib/carbon-api";
import type { SimBaseRow } from "./simulationRequest";
import { fmtTick, niceSignedTicks } from "./CarbonSimulationChart";
import { PlantStatusIcon } from "./PlantStatusIcon";
import { formatArea } from "@/lib/utils";

const BE_OFFSET = 543;
const INPUT_DEBOUNCE_MS = 500;
/** A plot below this fraction of the project's credits/rai is flagged as low-yield. */
const LOW_YIELD_RATIO = 0.5;
const CREDITING_YEARS = 7;

const DEFAULT_PRICE = 300; // บาท/tCO₂eq
const FREQUENCIES = [1, 2, 3, 7];
const DEFAULT_COSTS: EconomicsCosts = {
  pdd: 400_000,
  validation: 200_000,
  monitoring_per_round: 400_000,
  verification_per_round: 200_000,
};
const DEFAULT_RATE_PCT = 5;
const DEFAULT_FREQUENCY = 7;

/** Years (1..7) holding a verification round: k, 2k, … < 7, plus year 7 (mirrors the backend). */
const verificationYears = (every: number) => {
  const years: number[] = [];
  for (let y = every; y < CREDITING_YEARS; y += every) years.push(y);
  return [...years, CREDITING_YEARS];
};

type OnceCosts = { pdd: number; validation: number };
type Round = { price: number; monitoring: number; verification: number };
/** Verification rounds keyed by year (1..7); a year without a key has no MRV. */
type Rounds = Record<number, Round>;

const DEFAULT_ONCE: OnceCosts = { pdd: DEFAULT_COSTS.pdd, validation: DEFAULT_COSTS.validation };
const DEFAULT_ROUND: Round = {
  price: DEFAULT_PRICE,
  monitoring: DEFAULT_COSTS.monitoring_per_round,
  verification: DEFAULT_COSTS.verification_per_round,
};
const roundYears = (rounds: Rounds) => Object.keys(rounds).map(Number).sort((a, b) => a - b);
/** The every-k preset these years match, or null for a custom pattern. */
const matchPreset = (years: number[]) =>
  FREQUENCIES.find((k) => verificationYears(k).join() === years.join()) ?? null;
/** Values for a newly added round: copy the nearest earlier round, else the next one, else defaults. */
const templateFor = (rounds: Rounds, year: number): Round => {
  const years = roundYears(rounds);
  const prev = years.filter((y) => y < year).pop();
  const next = years.find((y) => y > year);
  const from = prev ?? next;
  return { ...(from != null ? rounds[from] : DEFAULT_ROUND) };
};

// Polarity pair shared with the net-annual carbon chart.
const GAIN = "#1e7a47";
const LOSS = "#eb6834";
const INK = "#17603a";

const fmt = (v: number, digits = 0) => v.toLocaleString("th-TH", { maximumFractionDigits: digits, minimumFractionDigits: digits });
/** Carbon tonnes are always shown rounded down (TGO convention); credits from the backend are already whole. */
const fmtTonnes = (v: number) => fmt(Math.floor(v + 1e-9));
const fmtBaht = (v: number) => (Math.abs(v) >= 1_000_000 ? `${fmt(v / 1_000_000, 2)} ล้าน` : fmt(v));
const signed = (v: number, f: (n: number) => string = fmtBaht) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${f(Math.abs(v))}`;
const pct = (v: number) => `${fmt(v * 100, 1)}%`;

const label: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: INK };
const fieldLabel: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "#475569" };
const ghostButton: React.CSSProperties = {
  height: 32, padding: "0 12px", borderRadius: 8, border: "1px solid rgba(30,122,71,0.25)", background: "#fff",
  color: INK, fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
};
const numberInput: React.CSSProperties = {
  width: "100%", height: 38, padding: "0 10px", borderRadius: 8, border: "1px solid rgba(30,122,71,0.25)",
  background: "#fff", fontSize: 14, fontWeight: 600, color: "#1e293b", textAlign: "right",
};

export function EconomicSimulationPanel({ baseRows, isMobile, showPlots = false, showAgeMatrix = false, plantStatusById }: {
  /** Cohort rows from the assessment (buildSimRows / buildProjectSimRows). */
  baseRows: SimBaseRow[];
  isMobile?: boolean;
  /** Show the per-plot breakdown (project level). */
  showPlots?: boolean;
  /** plot_id → SavedPlot.plantStatus, for the icon in the per-plot table. */
  plantStatusById?: Record<string, string | undefined>;
  /** Show min viable area by starting age — a project-planning view, not useful for a single existing plot. */
  showAgeMatrix?: boolean;
}) {
  const [once, setOnce] = useState<OnceCosts>(DEFAULT_ONCE);
  const [rounds, setRounds] = useState<Rounds>(() =>
    Object.fromEntries(verificationYears(DEFAULT_FREQUENCY).map((y) => [y, { ...DEFAULT_ROUND }])));
  const [rateText, setRateText] = useState(String(DEFAULT_RATE_PCT));
  const [openYear, setOpenYear] = useState<number | null>(null);

  const [data, setData] = useState<CarbonEconomicsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const years = roundYears(rounds);
  const preset = matchPreset(years);
  const startYear = new Date().getFullYear();

  // A preset replaces the MRV years; years kept from before keep their values.
  const applyPreset = (k: number) => {
    setRounds((prev) => Object.fromEntries(verificationYears(k).map((y) => [y, prev[y] ?? templateFor(prev, y)])));
    setOpenYear(null);
  };
  const saveRound = (year: number, round: Round) => setRounds((prev) => ({ ...prev, [year]: round }));
  const removeRound = (year: number) => setRounds((prev) => {
    const next = { ...prev };
    delete next[year];
    return next;
  });
  const resetAll = () => {
    setOnce(DEFAULT_ONCE);
    setRounds(Object.fromEntries(verificationYears(DEFAULT_FREQUENCY).map((y) => [y, { ...DEFAULT_ROUND }])));
    setRateText(String(DEFAULT_RATE_PCT));
    setOpenYear(null);
  };

  const rate = Number(rateText);
  const rateValid = rateText.trim() !== "" && Number.isFinite(rate) && rate >= 0 && rate <= 100;
  const requestKey = rateValid ? JSON.stringify({ once, rounds, rate }) : null;

  // Pages rebuild baseRows every render — key the fetch on content, not identity.
  const rowsKey = JSON.stringify(baseRows);
  useEffect(() => {
    if (!requestKey) return;
    const ctrl = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      const q = JSON.parse(requestKey) as { once: OnceCosts; rounds: Rounds; rate: number };
      simulateEconomics({
        rows: JSON.parse(rowsKey),
        costs: { ...DEFAULT_COSTS, ...q.once },
        price_thb_per_tCO2e: DEFAULT_PRICE,
        // `rounds` sets the verification years; this only names the default pattern.
        verify_every_years: DEFAULT_FREQUENCY,
        rounds: roundYears(q.rounds).map((y) => ({
          year_at: y,
          price_thb_per_tCO2e: q.rounds[y].price,
          monitoring_cost: q.rounds[y].monitoring,
          verification_cost: q.rounds[y].verification,
        })),
        discount_rate: q.rate / 100,
        compare_frequencies: FREQUENCIES,
      }, ctrl.signal)
        .then((res) => { setData(res); setError(null); })
        .catch((e) => {
          if (ctrl.signal.aborted) return;
          setError(e instanceof Error ? e.message : String(e));
        })
        .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    }, INPUT_DEBOUNCE_MS);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [rowsKey, requestKey]);

  const r = data?.result;
  // Per-year results, only while the last response matches the current MRV years.
  const resultByYear = r && r.verification_years.join() === years.join()
    ? new Map(r.schedule.map((s) => [s.year_at, s]))
    : null;
  const onceTotal = once.pdd + once.validation;
  const roundTotal = years.reduce((sum, y) => sum + rounds[y].monitoring + rounds[y].verification, 0);

  return (
    <div style={{ background: "#edfaf3", borderRadius: 16, border: "1px solid rgba(30,122,71,0.15)", padding: isMobile ? "14px 12px" : "18px 20px", boxShadow: "0 10px 30px -5px rgba(30,122,71,0.12)", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 12, color: "#5a7a65", fontWeight: 600 }}>
        จำลองโครงการ T-VER ระยะเวลา {CREDITING_YEARS} ปี : เริ่มโ่ครงการปีนี้และไม่ตัดหรือปลูกทดแทนระหว่างโครงการ
      </div>

      {/* ── Scenario: preset pattern + discount rate ── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 200px", maxWidth: isMobile ? undefined : 260 }}>
          <span style={label}>รูปแบบการทวนสอบ (MRV)</span>
          <select value={preset ?? "custom"} onChange={(e) => e.target.value !== "custom" && applyPreset(Number(e.target.value))}
            style={{ ...numberInput, textAlign: "left", cursor: "pointer" }}>
            {FREQUENCIES.map((k) => (
              <option key={k} value={k}>ทุก {k} ปี ({verificationYears(k).length} ครั้ง)</option>
            ))}
            <option value="custom" disabled>กำหนดเอง ({years.length} ครั้ง)</option>
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 160px", maxWidth: isMobile ? undefined : 200 }}>
          <span style={label}>อัตราคิดลด (%/ปี) สำหรับ NPV</span>
          <input type="number" inputMode="decimal" min={0} max={100} step={0.5} value={rateText} aria-invalid={!rateValid}
            onChange={(e) => setRateText(e.target.value)}
            style={{ ...numberInput, borderColor: rateValid ? undefined : "#ef4444" }} />
        </label>
      </div>

      {/* ── Timeline: year 0 = registration costs, 1..7 = optional MRV rounds ── */}
      <div>
        <div style={{ fontSize: 12, color: "#5a7a65", fontWeight: 600, marginBottom: 8 }}>
          คลิกที่ปีเพื่อกรอกต้นทุนหรือราคาขาย — ปีที่ไม่มี MRV จะไม่มีการขายเครดิต
        </div>
        <Timeline startYear={startYear} once={once} rounds={rounds} openYear={openYear} resultByYear={resultByYear}
          isMobile={isMobile}
          onOpen={(y) => setOpenYear((cur) => (cur === y ? null : y))}
          onClearOnce={() => setOnce({ pdd: 0, validation: 0 })}
          onRemoveRound={(y) => { removeRound(y); if (openYear === y) setOpenYear(null); }} />
        {openYear != null && (
          <YearEditor key={openYear} year={openYear} startYear={startYear} isMobile={isMobile}
            once={once} round={rounds[openYear] ?? null} template={templateFor(rounds, openYear)}
            onSaveOnce={(v) => { setOnce(v); setOpenYear(null); }}
            onSaveRound={(v) => { saveRound(openYear, v); setOpenYear(null); }}
            onRemoveRound={() => { removeRound(openYear); setOpenYear(null); }}
            onClose={() => setOpenYear(null)} />
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 13, color: INK }}>
        <span>
          ต้นทุนรวมตลอดโครงการ <strong style={{ fontSize: 15 }}>{fmtBaht(onceTotal + roundTotal)} บาท</strong>
          <span style={{ color: "#5a7a65" }}> (ขึ้นทะเบียน {fmtBaht(onceTotal)} + ทวนสอบ {years.length} ครั้ง {fmtBaht(roundTotal)})</span>
        </span>
        <button type="button" onClick={resetAll} style={ghostButton}>
          <i className="bi bi-arrow-counterclockwise" aria-hidden="true" style={{ marginRight: 4 }} />คืนค่าเริ่มต้น
        </button>
      </div>

      {/* ── Results ── */}
      {!data && !error && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 40, color: "#5a7a65", fontSize: 13, fontWeight: 600 }}>
          <Loader2 className="size-4 animate-spin" aria-hidden="true" /> กำลังคำนวณ...
        </div>
      )}
      {error && (
        <div role="alert" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: 16, textAlign: "center" }}>
          <i className="bi bi-exclamation-triangle" style={{ fontSize: 24, color: "#ef4444" }} />
          <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b" }}>ไม่สามารถคำนวณความคุ้มค่าได้</div>
          <div style={{ fontSize: 12, color: "#64748b", maxWidth: 420 }}>{error}</div>
        </div>
      )}
      {data && r && (
        <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 16, opacity: loading ? 0.6 : 1, transition: "opacity 0.15s" }}>
          {loading && (
            <div style={{ position: "absolute", top: -4, right: 0, display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#5a7a65", fontWeight: 600 }}>
              <Loader2 className="size-3 animate-spin" aria-hidden="true" /> กำลังคำนวณ...
            </div>
          )}

          <SummaryTiles data={data} isMobile={isMobile} />

          <Card title="กระแสเงินสดรายปี (บาท)" subtitle="แท่ง = เงินสดสุทธิในปีนั้น, เส้น = เงินสดสะสม">
            <CashFlowChart schedule={r.schedule} isMobile={isMobile} />
          </Card>

          <Card title="เปรียบเทียบความถี่การทวนสอบ"
            subtitle={`ความถี่อื่นใช้ราคาขายเฉลี่ย ${fmt(r.price_thb_per_tCO2e, 2)} บาท/tCO₂eq และต้นทุนเฉลี่ยต่อรอบจากรอบที่ตั้งไว้ — คลิกแถวเพื่อเลือก`}>
            <FrequencyTable data={data} selected={preset} onSelect={applyPreset} />
          </Card>

          {showPlots && data.plots.length > 0 && (
            <Card title="คาร์บอนเครดิตรายแปลง" subtitle="เรียงตามเครดิต — สัดส่วนของแต่ละแปลงในเครดิตและรายได้ของโครงการ">
              <PlotTable data={data} isMobile={isMobile} plantStatusById={plantStatusById} />
            </Card>
          )}

          {showAgeMatrix && (
            <Card title="พื้นที่ขั้นต่ำตามอายุยางเมื่อเริ่มโครงการ (ไร่)"
              subtitle={`ต้นทุนรวม ${fmtBaht(r.total_cost_thb)} บาท, ราคาเฉลี่ย ${fmt(r.price_thb_per_tCO2e, 2)} บาท/tCO₂eq — เส้นประ = พื้นที่ปัจจุบัน ${formatArea(data.total_area_rai)} ไร่`}>
              <AgeMatrixChart data={data} isMobile={isMobile} />
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section style={{ background: "#fff", borderRadius: 12, border: "1px solid rgba(30,122,71,0.12)", padding: "12px 14px" }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: INK }}>{title}</div>
      {subtitle && <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{subtitle}</div>}
      <div style={{ marginTop: 10 }}>{children}</div>
    </section>
  );
}

function SummaryTiles({ data, isMobile }: { data: CarbonEconomicsResponse; isMobile?: boolean }) {
  const r = data.result;
  const payback = r.payback_year_at;
  const tiles: { label: string; value: string; sub?: string | (string | null)[]; tone?: "good" | "bad" }[] = [
    {
      label: "ความคุ้มค่าของโครงการ",
      value: r.is_viable ? "คุ้มทุน" : "ไม่คุ้มทุน",
      sub: `กำไรสุทธิ ${signed(r.net_profit_thb)} บาท`,
      tone: r.is_viable ? "good" : "bad",
    },
    {
      label: "ราคาขายคุ้มทุน",
      value: r.break_even_price_thb != null ? `${fmt(r.break_even_price_thb, 2)} บาท` : "–",
      sub: [
        // Price at which NPV = 0: later credits are worth less, so it sits above the plain break-even.
        r.discounted_break_even_price_thb != null
          ? `คิดลด ${pct(data.discount_rate)} (NPV = 0): ${fmt(r.discounted_break_even_price_thb, 2)} บาท`
          : null,
        data.min_break_even_price_thb != null && data.max_break_even_price_thb != null
          ? `Min–Max ${fmt(data.min_break_even_price_thb, 0)}–${fmt(data.max_break_even_price_thb, 0)} บาท ตามความถี่การทวนสอบ`
          : null,
      ],
    },
    {
      label: "พื้นที่ขั้นต่ำที่คุ้มทุน",
      value: r.min_viable_area_rai != null ? `${formatArea(r.min_viable_area_rai)} ไร่` : "–",
      sub: `พื้นที่ปัจจุบัน ${formatArea(data.total_area_rai)} ไร่`,
      tone: r.min_viable_area_rai != null ? (data.total_area_rai >= r.min_viable_area_rai ? "good" : "bad") : undefined,
    },
    {
      label: "คาร์บอนเครดิตรวม",
      value: `${fmtTonnes(r.total_credits_tCO2e)} tCO₂eq`,
      sub: `${fmt(r.credits_per_rai_tCO2e, 2)} tCO₂eq/ไร่, ราคาขายเฉลี่ย ${fmt(r.price_thb_per_tCO2e, 2)} บาท`,
    },
    {
      label: "ปีคุ้มทุน",
      value: payback != null ? `พ.ศ. ${data.start_year + payback + BE_OFFSET}` : "ไม่คุ้มทุน",
      sub: payback != null ? `ปีที่ ${payback} ของโครงการ` : `ภายใน ${CREDITING_YEARS} ปี`,
      tone: payback != null ? "good" : "bad",
    },
    {
      label: `NPV (คิดลด ${pct(data.discount_rate)})`,
      value: `${signed(r.npv_thb)} บาท`,
      sub: r.irr != null ? `IRR ${pct(r.irr)}` : "IRR คำนวณไม่ได้ (ไม่มีกระแสเงินสดบวก)",
      tone: r.npv_thb >= 0 ? "good" : "bad",
    },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3, 1fr)", gap: 10 }}>
      {tiles.map((t) => (
        <div key={t.label} style={{ background: "#fff", borderRadius: 12, border: "1px solid rgba(30,122,71,0.12)", padding: "10px 12px", minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>{t.label}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: isMobile ? 16 : 19, fontWeight: 800, color: "#1e293b", marginTop: 2, overflowWrap: "anywhere" }}>
            {t.tone && (
              <i className={`bi ${t.tone === "good" ? "bi-check-circle-fill" : "bi-x-circle-fill"}`} aria-hidden="true"
                style={{ fontSize: 15, color: t.tone === "good" ? GAIN : LOSS }} />
            )}
            {t.value}
          </div>
          {(Array.isArray(t.sub) ? t.sub : [t.sub]).filter(Boolean).map((line) => (
            <div key={line} style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{line}</div>
          ))}
        </div>
      ))}
    </div>
  );
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Yearly net cash flow (bars) with the cumulative position (line), one baht axis. */
function CashFlowChart({ schedule, isMobile }: { schedule: EconomicsScheduleYear[]; isMobile?: boolean }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const H = isMobile ? 240 : 280;
  const PL = isMobile ? 50 : 64, PR = 12, PT = 12, PB = 40;
  const iW = Math.max(0, width - PL - PR), iH = H - PT - PB;

  const values = schedule.flatMap((s) => [s.net_thb, s.cumulative_net_thb]);
  const ticks = niceSignedTicks(Math.min(0, ...values), Math.max(0, ...values), isMobile ? 4 : 5);
  const lo = ticks[0], hi = ticks[ticks.length - 1];
  const slot = iW / schedule.length;
  const barW = Math.min(36, slot * 0.55);
  const xOf = (i: number) => PL + (i + 0.5) * slot;
  const yOf = (v: number) => PT + ((hi - v) / (hi - lo || 1)) * iH;
  const y0 = yOf(0);
  const line = schedule.map((s, i) => `${i ? "L" : "M"}${xOf(i).toFixed(1)},${yOf(s.cumulative_net_thb).toFixed(1)}`).join(" ");
  const h = hover != null ? schedule[hover] : null;

  return (
    <div ref={ref} style={{ position: "relative", height: H }}>
      {width > 0 && (
        <svg width={width} height={H} role="img" aria-label="กราฟกระแสเงินสดรายปีและสะสมของโครงการ" style={{ display: "block", overflow: "visible" }}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PL} x2={PL + iW} y1={yOf(t)} y2={yOf(t)} stroke={t ? "rgba(0,0,0,0.07)" : "rgba(0,0,0,0.3)"} strokeDasharray={t ? "3 4" : undefined} />
              <text x={PL - 8} y={yOf(t) + 4} textAnchor="end" fontSize={12} fill="#64748b">{t < 0 ? "−" : ""}{fmtTick(Math.abs(t))}</text>
            </g>
          ))}
          {schedule.map((s, i) => {
            const y = yOf(s.net_thb);
            const top = Math.min(y, y0), hgt = Math.abs(y - y0);
            return (
              <g key={s.year_at} opacity={hover == null || hover === i ? 1 : 0.45}>
                {hgt > 0.5 && <rect x={xOf(i) - barW / 2} y={top} width={barW} height={hgt} rx={3} fill={s.net_thb >= 0 ? GAIN : LOSS} />}
                <text x={xOf(i)} y={PT + iH + 16} textAnchor="middle" fontSize={12} fill={s.is_verification ? INK : "#64748b"} fontWeight={s.is_verification ? 800 : 500}>
                  {s.year + BE_OFFSET}
                </text>
                {s.year_at === 0
                  ? <text x={xOf(i)} y={PT + iH + 30} textAnchor="middle" fontSize={10} fill="#334155" fontWeight={700}>ขึ้นทะเบียน</text>
                  : s.is_verification && <text x={xOf(i)} y={PT + iH + 30} textAnchor="middle" fontSize={10} fill="#0f766e" fontWeight={700}>ทวนสอบ</text>}
              </g>
            );
          })}
          <path d={line} fill="none" stroke="#334155" strokeWidth={2} strokeLinejoin="round" />
          {schedule.map((s, i) => (
            <circle key={s.year_at} cx={xOf(i)} cy={yOf(s.cumulative_net_thb)} r={hover === i ? 5 : 3.5}
              fill={s.cumulative_net_thb >= 0 ? GAIN : "#fff"} stroke="#334155" strokeWidth={1.5} />
          ))}
          {schedule.map((s, i) => (
            <rect key={s.year_at} x={PL + i * slot} y={PT} width={slot} height={iH} fill="transparent"
              onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)} onPointerLeave={() => setHover(null)} />
          ))}
        </svg>
      )}
      {h && hover != null && (() => {
        const x = xOf(hover);
        const tipW = 210;
        const left = Math.min(Math.max(x + (x > width / 2 ? -tipW - 12 : 12), 0), width - tipW);
        const row = (k: string, v: string, bold = false) => (
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, lineHeight: 1.6 }}>
            <span style={{ opacity: 0.8 }}>{k}</span>{bold ? <strong>{v}</strong> : <span>{v}</span>}
          </div>
        );
        return (
          <div style={{ position: "absolute", left, top: PT, width: tipW, pointerEvents: "none", background: "#082f20", color: "#fff", borderRadius: 8, padding: "8px 12px", boxShadow: "0 4px 16px rgba(0,0,0,0.35)", fontSize: 12 }}>
            <div style={{ fontWeight: 800, marginBottom: 4 }}>
              พ.ศ. {h.year + BE_OFFSET} <span style={{ fontWeight: 500, opacity: 0.7 }}>(ปีที่ {h.year_at}{h.is_verification ? ", ทวนสอบ" : ""})</span>
            </div>
            {row("คาร์บอนสะสม", `${fmtTonnes(h.carbon_stock_tCO2e)} tCO₂eq`)}
            {h.is_verification && row("เครดิตที่ขาย", `${fmtTonnes(h.credits_issued_tCO2e)} tCO₂eq`)}
            {h.price_thb_per_tCO2e != null && row("ราคาขาย", `${fmt(h.price_thb_per_tCO2e, 2)} บาท/tCO₂eq`)}
            {row("รายได้", fmtBaht(h.revenue_thb))}
            {row("ต้นทุน", fmtBaht(h.cost_thb))}
            {row("สุทธิ", signed(h.net_thb), true)}
            {row("สะสม", signed(h.cumulative_net_thb), true)}
          </div>
        );
      })()}
    </div>
  );
}

function FrequencyTable({ data, selected, onSelect }: { data: CarbonEconomicsResponse; selected: number | null; onSelect: (k: number) => void }) {
  const th: React.CSSProperties = { padding: "6px 8px", fontSize: 12, fontWeight: 700, color: "#475569", textAlign: "right", whiteSpace: "nowrap", borderBottom: "1px solid #e2e8f0" };
  const td: React.CSSProperties = { padding: "7px 8px", fontSize: 13, textAlign: "right", whiteSpace: "nowrap", borderBottom: "1px solid #f1f5f9" };
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: "left" }}>ทวนสอบ</th>
            <th style={th}>จำนวนครั้ง</th>
            <th style={th}>ต้นทุนรวม</th>
            <th style={th}>ราคาคุ้มทุน</th>
            <th style={th}>กำไรสุทธิ</th>
            <th style={th}>NPV</th>
            <th style={th}>IRR</th>
          </tr>
        </thead>
        <tbody>
          {data.frequency_comparison.map((c) => {
            const active = c.verify_every_years === selected;
            return (
              <tr key={c.verify_every_years} onClick={() => onSelect(c.verify_every_years)} aria-selected={active}
                style={{ cursor: "pointer", background: active ? "rgba(30,122,71,0.08)" : undefined }}>
                <td style={{ ...td, textAlign: "left", fontWeight: 700, color: INK }}>
                  {active && <i className="bi bi-caret-right-fill" aria-hidden="true" style={{ marginRight: 4 }} />}ทุก {c.verify_every_years} ปี
                </td>
                <td style={td}>{c.verification_rounds}</td>
                <td style={td}>{fmtBaht(c.total_cost_thb)}</td>
                <td style={td}>{c.break_even_price_thb != null ? fmt(c.break_even_price_thb, 2) : "–"}</td>
                <td style={{ ...td, fontWeight: 700 }}>
                  <i className={`bi ${c.is_viable ? "bi-check-circle-fill" : "bi-x-circle-fill"}`} aria-hidden="true" style={{ color: c.is_viable ? GAIN : LOSS, marginRight: 4, fontSize: 12 }} />
                  {signed(c.net_profit_thb)}
                </td>
                <td style={td}>{signed(c.npv_thb)}</td>
                <td style={td}>{c.irr != null ? pct(c.irr) : "–"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 6 }}>หน่วย: บาท, ราคาคุ้มทุนเป็นบาท/tCO₂eq</div>
    </div>
  );
}

/**
 * Rubber age this year per cohort. A negative age is a planting after the
 * project starts, shown as its planting year instead.
 */
function formatCohortAges(ages: number[], startYear: number) {
  const sorted = [...new Set(ages)].sort((a, b) => a - b);
  if (sorted[0] >= 0) return sorted.length > 1 ? `${sorted[0]}–${sorted[sorted.length - 1]}` : String(sorted[0]);
  return sorted.map((a) => (a < 0 ? `ปลูก พ.ศ. ${startYear - a + BE_OFFSET}` : String(a))).join(", ");
}

/**
 * Per plot, largest first: its credits, credits/rai and share of the project's
 * credits + revenue, so the plots carrying the project (and the dead weight)
 * stand out. Plots under LOW_YIELD_RATIO of the project's credits/rai are flagged.
 */
function PlotTable({ data, isMobile, plantStatusById }: {
  data: CarbonEconomicsResponse;
  isMobile?: boolean;
  plantStatusById?: Record<string, string | undefined>;
}) {
  const th: React.CSSProperties = { padding: "6px 8px", fontSize: 12, fontWeight: 700, color: "#475569", textAlign: "right", whiteSpace: "nowrap", borderBottom: "1px solid #e2e8f0" };
  const td: React.CSSProperties = { padding: "7px 8px", fontSize: 13, textAlign: "right", whiteSpace: "nowrap", borderBottom: "1px solid #f1f5f9" };
  const totalCredits = data.result.total_credits_tCO2e;
  const avgPerRai = data.result.credits_per_rai_tCO2e;
  const plots = [...data.plots].sort((a, b) => b.credits_tCO2e - a.credits_tCO2e);
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: "left" }}>แปลง</th>
            <th style={th}>พื้นที่ (ไร่)</th>
            <th style={th}>อายุยาง (ปี)</th>
            <th style={th}>เครดิต (tCO₂eq)</th>
            <th style={th}>ต่อไร่</th>
            <th style={{ ...th, textAlign: "left", width: isMobile ? undefined : "34%" }}>สัดส่วนเครดิต · รายได้ (บาท)</th>
          </tr>
        </thead>
        <tbody>
          {plots.map((p) => {
            const share = totalCredits > 0 ? p.credits_tCO2e / totalCredits : 0;
            const lowYield = avgPerRai > 0 && p.credits_per_rai_tCO2e < avgPerRai * LOW_YIELD_RATIO;
            const label = `${fmt(share * 100, share > 0 && share < 0.01 ? 1 : 0)}% · ${fmtBaht(p.revenue_thb)}`;
            return (
              <tr key={p.plot_id}>
                <td style={{ ...td, textAlign: "left", fontWeight: 700, color: INK }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, verticalAlign: "middle" }}>
                    {p.label ?? p.plot_id}
                    <PlantStatusIcon status={plantStatusById?.[p.plot_id]} size="sm" />
                    {lowYield && (
                      <span title={`เครดิตต่อไร่ต่ำกว่าครึ่งของค่าเฉลี่ยโครงการ (${fmt(avgPerRai, 2)} tCO₂eq/ไร่)`}
                        style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 12, fontWeight: 700, color: "#b45309", background: "#fef3c7", borderRadius: 6, padding: "1px 6px" }}>
                        <i className="bi bi-exclamation-triangle-fill" aria-hidden="true" />ผลผลิตต่ำ
                      </span>
                    )}
                  </span>
                  {p.beyond_model_age && (
                    <i className="bi bi-exclamation-triangle-fill" title="อายุยางเกิน 35 ปีระหว่างโครงการ — ถือว่าไม่เติบโตเพิ่มหลังอายุ 35 ปี"
                      aria-label="อายุเกินช่วงแบบจำลอง" style={{ color: "#d97706", marginLeft: 6, fontSize: 12 }} />
                  )}
                </td>
                <td style={td}>{formatArea(p.area_rai)}</td>
                <td style={td}>{formatCohortAges(p.cohort_ages, data.start_year)}</td>
                <td style={{ ...td, fontWeight: 700 }}>{fmtTonnes(p.credits_tCO2e)}</td>
                <td style={td}>{fmt(p.credits_per_rai_tCO2e, 2)}</td>
                <td style={{ ...td, textAlign: "left" }}>
                  {isMobile ? label : (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div aria-hidden="true" style={{ flex: 1, minWidth: 80, height: 10, borderRadius: 5, background: "#eef2f0" }}>
                        <div style={{ width: `${share * 100}%`, minWidth: share > 0 ? 2 : 0, height: "100%", borderRadius: 5, background: GAIN }} />
                      </div>
                      <span style={{ minWidth: 120, color: "#334155" }}>{label}</span>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {/* What the flag means: relative productivity, not a verdict to drop the plot. */}
      <div style={{ display: "flex", gap: 6, marginTop: 8, fontSize: 12, color: "#64748b", lineHeight: 1.6, whiteSpace: "normal" }}>
        <i className="bi bi-exclamation-triangle-fill" aria-hidden="true" style={{ color: "#b45309", marginTop: 2 }} />
        <span>
          <strong style={{ color: "#b45309" }}>ผลผลิตต่ำ</strong> = เครดิตต่อไร่ต่ำกว่าครึ่งหนึ่งของค่าเฉลี่ยโครงการ
          ซึ่งแสดงว่าแปลงนั้นกักเก็บคาร์บอนได้น้อยเมื่อเทียบกับแปลงอื่น 
        </span>
      </div>
    </div>
  );
}

/** Min viable area by starting age; bars under the dashed current-area line are viable. */
function AgeMatrixChart({ data, isMobile }: { data: CarbonEconomicsResponse; isMobile?: boolean }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const rows = data.age_matrix;
  const H = isMobile ? 200 : 230;
  const PL = isMobile ? 50 : 64, PR = 12, PT = 10, PB = 34;
  const iW = Math.max(0, width - PL - PR), iH = H - PT - PB;

  const areas = rows.map((r) => r.min_viable_area_rai ?? 0);
  const ticks = niceSignedTicks(0, Math.max(1, ...areas, data.total_area_rai), 4);
  const hi = ticks[ticks.length - 1];
  const slot = iW / rows.length;
  const barW = Math.max(2, Math.min(18, slot * 0.6));
  const xOf = (i: number) => PL + (i + 0.5) * slot;
  const yOf = (v: number) => PT + iH - (v / hi) * iH;
  const plotAges = new Set(data.plots.flatMap((p) => p.cohort_ages));
  const h = hover != null ? rows[hover] : null;

  return (
    <div ref={ref} style={{ position: "relative", height: H }}>
      {width > 0 && (
        <svg width={width} height={H} role="img" aria-label="กราฟพื้นที่ขั้นต่ำที่คุ้มทุนตามอายุยางเมื่อเริ่มโครงการ" style={{ display: "block", overflow: "visible" }}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PL} x2={PL + iW} y1={yOf(t)} y2={yOf(t)} stroke={t ? "rgba(0,0,0,0.07)" : "rgba(0,0,0,0.3)"} strokeDasharray={t ? "3 4" : undefined} />
              <text x={PL - 8} y={yOf(t) + 4} textAnchor="end" fontSize={12} fill="#64748b">{fmtTick(t)}</text>
            </g>
          ))}
          {rows.map((r, i) => {
            const v = r.min_viable_area_rai;
            const own = plotAges.has(r.start_age);
            return (
              <g key={r.start_age} opacity={hover == null || hover === i ? 1 : 0.45}>
                {v != null && (
                  <rect x={xOf(i) - barW / 2} y={yOf(v)} width={barW} height={Math.max(0, yOf(0) - yOf(v))} rx={2}
                    fill={v <= data.total_area_rai ? GAIN : "#94a3b8"} stroke={own ? "#0f766e" : undefined} strokeWidth={own ? 2 : undefined} />
                )}
                {(r.start_age % (isMobile ? 7 : 5) === 0 || own) && (
                  <text x={xOf(i)} y={PT + iH + 16} textAnchor="middle" fontSize={12} fill={own ? "#0f766e" : "#64748b"} fontWeight={own ? 800 : 500}>{r.start_age}</text>
                )}
              </g>
            );
          })}
          <line x1={PL} x2={PL + iW} y1={yOf(data.total_area_rai)} y2={yOf(data.total_area_rai)} stroke={LOSS} strokeWidth={1.5} strokeDasharray="6 4" />
          <text x={PL + iW / 2} y={PT + iH + 30} textAnchor="middle" fontSize={12} fill="#94a3b8">อายุยางเมื่อเริ่มโครงการ (ปี)</text>
          {rows.map((r, i) => (
            <rect key={r.start_age} x={PL + i * slot} y={PT} width={slot} height={iH} fill="transparent"
              onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)} onPointerLeave={() => setHover(null)} />
          ))}
        </svg>
      )}
      {h && hover != null && (() => {
        const x = xOf(hover);
        const tipW = 190;
        const left = Math.min(Math.max(x + (x > width / 2 ? -tipW - 12 : 12), 0), width - tipW);
        return (
          <div style={{ position: "absolute", left, top: PT, width: tipW, pointerEvents: "none", background: "#082f20", color: "#fff", borderRadius: 8, padding: "8px 12px", boxShadow: "0 4px 16px rgba(0,0,0,0.35)", fontSize: 12, lineHeight: 1.6 }}>
            <div style={{ fontWeight: 800 }}>เริ่มที่อายุ {h.start_age} ปี</div>
            <div>เครดิต {fmt(h.credits_per_rai_tCO2e, 2)} tCO₂eq/ไร่</div>
            <div>พื้นที่ขั้นต่ำ <strong>{h.min_viable_area_rai != null ? `${formatArea(h.min_viable_area_rai)} ไร่` : "–"}</strong></div>
          </div>
        );
      })()}
    </div>
  );
}

/** Years 0..7 as a row of boxes; year 0 holds registration costs, 1..7 an MRV round or nothing. */
function Timeline({ startYear, once, rounds, openYear, resultByYear, isMobile, onOpen, onClearOnce, onRemoveRound }: {
  startYear: number;
  once: OnceCosts;
  rounds: Rounds;
  openYear: number | null;
  resultByYear: Map<number, EconomicsScheduleYear> | null;
  isMobile?: boolean;
  onOpen: (year: number) => void;
  onClearOnce: () => void;
  onRemoveRound: (year: number) => void;
}) {
  const boxW = isMobile ? 92 : undefined;
  return (
    <div style={{ overflowX: "auto", paddingBottom: 4 }}>
      <div role="list" style={{ position: "relative", display: "grid", gridTemplateColumns: `repeat(${CREDITING_YEARS + 1}, ${boxW ? `${boxW}px` : "minmax(0, 1fr)"})`, gap: 8, minWidth: boxW ? undefined : 640 }}>
        {/* connector behind the boxes */}
        <div aria-hidden="true" style={{ position: "absolute", left: 20, right: 20, top: 26, height: 2, background: "rgba(30,122,71,0.2)" }} />
        {Array.from({ length: CREDITING_YEARS + 1 }, (_, y) => {
          const round = rounds[y];
          const active = y === 0 || !!round;
          const open = openYear === y;
          const res = resultByYear?.get(y);
          const cost = y === 0 ? once.pdd + once.validation : round ? round.monitoring + round.verification : 0;
          return (
            <div key={y} role="listitem" style={{ position: "relative", minWidth: 0 }}>
              <button type="button" onClick={() => onOpen(y)} aria-expanded={open}
                aria-label={`ปีที่ ${y} พ.ศ. ${startYear + y + BE_OFFSET}${y === 0 ? " ต้นทุนขึ้นทะเบียน" : round ? " มีการทวนสอบ" : " ไม่มีการทวนสอบ"}`}
                style={{
                  position: "relative", width: "100%", height: "100%", minHeight: 112, display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                  padding: "8px 6px", borderRadius: 12, cursor: "pointer", textAlign: "center",
                  border: open ? `2px solid ${GAIN}` : active ? "1px solid rgba(30,122,71,0.35)" : "1px dashed #cbd5e1",
                  background: open ? "#f0fdf4" : active ? "#fff" : "rgba(255,255,255,0.55)",
                  boxShadow: open ? "0 4px 14px rgba(30,122,71,0.18)" : undefined,
                }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: active ? INK : "#94a3b8" }}>ปีที่ {y}</span>
                <span style={{ fontSize: 12, color: "#64748b" }}>พ.ศ. {startYear + y + BE_OFFSET}</span>
                {y === 0 ? (
                  <span style={{ ...badge, background: "#334155" }}>ขึ้นทะเบียน</span>
                ) : round ? (
                  <span style={{ ...badge, background: "#0f766e" }}>MRV</span>
                ) : (
                  <span style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}><i className="bi bi-plus-circle" aria-hidden="true" /> เพิ่ม MRV</span>
                )}
                {round && <span style={{ fontSize: 12, color: "#1e293b", fontWeight: 700 }}>{fmt(round.price)} บ./tCO₂eq</span>}
                {/* Cost split: year 0 = PDD + Validation, rounds = Monitoring Report + Verification */}
                {(y === 0
                  ? [["PDD", once.pdd, "ค่าจัดทำ PDD"], ["V", once.validation, "ค่าขึ้นทะเบียน Validation"]] as const
                  : round
                    ? [["MR", round.monitoring, "ค่ารายงานติดตามผล"], ["V", round.verification, "ค่าทวนสอบ Verification"]] as const
                    : []
                ).map(([k, v, title]) => (
                  <span key={k} title={title} style={{ fontSize: 12, color: "#64748b", lineHeight: 1.35, whiteSpace: "nowrap" }}>
                    {k}: <span style={{ color: "#334155", fontWeight: 600 }}>{fmtBaht(v)}</span>
                  </span>
                ))}
                {res && active && (
                  <span style={{ fontSize: 12, fontWeight: 800, color: res.net_thb >= 0 ? GAIN : LOSS }}>สุทธิ {signed(res.net_thb)}</span>
                )}
              </button>
              {(y === 0 ? cost > 0 : !!round) && (
                <button type="button" onClick={() => (y === 0 ? onClearOnce() : onRemoveRound(y))}
                  title={y === 0 ? "ล้างค่าต้นทุนขึ้นทะเบียน" : `ยกเลิก MRV ปีที่ ${y}`}
                  aria-label={y === 0 ? "ล้างค่าต้นทุนขึ้นทะเบียน" : `ยกเลิก MRV ปีที่ ${y}`}
                  style={{ position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: 11, border: "none", background: "transparent", color: "#94a3b8", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                  <i className={`bi ${y === 0 ? "bi-eraser" : "bi-x-lg"}`} aria-hidden="true" style={{ fontSize: 12 }} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const badge: React.CSSProperties = { fontSize: 10, fontWeight: 800, color: "#fff", borderRadius: 6, padding: "1px 7px", marginTop: 4 };

/**
 * Edit block under the timeline. Holds a text draft so boxes can be cleared
 * mid-edit; on save an empty box counts as 0.
 */
function YearEditor({ year, startYear, isMobile, once, round, template, onSaveOnce, onSaveRound, onRemoveRound, onClose }: {
  year: number;
  startYear: number;
  isMobile?: boolean;
  once: OnceCosts;
  /** this year's round, or null when it has no MRV yet */
  round: Round | null;
  /** prefill for a year being given MRV */
  template: Round;
  onSaveOnce: (v: OnceCosts) => void;
  onSaveRound: (v: Round) => void;
  onRemoveRound: () => void;
  onClose: () => void;
}) {
  const fields = year === 0
    ? [
      { key: "pdd", label: "ค่าจัดทำ PDD", unit: "บาท", value: once.pdd },
      { key: "validation", label: "ค่าขึ้นทะเบียน Validation", unit: "บาท", value: once.validation },
    ]
    : [
      { key: "price", label: "ราคาขาย", unit: "บาท/tCO₂eq", value: (round ?? template).price },
      { key: "monitoring", label: "ค่ารายงานติดตามผล", unit: "บาท", value: (round ?? template).monitoring },
      { key: "verification", label: "ค่าทวนสอบ", unit: "บาท", value: (round ?? template).verification },
    ];
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.key, String(f.value)])));
  const bad = (v: string) => v.trim() !== "" && !(Number.isFinite(Number(v)) && Number(v) >= 0);
  const anyBad = fields.some((f) => bad(draft[f.key]));
  const num = (k: string) => (draft[k].trim() === "" ? 0 : Number(draft[k]));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (anyBad) return;
    if (year === 0) onSaveOnce({ pdd: num("pdd"), validation: num("validation") });
    else onSaveRound({ price: num("price"), monitoring: num("monitoring"), verification: num("verification") });
  };

  return (
    <form onSubmit={save} role="dialog" aria-label={`ปีที่ ${year}`}
      style={{ marginTop: 10, background: "#fff", borderRadius: 12, border: `2px solid ${GAIN}`, padding: "12px 14px", boxShadow: "0 8px 24px -6px rgba(30,122,71,0.25)", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={label}>
          ปีที่ {year} (พ.ศ. {startYear + year + BE_OFFSET}) — {year === 0 ? "ต้นทุนขึ้นทะเบียน (จ่ายครั้งเดียว)" : round ? "การทวนสอบ (MRV)" : "เพิ่มการทวนสอบ (MRV) ในปีนี้"}
        </span>
        <button type="button" onClick={onClose} aria-label="ปิด" style={{ border: "none", background: "transparent", cursor: "pointer", color: "#64748b", padding: 4 }}>
          <i className="bi bi-x-lg" aria-hidden="true" />
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : `repeat(${fields.length}, minmax(0, 220px))`, gap: 10 }}>
        {fields.map((f, i) => (
          <label key={f.key} style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            <span style={fieldLabel}>{f.label} ({f.unit})</span>
            <input type="number" inputMode="decimal" min={0} autoFocus={i === 0} value={draft[f.key]} placeholder="0" aria-invalid={bad(draft[f.key])}
              onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
              style={{ ...numberInput, borderColor: bad(draft[f.key]) ? "#ef4444" : undefined }} />
          </label>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" style={ghostButton} onClick={() => setDraft(Object.fromEntries(fields.map((f) => [f.key, ""])))}>
            <i className="bi bi-eraser" aria-hidden="true" style={{ marginRight: 4 }} />ล้างค่า
          </button>
          {year > 0 && round && (
            <button type="button" style={{ ...ghostButton, color: "#b91c1c", borderColor: "rgba(185,28,28,0.3)" }} onClick={onRemoveRound}>
              <i className="bi bi-x-circle" aria-hidden="true" style={{ marginRight: 4 }} />ยกเลิก MRV ปีนี้
            </button>
          )}
        </span>
        <span style={{ display: "flex", gap: 8 }}>
          <button type="button" style={ghostButton} onClick={onClose}>ยกเลิก</button>
          <button type="submit" disabled={anyBad}
            style={{ ...ghostButton, background: anyBad ? "#cbd5e1" : GAIN, borderColor: "transparent", color: "#fff", cursor: anyBad ? "not-allowed" : "pointer" }}>
            {year > 0 && !round ? "เพิ่ม MRV" : "บันทึก"}
          </button>
        </span>
      </div>
    </form>
  );
}
