"use client";

import { useState } from "react";
import { Alert, Card } from "@/app/components";

// Seeded from backend/app/core/constants.py — the live source of truth until
// this page is wired to a settings API.
const INITIAL_THRESHOLDS = {
    treeAgeHomologousThreshold: 0.9,
    treeCountValidationThreshold: 0.05,
};

const INITIAL_GROWTH_MODEL = {
    growthModelYear: 35,
    maxTreeAge: 29,
    meanCutTreeAge: 23,
    mixTreeProportion: 0.02,
};

const INITIAL_BIOMETRIC = {
    carbonFraction: 0.47,
    carbonEquivalentFactor: 3.667,
};

const INITIAL_DEFAULTS = {
    defaultSpacingSystem: "2.5x8",
    defaultRubberClone: "RRIM 600",
};

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

const HERO_BG =
    "radial-gradient(900px 420px at -5% -20%, rgba(45,158,95,0.16) 0%, rgba(45,158,95,0) 62%)," +
    "radial-gradient(700px 360px at 108% 0%, rgba(30,122,71,0.10) 0%, rgba(30,122,71,0) 58%)," +
    "linear-gradient(135deg, #ffffff 0%, #f8fbf9 100%)";

const SECTION_TITLE_STYLE: React.CSSProperties = {
    fontWeight: 700,
    fontSize: 15,
    color: "#1a3d2b",
};

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
}: {
    label: string;
    hint?: string;
    value: string | number;
    onChange: (v: string) => void;
    type?: "number" | "text";
}) {
    return (
        <div>
            <div style={FIELD_LABEL_STYLE}>{label}</div>
            <input
                type={type}
                step={type === "number" ? "any" : undefined}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                style={INPUT_STYLE}
            />
            {hint && (
                <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 4 }}>{hint}</div>
            )}
        </div>
    );
}

