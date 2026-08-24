"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, Card } from "@/app/components";

// A region config row's p_code ties it to a province in geo_thailand.
type GeoProvince = {
    pCode: string;
    provCode: string;
    nameTh: string;
    nameEn: string;
    region: string;
};

const REGION_LABELS: Record<string, string> = {
    C: "ภาคกลาง",
    N: "ภาคเหนือ",
    E: "ภาคตะวันออก",
    W: "ภาคตะวันตก",
    NE: "ภาคตะวันออกเฉียงเหนือ",
    S: "ภาคใต้",
};

// Seeded from backend/app/core/constants.py — the live source of truth until
// this page is wired to a settings API.
const INITIAL_TREE_DENSITIES: { spacing: string; density: number }[] = [
    { spacing: "2.5x8", density: 500 },
    { spacing: "3x7", density: 475 },
    { spacing: "3x8", density: 419 },
    { spacing: "2.5x7", density: 569 },
    { spacing: "3x6", density: 556 },
];

const INITIAL_REGIONS = [
    {
        code: "RAY",
        provinceName: "Rayong",
        luMapVersion: "2567",
        establishmentYearMapVersion: "2026",
        establishmentYearMapQaVersion: "2026",
        defaultSpacingSystem: "2.5x8",
        defaultRubberClone: "RRIM 600",
        defaultModel: "weibull",
        defaultBiomassAssessmentMethod: "hytonen_2018",
    },
];

// GET /api/rnd/region-config-options response shape — the saved
// tbl_region_config row (if any) for a province, plus each dropdown's real
// option list sourced from whichever table owns that data.
type RegionConfigOptions = {
    config: {
        pCode: string;
        pName: string;
        luVersion: number;
        estYearVersion: number;
        defaultSpacing: string;
        defaultClone: string;
        defaultGrowth: string;
        defaultAllometry: string;
    } | null;
    estYearVersionOptions: string[];
    luVersionOptions: string[];
    spacingOptions: string[];
    cloneOptions: string[];
    growthOptions: string[];
    allometryOptions: string[];
};

function toOptions(values: string[]) {
    return values.map((v) => ({ label: v, value: v }));
}

const HERO_BG =
    "radial-gradient(900px 420px at -5% -20%, rgba(45,158,95,0.16) 0%, rgba(45,158,95,0) 62%)," +
    "radial-gradient(700px 360px at 108% 0%, rgba(30,122,71,0.10) 0%, rgba(30,122,71,0) 58%)," +
    "linear-gradient(135deg, #ffffff 0%, #f8fbf9 100%)";

const FIELD_LABEL_STYLE: React.CSSProperties = {
    fontSize: 12.5,
    fontWeight: 600,
    color: "#5a7a65",
    marginBottom: 4,
};

const INPUT_STYLE: React.CSSProperties = {
    width: "100%",
    borderRadius: 10,
    border: "1px solid #e6f0ea",
    background: "#fff",
    padding: "9px 12px",
    fontSize: 14,
    color: "#1a3d2b",
    outline: "none",
};

function Field({
    label,
    hint,
    value,
    onChange,
    type = "number",
    options,
    required = false,
}: {
    label: string;
    hint?: string;
    value: string | number;
    onChange: (v: string) => void;
    type?: "number" | "text";
    options?: readonly { label: string; value: string }[];
    required?: boolean;
}) {
    return (
        <div>
            <div style={FIELD_LABEL_STYLE}>
                {label} {required && <span style={{ color: "#dc2626" }}>*</span>}
            </div>
            {options ? (
                <select
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    required={required}
                    className="form-select"
                    style={INPUT_STYLE}
                >
                    <option value="">เลือก…</option>
                    {options.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                </select>
            ) : (
                <input
                    type={type}
                    step={type === "number" ? "any" : undefined}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    style={INPUT_STYLE}
                />
            )}
            {hint && (
                <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 4 }}>{hint}</div>
            )}
        </div>
    );
}

type ConfigTabKey = "density" | "region";

const CONFIG_TABS: { key: ConfigTabKey; label: string }[] = [
    { key: "density", label: "ความหนาแน่นต้นไม้ตามระยะปลูก" },
    { key: "region", label: "ค่าตั้งต้นรายภูมิภาค (Region Config)" },
];

