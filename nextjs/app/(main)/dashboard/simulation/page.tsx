"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Footer } from "@/app/components/organisms";
import { CarbonSimulationChart } from "@/app/(main)/(protected)/my-plots/CarbonSimulationChart";
import type { SimBaseRow } from "@/app/(main)/(protected)/my-plots/simulationRequest";
import { GROWTH_MODEL_OPTIONS } from "@/lib/growth-model";
import { ALLOMETRY_OPTIONS } from "@/lib/allometry";
import { useCounter } from "@/lib/use-counter";

const M2_PER_RAI = 1600;
const BE_OFFSET = 543;

type ProvinceOption = { pCode: string; nameEn: string; nameTh: string };

type ProvinceSimData = {
  province: ProvinceOption;
  config: {
    luVersion: number;
    plantingYearVersion: number;
    spacing: string;
    clone: string;
    growthModel: string;
    allometry: string;
    biomassProfileVersion: string;
  };
  districts: { id: string; nameTh: string; areaM2: number }[];
  /** Rubber area by planting year (CE); unclassified pixels excluded. */
  cohorts: { year: number; areaM2: number }[];
  unclassifiedAreaM2: number;
};

const fmt = (v: number) => Math.round(v).toLocaleString("th-TH");
/** Display name for a stored code, same labels as the plot-edit dropdowns; unknown codes show as-is. */
const optionLabel = (options: { label: string; value: string }[], value: string) =>
  options.find((o) => o.value === value)?.label || value;

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof body?.error === "string" ? body.error : `HTTP ${res.status}`);
  return body as T;
}