export default function RndConfigurationPage() {
    const [thresholds, setThresholds] = useState(INITIAL_THRESHOLDS);
    const [growthModel, setGrowthModel] = useState(INITIAL_GROWTH_MODEL);
    const [biometric, setBiometric] = useState(INITIAL_BIOMETRIC);
    const [defaults, setDefaults] = useState(INITIAL_DEFAULTS);
    const [treeDensities, setTreeDensities] = useState(INITIAL_TREE_DENSITIES);
    const [regions, setRegions] = useState(INITIAL_REGIONS);

    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState<string | null>(null);

    function updateDensity(index: number, field: "spacing" | "density", value: string) {
        setTreeDensities((prev) =>
            prev.map((row, i) =>
                i === index ? { ...row, [field]: field === "density" ? Number(value) : value } : row
            )
        );
    }

    function updateRegion(index: number, field: keyof (typeof INITIAL_REGIONS)[number], value: string) {
        setRegions((prev) =>
            prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
        );
    }

    async function handleSave() {
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
                        ค่าคงที่และพารามิเตอร์ที่ใช้ในโมเดลประเมินคาร์บอน
                        {" · "}อ้างอิงจาก <code style={{ color: "#1e7a47" }}>backend/app/core/constants.py</code>
                    </div>
                </div>
            </Card>

            {success && (
                <Alert type="success" className="mb-3">
                    {success}
                </Alert>
            )}

            <div className="d-flex flex-column gap-3">
                {/* ── Tree age / validation thresholds ── */}
                <div style={{ background: "#fff", border: "1px solid #e6f0ea", borderRadius: 16, padding: 20 }}>
                    <div className="mb-3" style={SECTION_TITLE_STYLE}>เกณฑ์อายุต้นไม้และการตรวจสอบ</div>
                    <div className="row g-3">
                        <div className="col-12 col-md-6">
                            <Field
                                label="Tree Age Homologous Threshold"
                                hint="ค่าเกณฑ์ความคล้ายคลึงของอายุต้นไม้"
                                value={thresholds.treeAgeHomologousThreshold}
                                onChange={(v) => setThresholds((p) => ({ ...p, treeAgeHomologousThreshold: Number(v) }))}
                            />
                        </div>
                        <div className="col-12 col-md-6">
                            <Field
                                label="Tree Count Validation Threshold"
                                hint="ค่าเกณฑ์การตรวจสอบจำนวนต้นไม้"
                                value={thresholds.treeCountValidationThreshold}
                                onChange={(v) => setThresholds((p) => ({ ...p, treeCountValidationThreshold: Number(v) }))}
                            />
                        </div>
                    </div>
                </div>

                {/* ── Growth model parameters ── */}
                <div style={{ background: "#fff", border: "1px solid #e6f0ea", borderRadius: 16, padding: 20 }}>
                    <div className="mb-3" style={SECTION_TITLE_STYLE}>พารามิเตอร์โมเดลการเติบโต</div>
                    <div className="row g-3">
                        <div className="col-12 col-md-6 col-lg-3">
                            <Field
                                label="Growth Model Year"
                                hint="ตารางค่าครอบคลุมอายุ 0–35 ปี"
                                value={growthModel.growthModelYear}
                                onChange={(v) => setGrowthModel((p) => ({ ...p, growthModelYear: Number(v) }))}
                            />
                        </div>
                        <div className="col-12 col-md-6 col-lg-3">
                            <Field
                                label="Max Tree Age"
                                hint="อายุสูงสุดที่ยอมรับจากราสเตอร์"
                                value={growthModel.maxTreeAge}
                                onChange={(v) => setGrowthModel((p) => ({ ...p, maxTreeAge: Number(v) }))}
                            />
                        </div>
                        <div className="col-12 col-md-6 col-lg-3">
                            <Field
                                label="Mean Cut Tree Age"
                                hint="อายุเฉลี่ยสำหรับพิกเซลผสม"
                                value={growthModel.meanCutTreeAge}
                                onChange={(v) => setGrowthModel((p) => ({ ...p, meanCutTreeAge: Number(v) }))}
                            />
                        </div>
                        <div className="col-12 col-md-6 col-lg-3">
                            <Field
                                label="Mix Tree Proportion"
                                hint="สัดส่วนสำหรับกรองพิกเซลอายุมาก"
                                value={growthModel.mixTreeProportion}
                                onChange={(v) => setGrowthModel((p) => ({ ...p, mixTreeProportion: Number(v) }))}
                            />
                        </div>
                    </div>
                </div>

                {/* ── Biometric constants ── */}
                <div style={{ background: "#fff", border: "1px solid #e6f0ea", borderRadius: 16, padding: 20 }}>
                    <div className="mb-3" style={SECTION_TITLE_STYLE}>ค่าคงที่ทางชีวมวล</div>
                    <div className="row g-3">
                        <div className="col-12 col-md-6">
                            <Field
                                label="Carbon Fraction"
                                hint="สัดส่วนคาร์บอนในชีวมวลแห้ง"
                                value={biometric.carbonFraction}
                                onChange={(v) => setBiometric((p) => ({ ...p, carbonFraction: Number(v) }))}
                            />
                        </div>
                        <div className="col-12 col-md-6">
                            <Field
                                label="Carbon Equivalent Factor"
                                hint="อัตราส่วนโมเลกุล C → CO₂ (44/12)"
                                value={biometric.carbonEquivalentFactor}
                                onChange={(v) => setBiometric((p) => ({ ...p, carbonEquivalentFactor: Number(v) }))}
                            />
                        </div>
                    </div>
                </div>

                {/* ── Default assumptions ── */}
                <div style={{ background: "#fff", border: "1px solid #e6f0ea", borderRadius: 16, padding: 20 }}>
                    <div className="mb-3" style={SECTION_TITLE_STYLE}>ค่าเริ่มต้นเมื่อไม่ระบุข้อมูล</div>
                    <div className="row g-3">
                        <div className="col-12 col-md-6">
                            <Field
                                type="text"
                                label="Default Spacing System"
                                value={defaults.defaultSpacingSystem}
                                onChange={(v) => setDefaults((p) => ({ ...p, defaultSpacingSystem: v }))}
                            />
                        </div>
                        <div className="col-12 col-md-6">
                            <Field
                                type="text"
                                label="Default Rubber Clone"
                                value={defaults.defaultRubberClone}
                                onChange={(v) => setDefaults((p) => ({ ...p, defaultRubberClone: v }))}
                            />
                        </div>
                    </div>
                </div>

                {/* ── Tree density mapping ── */}
                <div style={{ background: "#fff", border: "1px solid #e6f0ea", borderRadius: 16, overflow: "hidden" }}>
                    <div style={{ padding: "20px 20px 12px" }}>
                        <div style={SECTION_TITLE_STYLE}>ความหนาแน่นต้นไม้ตามระบบระยะปลูก</div>
                    </div>
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

                {/* ── Regional configuration ── */}
                <div style={{ background: "#fff", border: "1px solid #e6f0ea", borderRadius: 16, padding: 20 }}>
                    <div className="mb-3" style={SECTION_TITLE_STYLE}>ค่าตั้งต้นรายภูมิภาค (Region Config)</div>
                    {regions.map((region, i) => (
                        <div
                            key={region.code}
                            style={{ border: "1px solid #f1f5f9", borderRadius: 12, padding: 16 }}
                            className={i > 0 ? "mt-3" : ""}
                        >
                            <div className="d-flex align-items-center gap-2 mb-3">
                                <span
                                    className="badge rounded-pill"
                                    style={{ background: "#edfaf3", color: "#1e7a47", fontWeight: 700, fontSize: 12, padding: "4px 10px" }}
                                >
                                    {region.code}
                                </span>
                                <span style={{ fontWeight: 600, color: "#1a3d2b", fontSize: 14 }}>{region.provinceName}</span>
                            </div>
                            <div className="row g-3">
                                <div className="col-12 col-md-4">
                                    <Field type="text" label="LU Map Version" value={region.luMapVersion} onChange={(v) => updateRegion(i, "luMapVersion", v)} />
                                </div>
                                <div className="col-12 col-md-4">
                                    <Field type="text" label="Establishment Year Map Version" value={region.establishmentYearMapVersion} onChange={(v) => updateRegion(i, "establishmentYearMapVersion", v)} />
                                </div>
                                <div className="col-12 col-md-4">
                                    <Field type="text" label="Establishment Year Map QA Version" value={region.establishmentYearMapQaVersion} onChange={(v) => updateRegion(i, "establishmentYearMapQaVersion", v)} />
                                </div>
                                <div className="col-12 col-md-3">
                                    <Field type="text" label="Default Spacing System" value={region.defaultSpacingSystem} onChange={(v) => updateRegion(i, "defaultSpacingSystem", v)} />
                                </div>
                                <div className="col-12 col-md-3">
                                    <Field type="text" label="Default Rubber Clone" value={region.defaultRubberClone} onChange={(v) => updateRegion(i, "defaultRubberClone", v)} />
                                </div>
                                <div className="col-12 col-md-3">
                                    <Field type="text" label="Default Model" value={region.defaultModel} onChange={(v) => updateRegion(i, "defaultModel", v)} />
                                </div>
                                <div className="col-12 col-md-3">
                                    <Field type="text" label="Default Biomass Assessment Method" value={region.defaultBiomassAssessmentMethod} onChange={(v) => updateRegion(i, "defaultBiomassAssessmentMethod", v)} />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Save bar ── */}
            <div className="d-flex justify-content-end mt-4">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="btn"
                    style={{
                        background: "#1e7a47", color: "#fff", border: "none",
                        borderRadius: 10, padding: "10px 22px", fontWeight: 600, fontSize: "0.9rem",
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
