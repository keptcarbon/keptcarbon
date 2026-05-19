"use client";
import { useEffect, useMemo, useState } from "react";
import DashboardMap, { type MapPlot } from "./DashboardMap";

type AgeDist = { key: string; plots: number; carbon: number };
type District = { id: string; name: string; plots: number; areaRai: number; carbon: number; ageDist: AgeDist[]; lat: number; lng: number; };
const fmt = (n: number) => n.toLocaleString("th-TH");
const fmtC = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 0 });

const RAYONG_DISTRICTS = ["เมืองระยอง", "บ้านฉาง", "แกลง", "วังจันทร์", "บ้านค่าย", "ปลวกแดง", "เขาชะเมา", "นิคมพัฒนา"];

function useCounter(target: number, ms = 700) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (target === 0) { setV(0); return; }
    let cur = 0; const step = target / (ms / 16);
    const t = setInterval(() => { cur += step; if (cur >= target) { setV(target); clearInterval(t); } else setV(cur); }, 16);
    return () => clearInterval(t);
  }, [target, ms]);
  return v;
}

function KpiCard({ icon, label, value, unit, color, bgGrad, suffix = "" }: { icon: string; label: string; value: number; unit: string; color: string; bgGrad: string; suffix?: string }) {
  const a = useCounter(value);
  const disp = value >= 1000 ? Math.round(a).toLocaleString("th-TH") : a.toLocaleString("th-TH", { maximumFractionDigits: 1 });
  return (
    <div style={{ background: bgGrad, backdropFilter: "blur(14px)", borderRadius: 20, padding: "22px 24px", border: `1px solid ${color}30`, boxShadow: `0 4px 24px ${color}18`, transition: "transform .2s,box-shadow .2s", position: "relative", overflow: "hidden" }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(-4px)"; (e.currentTarget as HTMLDivElement).style.boxShadow = `0 16px 40px ${color}30`; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = ""; (e.currentTarget as HTMLDivElement).style.boxShadow = `0 4px 24px ${color}18`; }}>
      {/* Decorative circle */}
      <div style={{ position: "absolute", top: -24, right: -24, width: 80, height: 80, borderRadius: "50%", background: `${color}14` }} />
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: `linear-gradient(135deg,${color},${color}cc)`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 4px 12px ${color}40` }}>
          <i className={`bi ${icon}`} style={{ color: "#fff", fontSize: 16 }} />
        </div>
        <span style={{ fontSize: 11, fontWeight: 800, color: "#475569", letterSpacing: 0.3 }}>{label}</span>
      </div>
      <div style={{ fontSize: 32, fontWeight: 900, color: "#0f172a", letterSpacing: -1.5, lineHeight: 1 }}>{disp}{suffix}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
        <div style={{ flex: 1, height: 3, background: `${color}20`, borderRadius: 99 }}>
          <div style={{ width: "100%", height: "100%", background: `linear-gradient(90deg,${color}60,${color})`, borderRadius: 99 }} />
        </div>
        <span style={{ fontSize: 11, color, fontWeight: 700 }}>{unit}</span>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [districts, setDistricts] = useState<District[]>([]);
  const [provinceTotal, setProvinceTotal] = useState<District | null>(null);
  const [mapPlots, setMapPlots] = useState<MapPlot[]>([]);
  const [mapBbox, setMapBbox] = useState<{ minLng: number; minLat: number; maxLng: number; maxLat: number } | null>(null);
  const [ageData, setAgeData] = useState<{ age: number; carbon: number; plotCount: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const [sortBy, setSortBy] = useState<"carbon" | "plots" | "area">("carbon");

  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 768);
    h(); window.addEventListener("resize", h); return () => window.removeEventListener("resize", h);
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch("/api/dashboard/stats")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        setMapPlots(data.mapPlots ?? []);
        setMapBbox(data.bbox ?? null);
        if (data.districts) setDistricts(data.districts);
        if (data.provinceTotal) setProvinceTotal(data.provinceTotal);
        if (data.ageData) setAgeData(data.ageData);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const allRows = useMemo(() => provinceTotal ? [provinceTotal, ...districts] : [], [provinceTotal, districts]);

  const filteredDistricts = useMemo(() => {
    let list = districts;
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      list = list.filter(d => d.name.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => sortBy === "carbon" ? b.carbon - a.carbon : sortBy === "plots" ? b.plots - a.plots : b.areaRai - a.areaRai);
  }, [districts, searchText, sortBy]);

  const selectedDistrict = useMemo(() => allRows.find(d => d.id === selectedId) ?? provinceTotal ?? { id: "all", name: "ทุกอำเภอ", plots: 0, areaRai: 0, carbon: 0, ageDist: [], lat: 12.6819, lng: 101.2587 }, [allRows, selectedId, provinceTotal]);

  const filteredPlots = useMemo(() => selectedId === "all" ? mapPlots : mapPlots.filter(p => p.amphoe === selectedDistrict.name), [mapPlots, selectedId, selectedDistrict]);

  const maxCarbon = useMemo(() => Math.max(...filteredDistricts.map(d => d.carbon), 1), [filteredDistricts]);

  const flyTo = useMemo<[number, number]>(() => [selectedDistrict.lng, selectedDistrict.lat], [selectedDistrict]);
  const flyZoom = selectedId === "all" ? 9 : 11.5;

  const stats = useMemo(() => {
    const src = selectedId === "all" ? provinceTotal : selectedDistrict;
    return { plots: src?.plots ?? 0, areaRai: src?.areaRai ?? 0, carbon: src?.carbon ?? 0, perRai: (src?.areaRai ?? 0) > 0 ? (src?.carbon ?? 0) / (src?.areaRai ?? 1) : 0 };
  }, [selectedId, provinceTotal, selectedDistrict]);

  const ageBarMax = useMemo(() => Math.max(...ageData.map(d => d.plotCount), 1), [ageData]);

  if (loading || !provinceTotal) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "linear-gradient(135deg,#ecfdf5,#f8fafc)", fontFamily: "'Noto Sans Thai','Inter',sans-serif" }}>
      <div style={{ width: 60, height: 60, borderRadius: "50%", border: "4px solid #10b981", borderTopColor: "transparent", animation: "spin 1s linear infinite", marginBottom: 18 }} />
      <div style={{ fontSize: 16, fontWeight: 800, color: "#064e3b" }}>กำลังโหลดข้อมูล...</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#ffffff", paddingTop: isMobile ? 104 : 124, paddingBottom: 60, fontFamily: "'Noto Sans Thai','Inter',sans-serif" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", padding: "0 20px" }}>

        {/* ── HERO ───────────────────────────── */}
        <div style={{ background: "rgba(255,255,255,0.8)", backdropFilter: "blur(20px)", borderRadius: 24, padding: isMobile ? "20px 20px" : "28px 40px", marginBottom: 22, border: "1px solid rgba(16,185,129,0.14)", boxShadow: "0 8px 32px rgba(16,185,129,0.06)", position: "relative", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                <span style={{ background: "rgba(5,150,105,0.08)", border: "1px solid rgba(5,150,105,0.18)", color: "#059669", borderRadius: 6, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>
                  <i className="bi bi-geo-alt-fill" style={{ marginRight: 4 }} />จังหวัดระยอง
                </span>
              </div>
              <h1 style={{ fontSize: isMobile ? 18 : 26, fontWeight: 900, color: "#064e3b", margin: 0, letterSpacing: -0.5 }}>
                แดชบอร์ดวิเคราะห์คาร์บอนสะสมสวนยางพารา
              </h1>
              <p style={{ fontSize: isMobile ? 11.5 : 13, color: "#64748b", margin: "4px 0 0", fontWeight: 500 }}>
                ค้นหาและกรองข้อมูลแยกตามอำเภอในจังหวัดระยอง
              </p>
            </div>
            {selectedId !== "all" && (
              <button onClick={() => setSelectedId("all")} style={{ padding: "8px 16px", borderRadius: 10, border: "1px solid rgba(16,185,129,0.2)", background: "rgba(16,185,129,0.07)", color: "#059669", fontSize: 12, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                <i className="bi bi-arrow-counterclockwise" /> รีเซ็ต
              </button>
            )}
          </div>
        </div>

        {/* ── KPI CARDS ───────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)", gap: 12, marginBottom: 22 }}>
          <KpiCard icon="bi-layers-fill" label="จำนวนแปลงยาง" value={stats.plots} unit="แปลง" color="#059669" bgGrad="linear-gradient(135deg,#f0fdf4,#dcfce7)" />
          <KpiCard icon="bi-map-fill" label="พื้นที่รวม" value={Math.round(stats.areaRai)} unit="ไร่" color="#0d9488" bgGrad="linear-gradient(135deg,#f0fdfa,#ccfbf1)" />
          <KpiCard icon="bi-cloud-arrow-up-fill" label="คาร์บอนสะสม" value={Math.round(stats.carbon)} unit="ตัน CO₂ (tCO₂)" color="#0284c7" bgGrad="linear-gradient(135deg,#f0f9ff,#e0f2fe)" />
        </div>

        {/* ── MAIN LAYOUT ─────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 380px", gap: 16, marginBottom: 16 }}>

          {/* LEFT: MAP */}
          <div style={{ background: "rgba(255,255,255,0.82)", backdropFilter: "blur(14px)", borderRadius: 18, border: "1px solid rgba(255,255,255,0.7)", boxShadow: "0 2px 12px rgba(16,185,129,0.05)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid rgba(16,185,129,0.08)", display: "flex", alignItems: "center", gap: 8 }}>
              <i className="bi bi-map-fill" style={{ color: "#10b981" }} />
              <span style={{ fontSize: 13, fontWeight: 900, color: "#0f172a" }}>แผนที่แปลงยางพาราระยอง</span>
            </div>
            <div style={{ height: isMobile ? 320 : 520, position: "relative" }}>
              <DashboardMap plots={filteredPlots} bbox={mapBbox} flyToCenter={flyTo} flyZoom={flyZoom} districts={filteredDistricts} selectedDistrictId={selectedId} onSelectDistrict={setSelectedId} />
            </div>
          </div>

          {/* RIGHT: SEARCH + DISTRICT LIST */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Search Box */}
            <div style={{ background: "rgba(255,255,255,0.85)", backdropFilter: "blur(14px)", borderRadius: 16, border: "1px solid rgba(255,255,255,0.7)", boxShadow: "0 2px 12px rgba(16,185,129,0.05)", padding: "16px 18px" }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#64748b", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                <i className="bi bi-search" style={{ color: "#10b981" }} /> ค้นหาอำเภอในระยอง
              </div>
              <div style={{ position: "relative" }}>
                <i className="bi bi-search" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: 13 }} />
                <input
                  value={searchText}
                  onChange={e => setSearchText(e.target.value)}
                  placeholder="พิมพ์ชื่ออำเภอ เช่น เมืองระยอง..."
                  style={{ width: "100%", paddingLeft: 36, paddingRight: 12, paddingTop: 10, paddingBottom: 10, borderRadius: 10, border: "1.5px solid rgba(16,185,129,0.18)", background: "#f8fafc", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", transition: "border-color .2s" }}
                  onFocus={e => (e.target.style.borderColor = "#10b981")}
                  onBlur={e => (e.target.style.borderColor = "rgba(16,185,129,0.18)")}
                />
                {searchText && (
                  <button onClick={() => setSearchText("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 14, lineHeight: 1 }}>✕</button>
                )}
              </div>
              {/* Quick filter chips removed per user request */}
              {/* Sort controls */}
              <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                <span style={{ fontSize: 11, color: "#64748b", fontWeight: 700, alignSelf: "center" }}>เรียงตาม:</span>
                {([["carbon", "คาร์บอน"], ["plots", "แปลง"], ["area", "พื้นที่"]] as [typeof sortBy, string][]).map(([k, label]) => (
                  <button key={k} onClick={() => setSortBy(k)} style={{ flex: 1, padding: "5px 0", borderRadius: 8, border: `1.5px solid ${sortBy === k ? "#10b981" : "rgba(0,0,0,0.08)"}`, background: sortBy === k ? "rgba(16,185,129,0.08)" : "#f8fafc", color: sortBy === k ? "#059669" : "#64748b", fontSize: 11, fontWeight: 800, cursor: "pointer", transition: "all .15s" }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* District List */}
            <div style={{ background: "rgba(255,255,255,0.85)", backdropFilter: "blur(14px)", borderRadius: 16, border: "1px solid rgba(255,255,255,0.7)", boxShadow: "0 2px 12px rgba(16,185,129,0.05)", flex: 1, overflow: "hidden" }}>
              <div style={{ padding: "14px 18px", borderBottom: "1px solid rgba(16,185,129,0.08)", display: "flex", alignItems: "center", gap: 6 }}>
                <i className="bi bi-list-ul" style={{ color: "#10b981" }} />
                <span style={{ fontSize: 13, fontWeight: 900, color: "#0f172a" }}>รายอำเภอ</span>
                <span style={{ marginLeft: "auto", fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>{filteredDistricts.length} อำเภอ</span>
              </div>
              <div style={{ overflowY: "auto", maxHeight: 390 }}>
                {filteredDistricts.length === 0 ? (
                  <div style={{ padding: "40px 20px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                    <i className="bi bi-search" style={{ fontSize: 28, display: "block", marginBottom: 10 }} />
                    ไม่พบอำเภอ "{searchText}"
                  </div>
                ) : filteredDistricts.map((d, i) => {
                  const pct = d.carbon / maxCarbon * 100;
                  const isActive = d.id === selectedId;
                  return (
                    <div key={d.id} onClick={() => setSelectedId(isActive ? "all" : d.id)}
                      style={{ padding: "12px 18px", cursor: "pointer", borderBottom: "1px solid rgba(0,0,0,0.04)", background: isActive ? "rgba(16,185,129,0.06)" : i % 2 === 0 ? "#fff" : "#fafafa", borderLeft: `3px solid ${isActive ? "#10b981" : "transparent"}`, transition: "all .15s" }}
                      onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = "rgba(16,185,129,0.03)"; }}
                      onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = i % 2 === 0 ? "#fff" : "#fafafa"; }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 28, height: 28, borderRadius: 8, background: isActive ? "linear-gradient(135deg,#10b981,#047857)" : "rgba(16,185,129,0.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <span style={{ fontSize: 10, fontWeight: 900, color: isActive ? "#fff" : "#10b981" }}>{i + 1}</span>
                          </div>
                          <span style={{ fontSize: 13, fontWeight: isActive ? 900 : 700, color: isActive ? "#059669" : "#1e293b" }}>{d.name}</span>
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 800, color: "#059669" }}>{fmtC(d.carbon)} <span style={{ fontSize: 9, color: "#94a3b8" }}>tCO₂</span></span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, height: 5, background: "#e2e8f0", borderRadius: 99 }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: "linear-gradient(90deg,#86efac,#10b981)", borderRadius: 99, transition: "width .4s" }} />
                        </div>
                        <span style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700, minWidth: 40, textAlign: "right" }}>{fmt(d.plots)} แปลง</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* ── AGE DISTRIBUTION BY DISTRICT ───────────── */}
        <div style={{ background: "rgba(255,255,255,0.82)", backdropFilter: "blur(14px)", borderRadius: 18, border: "1px solid rgba(255,255,255,0.7)", boxShadow: "0 2px 12px rgba(16,185,129,0.05)", padding: isMobile ? "20px 16px" : "24px 28px" }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#10b981,#047857)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <i className="bi bi-bar-chart-fill" style={{ color: "#fff", fontSize: 16 }} />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 900, color: "#0f172a" }}>
                  การกระจายอายุแปลงยาง (1–35 ปี)
                  {selectedId !== "all" && (
                    <span style={{ marginLeft: 8, fontSize: 12, color: "#10b981", fontWeight: 700 }}>· {selectedDistrict.name}</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, marginTop: 1 }}>จำนวนแปลงจำแนกตามอายุต้นยาง · {selectedId === "all" ? "ทุกอำเภอ" : selectedDistrict.name}</div>
              </div>
            </div>
            {selectedId !== "all" && (
              <button onClick={() => setSelectedId("all")} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(16,185,129,0.2)", background: "rgba(16,185,129,0.07)", color: "#059669", fontSize: 11.5, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                <i className="bi bi-x-lg" style={{ fontSize: 10 }} /> ล้างข้อมูล
              </button>
            )}
          </div>

          {/* Bar chart */}
          {(() => {
            const ageCounts: Record<number, number> = {};
            filteredPlots.forEach(p => {
              const age = p.age ?? 0;
              if (age >= 1 && age <= 35) ageCounts[age] = (ageCounts[age] ?? 0) + 1;
            });
            const maxCount = Math.max(...Object.values(ageCounts), 1);
            const getColor = (age: number) =>
              age <= 5 ? "#4ade80" : age <= 12 ? "#22c55e" : age <= 20 ? "#16a34a" : age <= 28 ? "#15803d" : "#14532d";
            const getBg = (age: number) =>
              age <= 5 ? "linear-gradient(180deg,#bbf7d0,#4ade80)" : age <= 12 ? "linear-gradient(180deg,#86efac,#22c55e)" : age <= 20 ? "linear-gradient(180deg,#4ade80,#16a34a)" : age <= 28 ? "linear-gradient(180deg,#22c55e,#15803d)" : "linear-gradient(180deg,#16a34a,#14532d)";
            const stages = [[1, 5, "#4ade80", "1–5 ปี"], [6, 12, "#22c55e", "6–12 ปี"], [13, 20, "#16a34a", "13–20 ปี"], [21, 28, "#15803d", "21–28 ปี"], [29, 35, "#14532d", "29–35 ปี"]] as [number, number, string, string][];

            return (
              <div>
                {/* Chart area — horizontally scrollable on mobile */}
                <div style={{ overflowX: isMobile ? "auto" : "visible", WebkitOverflowScrolling: "touch", marginBottom: 0, paddingBottom: 4 }}>
                  <div style={{ minWidth: isMobile ? 560 : "auto" }}>
                    {/* Y-axis guide lines */}
                    <div style={{ position: "relative", height: 200, marginBottom: 0 }}>
                      {/* Grid lines */}
                      {[100, 75, 50, 25].map(pct => (
                        <div key={pct} style={{ position: "absolute", left: 0, right: 0, bottom: `${pct}%`, borderTop: "1px dashed #e2e8f0", zIndex: 0 }} />
                      ))}
                      {/* Bars */}
                      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: "100%", position: "relative", zIndex: 1 }}>
                        {Array.from({ length: 35 }, (_, i) => i + 1).map(age => {
                          const cnt = ageCounts[age] ?? 0;
                          const heightPct = cnt > 0 ? Math.max((cnt / maxCount) * 100, 3) : 0;
                          return (
                            <div key={age}
                              title={`อายุ ${age} ปี: ${cnt} แปลง`}
                              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end", gap: 0 }}>
                              {cnt > 0 && (
                                <span style={{ fontSize: 8.5, color: getColor(age), fontWeight: 900, marginBottom: 2, lineHeight: 1 }}>{cnt}</span>
                              )}
                              <div style={{
                                width: "70%",
                                height: `${heightPct}%`,
                                background: getBg(age),
                                borderRadius: "3px 3px 0 0",
                                minHeight: cnt > 0 ? 3 : 0,
                                boxShadow: cnt > 0 ? `0 0 6px ${getColor(age)}55` : "none",
                                transition: "height .6s cubic-bezier(.34,1.56,.64,1)"
                              }} />
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* X-axis */}
                    <div style={{ display: "flex", borderTop: "2px solid #d1fae5", paddingTop: 5, gap: 3 }}>
                      {Array.from({ length: 35 }, (_, i) => i + 1).map(age => (
                        <div key={age} style={{ flex: 1, textAlign: "center" }}>
                          {age % 5 === 0 && (
                            <span style={{ fontSize: 10, color: "#64748b", fontWeight: 700 }}>{age}</span>
                          )}
                        </div>
                      ))}
                    </div>
                    <div style={{ textAlign: "center", fontSize: 11, color: "#94a3b8", fontWeight: 600, marginTop: 4 }}>อายุต้นยาง (ปี)</div>
                  </div>
                </div>

                {/* Beautiful Legend & Explanation Panel */}
                <div style={{
                  background: "rgba(244,247,246,0.6)",
                  backdropFilter: "blur(4px)",
                  border: "1px solid rgba(16,185,129,0.12)",
                  borderRadius: 14,
                  padding: isMobile ? "12px 14px" : "14px 20px",
                  marginTop: 18,
                  display: "flex",
                  flexDirection: isMobile ? "column" : "row",
                  gap: 16,
                  justifyContent: "space-between",
                  alignItems: isMobile ? "flex-start" : "center"
                }}>
                  {/* Left: Color Ranges */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#064e3b", textTransform: "uppercase", letterSpacing: 0.5, display: "flex", alignItems: "center", gap: 5 }}>
                      <i className="bi bi-palette-fill" style={{ color: "#10b981" }} /> คำอธิบายสีช่วงอายุต้นยาง (ปี):
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: isMobile ? "6px 12px" : "12px", alignItems: "center" }}>
                      {[
                        { range: "1–5 ปี", color: "#4ade80" },
                        { range: "6–12 ปี", color: "#22c55e" },
                        { range: "13–20 ปี", color: "#16a34a" },
                        { range: "21–28 ปี", color: "#15803d" },
                        { range: "29–35 ปี", color: "#14532d" },
                      ].map((item, idx) => (
                        <div key={idx} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ 
                            display: "inline-block", 
                            width: 10, 
                            height: 10, 
                            borderRadius: "50%", 
                            background: item.color, 
                            boxShadow: `0 0 6px ${item.color}bb` 
                          }} />
                          <span style={{ fontSize: 11.5, fontWeight: 700, color: "#1e293b" }}>{item.range}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Divider on Mobile */}
                  {isMobile && <div style={{ width: "100%", height: 1, background: "rgba(16,185,129,0.1)" }} />}

                  {/* Right: Numbers Meaning */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#064e3b", textTransform: "uppercase", letterSpacing: 0.5, display: "flex", alignItems: "center", gap: 5 }}>
                      <i className="bi bi-info-circle-fill" style={{ color: "#10b981" }} /> ความหมายของตัวเลข:
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: isMobile ? 8 : 14 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#fff", padding: "4px 10px", borderRadius: 8, border: "1px solid rgba(16,185,129,0.08)" }}>
                        <i className="bi bi-bar-chart-line-fill" style={{ color: "#10b981", fontSize: 12 }} />
                        <span style={{ fontSize: 10.5, color: "#334155", fontWeight: 500 }}>
                          <strong style={{ color: "#059669" }}>ตัวเลขบนแท่งกราฟ:</strong> จำนวนแปลงของแต่ละปีอายุ (เช่น อายุ 15 ปี มีกี่แปลง)
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#fff", padding: "4px 10px", borderRadius: 8, border: "1px solid rgba(16,185,129,0.08)" }}>
                        <i className="bi bi-card-text" style={{ color: "#10b981", fontSize: 12 }} />
                        <span style={{ fontSize: 10.5, color: "#334155", fontWeight: 500 }}>
                          <strong style={{ color: "#059669" }}>ตัวเลขในการ์ดด้านล่าง:</strong> จำนวนแปลงรวม และสัดส่วนเปอร์เซ็นต์ (%) ของกลุ่มอายุนั้นๆ
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Summary cards */}
                <div style={{ marginTop: 20 }}>
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(5, 1fr)",
                    gap: isMobile ? 8 : 12
                  }}>
                    {stages.map(([from, to, color, label], idx) => {
                      const total = Array.from({ length: (to as number) - (from as number) + 1 }, (_, i) => i + (from as number)).reduce((s, a) => s + (ageCounts[a] ?? 0), 0);
                      const pct = Math.round(total / filteredPlots.length * 100) || 0;
                      return (
                        <div key={from} style={{
                          background: `linear-gradient(135deg,${color}18,${color}08)`,
                          border: `1.5px solid ${color}40`,
                          borderRadius: 14,
                          padding: isMobile ? "12px 10px" : "14px 18px",
                          textAlign: "center",
                          position: "relative",
                          overflow: "hidden",
                          gridColumn: isMobile && idx === 4 ? "span 2" : "auto",
                          boxShadow: "0 2px 8px rgba(16,185,129,0.04)"
                        }}>
                          {/* Decorative ring */}
                          <div style={{ position: "absolute", top: -20, right: -20, width: 60, height: 60, borderRadius: "50%", background: `${color}18` }} />
                          <div style={{ fontSize: isMobile ? 10.5 : 11, color, fontWeight: 800, marginBottom: 4 }}>{label}</div>
                          <div style={{ fontSize: isMobile ? 24 : 28, fontWeight: 900, color, lineHeight: 1, marginBottom: 2 }}>{total.toLocaleString("th-TH")}</div>
                          <div style={{ fontSize: isMobile ? 9 : 10, color: "#94a3b8", fontWeight: 600, marginBottom: 6 }}>แปลง</div>
                          {/* Progress bar */}
                          <div style={{ height: 4, background: `${color}25`, borderRadius: 99 }}>
                            <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 99, transition: "width .5s" }} />
                          </div>
                          <div style={{ fontSize: isMobile ? 9.5 : 10, color, fontWeight: 800, marginTop: 4 }}>{pct}%</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes spin { to{transform:rotate(360deg)} }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: #f1f5f9; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 99px; }
      `}</style>
    </div>
  );
}