function StatCard({ icon, label, value, unit, color }: {
  icon: string; label: string; value: number | string; unit: string; color: string;
}) {
  // Numbers run up/down to the new value; text (e.g. a year range) shows as-is.
  const n = useCounter(typeof value === "number" ? value : 0);
  return (
    <div className="db2-stat-card" style={{ borderTop: `3px solid ${color}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <i className={`bi ${icon}`} style={{ color, fontSize: 16 }} />
        </div>
        <span style={{ fontSize: 16, fontWeight: 700, color: "#64748b" }}>{label}</span>
      </div>
      <div style={{ fontSize: 30, fontWeight: 900, color: "#0f172a", letterSpacing: -1, lineHeight: 1 }}>{typeof value === "number" ? fmt(n) : value}</div>
      <div style={{ fontSize: 15, color: "#94a3b8", fontWeight: 600, marginTop: 5 }}>{unit}</div>
    </div>
  );
}

function Select({ label, icon, value, onChange, children, disabled }: {
  label: string; icon: string; value: string; onChange: (v: string) => void;
  children: React.ReactNode; disabled?: boolean;
}) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", flex: 1, minWidth: 240 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 16, fontWeight: 700, color: "#374151", flexShrink: 0 }}>
        <i className={`bi ${icon}`} style={{ color: "#059669", fontSize: 16 }} />{label}
      </span>
      <span style={{ position: "relative", flex: 1, minWidth: 180, maxWidth: 320 }}>
        <select
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: "100%", appearance: "none", WebkitAppearance: "none", background: "#fff",
            border: "1.5px solid rgba(5,150,105,0.35)", borderRadius: 10, padding: "10px 40px 10px 14px",
            fontSize: 15, fontWeight: 700, color: "#0f172a", cursor: disabled ? "default" : "pointer", outline: "none",
            boxShadow: "0 1px 4px rgba(5,150,105,0.1)", fontFamily: "'Noto Sans Thai','Inter',sans-serif",
          }}
        >
          {children}
        </select>
        <i className="bi bi-chevron-down" style={{ position: "absolute", right: 13, top: "50%", transform: "translateY(-50%)", color: "#059669", fontSize: 14, pointerEvents: "none" }} />
      </span>
    </label>
  );
}

export default function ProvinceSimulationPage() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 768);
    h();
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  const [provinces, setProvinces] = useState<ProvinceOption[] | null>(null);
  const [pCode, setPCode] = useState("");
  const [districtId, setDistrictId] = useState("all");
  const [data, setData] = useState<ProvinceSimData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchJson<{ provinces: ProvinceOption[] }>("/api/carbon-sim/province")
      .then(({ provinces }) => {
        setProvinces(provinces);
        if (provinces.length) setPCode(provinces[0].pCode);
        else setLoading(false);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!pCode) return;
    const ctrl = new AbortController();
    const qs = new URLSearchParams({ pCode });
    if (districtId !== "all") qs.set("district", districtId);
    setLoading(true);
    fetchJson<ProvinceSimData>(`/api/carbon-sim/province?${qs}`, ctrl.signal)
      .then((d) => { setData(d); setError(null); })
      .catch((e) => { if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    return () => ctrl.abort();
  }, [pCode, districtId]);

  // One /carbon/sim row per planting year; tree_count null lets the backend
  // derive it from area and the province's default spacing.
  const baseRows = useMemo<SimBaseRow[]>(() => {
    if (!data) return [];
    const { config, province, cohorts } = data;
    return cohorts.map((c) => ({
      p_code: province.pCode,
      clone: config.clone,
      growth_model: config.growthModel,
      allometry: config.allometry,
      biomass_profile_version: config.biomassProfileVersion,
      spacing_system: config.spacing,
      year_of_planting: c.year,
      area_m2: c.areaM2,
      tree_count: null,
    }));
  }, [data]);

  const district = data?.districts.find((d) => d.id === districtId);
  const scopeName = data ? (district ? `อำเภอ${district.nameTh}` : `จังหวัด${data.province.nameTh}`) : "";
  const areaM2 = data?.cohorts.reduce((s, c) => s + c.areaM2, 0) ?? 0;
  const years = data?.cohorts.map((c) => c.year) ?? [];

  return (
    <>
      <div className="db2-page" style={{ minHeight: "100vh", background: "linear-gradient(180deg,#ecfdf5 0%,#f8fafc 60%)", paddingTop: 110, paddingBottom: 60, fontFamily: "'Noto Sans Thai','Inter',sans-serif" }}>
        <div className="db2-wrap">

          {/* ── Hero ─────────────────────────────────────────────────────── */}
          <div className="db2-hero" style={{
            background: "radial-gradient(900px 340px at -5% -10%, rgba(16,185,129,0.13) 0%, transparent 65%), radial-gradient(700px 300px at 110% 0%, rgba(16,185,129,0.09) 0%, transparent 60%), linear-gradient(135deg,#ffffff 0%,#f0fdf4 100%)",
            border: "1px solid rgba(16,185,129,0.14)",
            boxShadow: "0 4px 24px rgba(16,185,129,0.08)",
          }}>
            <div style={{ position: "relative" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                <span style={{ background: "rgba(5,150,105,0.1)", border: "1px solid rgba(5,150,105,0.2)", borderRadius: 8, padding: "5px 14px", fontSize: 15, fontWeight: 700, color: "#059669" }}>
                  <i className="bi bi-graph-up-arrow" style={{ marginRight: 5 }} />จำลองคาร์บอนระดับพื้นที่
                </span>
                {data && (
                  <span style={{ background: "rgba(5,150,105,0.08)", border: "1px solid rgba(5,150,105,0.18)", borderRadius: 8, padding: "5px 14px", fontSize: 15, fontWeight: 700, color: "#047857" }}>
                    <i className="bi bi-geo-alt-fill" style={{ marginRight: 5 }} />{scopeName}
                  </span>
                )}
              </div>
              <h1 style={{ fontSize: isMobile ? 24 : 34, fontWeight: 900, color: "#064e3b", margin: "0 0 8px", letterSpacing: -0.8, lineHeight: 1.15 }}>
                จำลองคาร์บอนกักเก็บ
              </h1>
              <p style={{ fontSize: isMobile ? 15 : 17, color: "#64748b", margin: 0, fontWeight: 500, maxWidth: 760 }}>
                จำลองปริมาณคาร์บอนกักเก็บของสวนยางพาราทั้งจังหวัดหรือรายอำเภอ จากพื้นที่ตามปีที่ปลูกในฐานข้อมูล GeoAI แผนที่ปีปลูก
                ปรับรอบและอัตราการปลูกทดแทนเพื่อดูแนวโน้มย้อนหลังและคาดการณ์ 35 ปี
              </p>
            </div>
          </div>

          {/* ── Scope selectors ──────────────────────────────────────────── */}
          <div className="db2-card" style={{ padding: "14px 20px" }}>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <Select label="เลือกจังหวัด" icon="bi-map" value={pCode} disabled={!provinces?.length}
                onChange={(v) => { setPCode(v); setDistrictId("all"); }}>
                {!provinces?.length && <option value="">{provinces ? "ไม่มีข้อมูลจังหวัด" : "กำลังโหลด..."}</option>}
                {provinces?.map((p) => <option key={p.pCode} value={p.pCode}>{p.nameTh}</option>)}
              </Select>
              <Select label="เลือกอำเภอ" icon="bi-geo-alt-fill" value={districtId} disabled={!data}
                onChange={setDistrictId}>
                <option value="all">ทั้งจังหวัด</option>
                {data?.districts.map((d) => (
                  <option key={d.id} value={d.id}>{d.nameTh} — {fmt(d.areaM2 / M2_PER_RAI)} ไร่</option>
                ))}
              </Select>
            </div>
          </div>

          {error && (
            <div role="alert" className="db2-card" style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 10, color: "#b91c1c", fontWeight: 600 }}>
              <i className="bi bi-exclamation-triangle" />{error}
            </div>
          )}

          {provinces && !provinces.length && !error && (
            <div className="db2-card" style={{ padding: "28px 20px", textAlign: "center", color: "#64748b", fontWeight: 600 }}>
              ยังไม่มีจังหวัดที่มีข้อมูลการกระจายปีปลูกสำหรับการจำลอง
            </div>
          )}

          {!data && loading && !error && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 48, color: "#5a7a65", fontWeight: 600 }}>
              <Loader2 className="size-5 animate-spin" aria-hidden="true" /> กำลังโหลดข้อมูล...
            </div>
          )}

          {data && (
            <div style={{ opacity: loading ? 0.6 : 1, transition: "opacity 0.2s" }}>
              {/* ── Stat cards ─────────────────────────────────────────── */}
              <div className="db2-stat-row" style={{ gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3,1fr)" }}>
                <StatCard icon="bi-map-fill" label="พื้นที่ปลูกยางพารา" value={areaM2 / M2_PER_RAI} unit="ไร่ (ที่ระบุปีเริ่มปลูกได้)" color="#0d9488" />
                <StatCard icon="bi-calendar3" label="ช่วงปีเริ่มปลูกที่ระบุได้"
                  value={years.length ? `${Math.min(...years) + BE_OFFSET}–${Math.max(...years) + BE_OFFSET}` : "–"}
                  unit={`พ.ศ. · ${years.length} รุ่นอายุ`} color="#065f46" />
                <StatCard icon="bi-question-circle" label="พื้นที่ที่ไม่สามารถระบุปีปลูก" value={data.unclassifiedAreaM2 / M2_PER_RAI}
                  unit="ไร่ (ไม่รวมในการจำลอง)" color="#94a3b8" />
              </div>

              {/* ── Simulation chart ───────────────────────────────────── */}
              <div className="db2-card" style={{ overflow: "hidden" }}>
                <div className="db2-card-header">
                  <i className="bi bi-graph-up-arrow" style={{ color: "#059669" }} />
                  <span>ปริมาณคาร์บอนกักเก็บ</span>
                  <span style={{ marginLeft: 6, fontWeight: 500, color: "#94a3b8", fontSize: 15 }}>{scopeName}</span>
                </div>
                <div style={{ padding: isMobile ? 12 : 20 }}>
                  {baseRows.length ? (
                    <CarbonSimulationChart baseRows={baseRows} isMobile={isMobile} unitLabel={district ? "อำเภอ" : "จังหวัด"} />
                  ) : (
                    <div style={{ padding: 32, textAlign: "center", color: "#64748b", fontWeight: 600 }}>
                      ไม่มีพื้นที่ที่ระบุปีปลูกได้สำหรับการจำลอง
                    </div>
                  )}

                  {/* Parameters the simulation used */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14, fontSize: 13, color: "#475569" }}>
                    <span style={{ fontWeight: 700, color: "#17603a" }}>ค่าพารามิเตอร์เริ่มต้นของจังหวัด:</span>
                    {[
                      ["พันธุ์ยาง", data.config.clone],
                      ["ระยะปลูก", data.config.spacing],
                      ["Growth model", optionLabel(GROWTH_MODEL_OPTIONS, data.config.growthModel)],
                      ["Allometry", optionLabel(ALLOMETRY_OPTIONS, data.config.allometry)],
                      ["Biomass profile", data.config.biomassProfileVersion],
                      // planting_year_version is stored in CE (e.g. 2026).
                      ["แผนที่ปีปลูก", `พ.ศ. ${data.config.plantingYearVersion + BE_OFFSET}`],
                    ].map(([k, v]) => (
                      <span key={k} style={{ background: "#f1f5f9", borderRadius: 6, padding: "2px 8px" }}>
                        {k}: <strong>{v}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <style>{`
          .db2-wrap { max-width: 1300px; margin: 0 auto; padding: 0 28px; }
          .db2-hero { position: relative; border-radius: 20px; padding: 36px 44px; margin-bottom: 22px; overflow: hidden; background: #fff; }
          .db2-stat-row { display: grid; gap: 14px; margin-bottom: 18px; }
          .db2-stat-card { background: #fff; border-radius: 14px; padding: 20px; border: 1px solid rgba(16,185,129,0.1); box-shadow: 0 2px 10px rgba(16,185,129,0.06); }
          .db2-card { background: #fff; border-radius: 16px; border: 1px solid rgba(16,185,129,0.1); box-shadow: 0 2px 12px rgba(16,185,129,0.06); margin-bottom: 18px; }
          .db2-card-header { display: flex; align-items: center; flex-wrap: wrap; gap: 9px; padding: 13px 18px; border-bottom: 1px solid rgba(16,185,129,0.08); font-size: 15px; font-weight: 800; color: #0f172a; }
          select:focus { border-color: #059669 !important; box-shadow: 0 0 0 3px rgba(5,150,105,0.15) !important; }

          @media (max-width: 640px) {
            .db2-page { padding-top: 100px !important; padding-bottom: 36px !important; }
            .db2-wrap { padding: 0 12px; }
            .db2-hero { padding: 18px 16px; border-radius: 14px; margin-bottom: 14px; }
            .db2-stat-row { gap: 10px; margin-bottom: 12px; }
            .db2-stat-card { padding: 14px 12px; border-radius: 11px; }
            .db2-card { border-radius: 12px; margin-bottom: 12px; }
          }
        `}</style>
      </div>
      <Footer />
    </>
  );
}