export default function RndConfigurationPage() {
    const [activeTab, setActiveTab] = useState<ConfigTabKey>("density");
    const [treeDensities, setTreeDensities] = useState(INITIAL_TREE_DENSITIES);
    const [regions, setRegions] = useState(INITIAL_REGIONS);

    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState<string | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);

    // ── geo_thailand reference (region → province → p_code) — picks which
    // province's row the "ค่าตั้งต้นรายภูมิภาค" tab focuses on. ──
    const [provinces, setProvinces] = useState<GeoProvince[]>([]);
    const [provincesLoading, setProvincesLoading] = useState(true);
    const [provincesError, setProvincesError] = useState(false);
    const [filterRegion, setFilterRegion] = useState("");
    const [filterPCode, setFilterPCode] = useState("");

    useEffect(() => {
        let cancelled = false;
        fetch("/api/geo-thailand")
            .then((res) => (res.ok ? res.json() : Promise.reject(res)))
            .then((data) => {
                if (!cancelled) setProvinces(data.provinces ?? []);
            })
            .catch(() => {
                if (!cancelled) setProvincesError(true);
            })
            .finally(() => {
                if (!cancelled) setProvincesLoading(false);
            });
        return () => { cancelled = true; };
    }, []);

    const availableRegions = useMemo(
        () => Array.from(new Set(provinces.map((p) => p.region))).sort(),
        [provinces]
    );
    const provincesInRegion = useMemo(
        () => provinces.filter((p) => p.region === filterRegion).sort((a, b) => a.nameTh.localeCompare(b.nameTh, "th")),
        [provinces, filterRegion]
    );
    const filterProvince = useMemo(
        () => provinces.find((p) => p.pCode === filterPCode) ?? null,
        [provinces, filterPCode]
    );

    // ── tbl_region_config + per-field dropdown options for the selected
    // province, from /api/rnd/region-config-options. ──
    const [regionOptions, setRegionOptions] = useState<RegionConfigOptions | null>(null);
    const [regionOptionsLoading, setRegionOptionsLoading] = useState(false);
    const [regionOptionsError, setRegionOptionsError] = useState(false);

    useEffect(() => {
        if (!filterPCode) {
            setRegionOptions(null);
            setRegionOptionsError(false);
            return;
        }
        let cancelled = false;
        setRegionOptionsLoading(true);
        setRegionOptionsError(false);
        fetch(`/api/rnd/region-config-options?pCode=${encodeURIComponent(filterPCode)}`)
            .then((res) => (res.ok ? res.json() : Promise.reject(res)))
            .then((data: RegionConfigOptions) => {
                if (cancelled) return;
                setRegionOptions(data);
                // A saved tbl_region_config row is the authoritative source —
                // sync it into the editable draft so the dropdowns default
                // to the right selection.
                if (data.config) {
                    const cfg = data.config;
                    setRegions((prev) => {
                        const entry = {
                            code: cfg.pCode,
                            provinceName: cfg.pName,
                            luMapVersion: String(cfg.luVersion),
                            establishmentYearMapVersion: String(cfg.estYearVersion),
                            establishmentYearMapQaVersion: "",
                            defaultSpacingSystem: cfg.defaultSpacing,
                            defaultRubberClone: cfg.defaultClone,
                            defaultModel: cfg.defaultGrowth,
                            defaultBiomassAssessmentMethod: cfg.defaultAllometry,
                        };
                        return prev.some((r) => r.code === cfg.pCode)
                            ? prev.map((r) => (r.code === cfg.pCode ? entry : r))
                            : [...prev, entry];
                    });
                }
            })
            .catch(() => {
                if (!cancelled) setRegionOptionsError(true);
            })
            .finally(() => {
                if (!cancelled) setRegionOptionsLoading(false);
            });
        return () => { cancelled = true; };
    }, [filterPCode]);

    const visibleRegions = filterPCode ? regions.filter((r) => r.code === filterPCode) : regions;

    function addRegionConfig() {
        if (!filterProvince || regions.some((r) => r.code === filterProvince.pCode)) return;
        setRegions((prev) => [
            ...prev,
            {
                code: filterProvince.pCode,
                provinceName: filterProvince.nameTh,
                luMapVersion: "",
                establishmentYearMapVersion: "",
                establishmentYearMapQaVersion: "",
                defaultSpacingSystem: "",
                defaultRubberClone: "",
                defaultModel: "",
                defaultBiomassAssessmentMethod: "",
            },
        ]);
    }

    function updateDensity(index: number, field: "spacing" | "density", value: string) {
        setTreeDensities((prev) =>
            prev.map((row, i) =>
                i === index ? { ...row, [field]: field === "density" ? Number(value) : value } : row
            )
        );
    }

    function updateRegion(code: string, field: keyof (typeof INITIAL_REGIONS)[number], value: string) {
        setRegions((prev) =>
            prev.map((row) => (row.code === code ? { ...row, [field]: value } : row))
        );
    }

    // All 6 region-config dropdowns are required — block Save until whatever
    // province is currently being edited has every one of them filled in.
    const regionFieldsIncomplete =
        activeTab === "region" &&
        !!filterPCode &&
        visibleRegions.some((r) =>
            !r.establishmentYearMapVersion || !r.luMapVersion || !r.defaultSpacingSystem ||
            !r.defaultRubberClone || !r.defaultModel || !r.defaultBiomassAssessmentMethod
        );

    async function handleSave() {
        setSaveError(null);

        // Region config is the only part of this page with a real endpoint
        // so far — the tree-density tab still just simulates success.
        if (activeTab === "region" && filterPCode) {
            const region = visibleRegions.find((r) => r.code === filterPCode);
            if (!region) return;
            setSaving(true);
            try {
                const res = await fetch("/api/rnd/region-config", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        pCode: region.code,
                        pName: region.provinceName,
                        luVersion: Number(region.luMapVersion),
                        estYearVersion: Number(region.establishmentYearMapVersion),
                        defaultSpacing: region.defaultSpacingSystem,
                        defaultClone: region.defaultRubberClone,
                        defaultGrowth: region.defaultModel,
                        defaultAllometry: region.defaultBiomassAssessmentMethod,
                    }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    throw new Error(data.error || "บันทึกไม่สำเร็จ");
                }
                setSuccess(`บันทึกค่าตั้งต้นสำหรับ ${region.provinceName} (${region.code}) สำเร็จ`);
                setTimeout(() => setSuccess(null), 3000);
            } catch (err) {
                setSaveError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
            } finally {
                setSaving(false);
            }
            return;
        }

        setSaving(true);
        // No settings API yet — constants still live in backend/app/core/constants.py.
        await new Promise((resolve) => setTimeout(resolve, 500));
        setSaving(false);
        setSuccess("บันทึกการตั้งค่า (ยังไม่เชื่อมต่อ API จริง)");
        setTimeout(() => setSuccess(null), 3000);
    }

    return (
        <>
            {/* ── Hero card ── */}
            <Card className="border-0 shadow-sm mb-4 overflow-hidden">
                <div className="p-4 p-md-5" style={{ background: HERO_BG, borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                    <h1 className="fw-bold mb-2" style={{ letterSpacing: "-0.02em", color: "#1a3d2b", fontSize: 26 }}>
                        ตั้งค่าพารามิเตอร์การคำนวณ
                    </h1>
                    <div style={{ color: "#5a7a65", fontSize: 14 }}>
                        ค่าเริ่มต้นและพารามิเตอร์ต่าง ๆ ที่ใช้ในการประเมินคาร์บอน
                    </div>
                </div>
            </Card>

            {success && (
                <Alert type="success" className="mb-3">
                    {success}
                </Alert>
            )}

            {/* ── Tabs ── */}
            <div className="d-flex align-items-center gap-1 mb-4" style={{ borderBottom: "1px solid #e6f0ea" }}>
                {CONFIG_TABS.map((tab) => (
                    <button
                        key={tab.key}
                        type="button"
                        onClick={() => setActiveTab(tab.key)}
                        className="btn"
                        style={{
                            border: "none", background: "transparent", borderRadius: 0,
                            padding: "10px 18px", fontWeight: 600, fontSize: "0.9rem",
                            color: activeTab === tab.key ? "#1e7a47" : "#5a7a65",
                            borderBottom: activeTab === tab.key ? "2px solid #1e7a47" : "2px solid transparent",
                            marginBottom: -1,
                        }}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {activeTab === "density" && (
                <div style={{ background: "#fff", border: "1px solid #e6f0ea", borderRadius: 16, overflow: "hidden" }}>
                    <div className="table-responsive">
                        <table className="table align-middle mb-0" style={{ fontSize: 13 }}>
                            <thead style={{ background: "#f8fbf9" }}>
                                <tr>
                                    <th className="px-4 py-2" style={{ fontWeight: 700, fontSize: 12, color: "#5a7a65", textTransform: "uppercase" }}>ระบบระยะปลูก</th>
                                    <th className="py-2" style={{ fontWeight: 700, fontSize: 12, color: "#5a7a65", textTransform: "uppercase" }}>ความหนาแน่น (ต้น/ไร่)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {treeDensities.map((row, i) => (
                                    <tr key={row.spacing}>
                                        <td className="px-4 py-2" style={{ width: "40%" }}>
                                            <input
                                                type="text"
                                                value={row.spacing}
                                                onChange={(e) => updateDensity(i, "spacing", e.target.value)}
                                                style={{ ...INPUT_STYLE, padding: "6px 10px" }}
                                            />
                                        </td>
                                        <td className="py-2" style={{ width: "40%" }}>
                                            <input
                                                type="number"
                                                value={row.density}
                                                onChange={(e) => updateDensity(i, "density", e.target.value)}
                                                style={{ ...INPUT_STYLE, padding: "6px 10px" }}
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === "region" && (
                <div className="row g-3">
                    {/* ── Left: ภาค (top) / จังหวัด (bottom), stacked ── */}
                    <div className="col-12 col-md-4">
                        <div style={{ background: "#fff", border: "1px solid #e6f0ea", borderRadius: 16, padding: 20 }}>
                            {provincesError ? (
                                <div style={{ fontSize: 13.5, color: "#c53030" }}>
                                    ไม่สามารถโหลดข้อมูลจังหวัดจาก geo_thailand ได้ กรุณาลองใหม่อีกครั้ง
                                </div>
                            ) : (
                                <div className="d-flex flex-column gap-3">
                                    <div>
                                        <div style={{ fontSize: 13.5, fontWeight: 600, color: "#5a7a65", marginBottom: 4 }}>ภาค</div>
                                        <select
                                            value={filterRegion}
                                            onChange={(e) => {
                                                setFilterRegion(e.target.value);
                                                setFilterPCode("");
                                            }}
                                            disabled={provincesLoading}
                                            className="form-select"
                                            style={{ borderRadius: 10, border: "1px solid #e6f0ea", fontSize: 14, color: "#1a3d2b", padding: "9px 12px" }}
                                        >
                                            <option value="">{provincesLoading ? "กำลังโหลด…" : "เลือกภาค…"}</option>
                                            {availableRegions.map((r) => (
                                                <option key={r} value={r}>{REGION_LABELS[r] ?? r}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 13.5, fontWeight: 600, color: "#5a7a65", marginBottom: 4 }}>จังหวัด</div>
                                        <select
                                            value={filterPCode}
                                            onChange={(e) => setFilterPCode(e.target.value)}
                                            disabled={!filterRegion}
                                            className="form-select"
                                            style={{ borderRadius: 10, border: "1px solid #e6f0ea", fontSize: 14, color: "#1a3d2b", padding: "9px 12px" }}
                                        >
                                            <option value="">{filterRegion ? "เลือกจังหวัด…" : "เลือกภาคก่อน"}</option>
                                            {provincesInRegion.map((p) => (
                                                <option key={p.pCode} value={p.pCode}>{p.nameTh} ({p.pCode})</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── Right: parameters for the selected province, 2 columns × 3 rows ── */}
                    <div className="col-12 col-md-8">
                        <div style={{ background: "#fff", border: "1px solid #e6f0ea", borderRadius: 16, padding: 20 }}>
                            {!filterPCode && (
                                <div className="text-center py-4" style={{ fontSize: 13.5, color: "#5a7a65" }}>
                                    เลือกจังหวัดทางซ้ายเพื่อดูหรือแก้ไขค่าตั้งต้น
                                </div>
                            )}
                            {filterPCode && regionOptionsError && (
                                <div style={{ fontSize: 13.5, color: "#c53030" }}>
                                    ไม่สามารถโหลดตัวเลือกสำหรับจังหวัดนี้ได้ กรุณาลองใหม่อีกครั้ง
                                </div>
                            )}
                            {filterPCode && regionOptionsLoading && (
                                <div className="text-center py-4" style={{ fontSize: 13.5, color: "#5a7a65" }}>
                                    กำลังโหลดตัวเลือก…
                                </div>
                            )}
                            {filterPCode && !regionOptionsLoading && !regionOptionsError && visibleRegions.map((region) => (
                                <div key={region.code}>
                                    <div className="d-flex align-items-center gap-2 mb-3">
                                        <span
                                            className="badge rounded-pill"
                                            style={{ background: "#edfaf3", color: "#1e7a47", fontWeight: 700, fontSize: 12, padding: "4px 10px" }}
                                        >
                                            {region.code}
                                        </span>
                                        <span style={{ fontWeight: 600, color: "#1a3d2b", fontSize: 14 }}>{region.provinceName}</span>
                                    </div>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                                        <Field required label="Establishment Year Map Version" value={region.establishmentYearMapVersion} onChange={(v) => updateRegion(region.code, "establishmentYearMapVersion", v)} options={toOptions(regionOptions?.estYearVersionOptions ?? [])} />
                                        <Field required label="LU Map Version" value={region.luMapVersion} onChange={(v) => updateRegion(region.code, "luMapVersion", v)} options={toOptions(regionOptions?.luVersionOptions ?? [])} />
                                        <Field required label="Default Spacing System" value={region.defaultSpacingSystem} onChange={(v) => updateRegion(region.code, "defaultSpacingSystem", v)} options={toOptions(regionOptions?.spacingOptions ?? [])} />
                                        <Field required label="Default Rubber Clone" value={region.defaultRubberClone} onChange={(v) => updateRegion(region.code, "defaultRubberClone", v)} options={toOptions(regionOptions?.cloneOptions ?? [])} />
                                        <Field required label="Default Growth Model" value={region.defaultModel} onChange={(v) => updateRegion(region.code, "defaultModel", v)} options={toOptions(regionOptions?.growthOptions ?? [])} />
                                        <Field required label="Default Biomass Assessment Method" value={region.defaultBiomassAssessmentMethod} onChange={(v) => updateRegion(region.code, "defaultBiomassAssessmentMethod", v)} options={toOptions(regionOptions?.allometryOptions ?? [])} />
                                    </div>
                                </div>
                            ))}
                            {filterPCode && !regionOptionsLoading && !regionOptionsError && visibleRegions.length === 0 && filterProvince && (
                                <div className="text-center py-4">
                                    <div style={{ fontSize: 13.5, color: "#5a7a65", marginBottom: 12 }}>
                                        ยังไม่มีค่าตั้งต้นสำหรับ {filterProvince.nameTh} ({filterProvince.pCode})
                                    </div>
                                    <button
                                        onClick={addRegionConfig}
                                        className="btn"
                                        style={{
                                            background: "#1e7a47", color: "#fff", border: "none",
                                            borderRadius: 10, padding: "8px 18px", fontWeight: 600, fontSize: "0.85rem",
                                        }}
                                    >
                                        <i className="bi bi-plus-lg me-1" />
                                        เพิ่มค่าตั้งต้นสำหรับจังหวัดนี้
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Save bar ── */}
            <div className="d-flex flex-column align-items-end gap-2 mt-4">
                {regionFieldsIncomplete && (
                    <div style={{ fontSize: 12.5, color: "#dc2626" }}>
                        กรุณาเลือกตัวเลือกที่จำเป็น (*) ให้ครบก่อนบันทึก
                    </div>
                )}
                {saveError && (
                    <div style={{ fontSize: 12.5, color: "#dc2626" }}>
                        <i className="bi bi-exclamation-circle me-1" />
                        {saveError}
                    </div>
                )}
                <button
                    onClick={handleSave}
                    disabled={saving || regionFieldsIncomplete}
                    className="btn"
                    style={{
                        background: "#1e7a47", color: "#fff", border: "none",
                        borderRadius: 10, padding: "10px 22px", fontWeight: 600, fontSize: "0.9rem",
                        opacity: regionFieldsIncomplete ? 0.5 : 1,
                    }}
                >
                    {saving
                        ? <><span className="spinner-border spinner-border-sm me-2" style={{ width: 14, height: 14 }} />กำลังบันทึก…</>
                        : "บันทึกการตั้งค่า"}
                </button>
            </div>
        </>
    );
}
