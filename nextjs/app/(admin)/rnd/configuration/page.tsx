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

// Populated from /api/rnd/tree-density (tbl_tree_density) -- the DB-backed
// replacement for TreeService's old TREE_DENSITIES dict.
type TreeDensityRow = {
    id: number;
    treeSpacing: string;
    treeDensityHa: number;
    treeDensityRai: number;
    desc: string | null;
};

// Populated from /api/rnd/region-config-options (tbl_region_config) once a
// province is selected -- no hardcoded seed row, so a province without a
// saved config correctly falls through to the "add config" empty state.
type RegionConfigRow = {
    code: string;
    provinceName: string;
    luMapVersion: string;
    plantingYearMapVersion: string;
    plantingYearMapQaVersion: string;
    defaultSpacingSystem: string;
    defaultRubberClone: string;
    defaultModel: string;
    defaultBiomassAssessmentMethod: string;
};

// GET /api/rnd/region-config-options response shape — the saved
// tbl_region_config row (if any) for a province, plus each dropdown's real
// option list sourced from whichever table owns that data.
type RegionConfigOptions = {
    config: {
        pCode: string;
        pName: string;
        luVersion: number;
        plantingYearVersion: number;
        defaultSpacing: string;
        defaultClone: string;
        defaultGrowth: string;
        defaultAllometry: string;
    } | null;
    plantingYearVersionOptions: string[];
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
    const [regions, setRegions] = useState<RegionConfigRow[]>([]);

    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState<string | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);

    // ── ความหนาแน่นต้นไม้ตามระยะปลูก tab — tbl_tree_density, via
    // /api/rnd/tree-density. Every row edits/saves/deletes independently
    // (no batch "บันทึกการตั้งค่า" step, unlike the region-config tab). ──
    const [treeDensities, setTreeDensities] = useState<TreeDensityRow[]>([]);
    const [densityLoading, setDensityLoading] = useState(true);
    const [densityError, setDensityError] = useState(false);
    const [densityBusyId, setDensityBusyId] = useState<number | null>(null);
    const [densityRowError, setDensityRowError] = useState<Record<number, string>>({});
    const [pendingDeleteDensityId, setPendingDeleteDensityId] = useState<number | null>(null);

    const [newSpacing, setNewSpacing] = useState("");
    const [newDensity, setNewDensity] = useState("");
    const [newDesc, setNewDesc] = useState("");
    const [addingDensity, setAddingDensity] = useState(false);
    const [addDensityError, setAddDensityError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetch("/api/rnd/tree-density")
            .then((res) => (res.ok ? res.json() : Promise.reject(res)))
            .then((data) => {
                if (!cancelled) setTreeDensities(data.rows ?? []);
            })
            .catch(() => {
                if (!cancelled) setDensityError(true);
            })
            .finally(() => {
                if (!cancelled) setDensityLoading(false);
            });
        return () => { cancelled = true; };
    }, []);

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
                            plantingYearMapVersion: String(cfg.plantingYearVersion),
                            plantingYearMapQaVersion: "",
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
                plantingYearMapVersion: "",
                plantingYearMapQaVersion: "",
                defaultSpacingSystem: "",
                defaultRubberClone: "",
                defaultModel: "",
                defaultBiomassAssessmentMethod: "",
            },
        ]);
    }

    function updateDensityField(id: number, field: "treeSpacing" | "treeDensityHa" | "desc", value: string) {
        setTreeDensities((prev) =>
            prev.map((row) =>
                row.id === id ? { ...row, [field]: field === "treeDensityHa" ? Number(value) : value } : row
            )
        );
    }

    async function saveDensityRow(id: number) {
        const row = treeDensities.find((r) => r.id === id);
        if (!row) return;
        setDensityBusyId(id);
        setDensityRowError((prev) => ({ ...prev, [id]: "" }));
        try {
            const res = await fetch(`/api/rnd/tree-density/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    treeSpacing: row.treeSpacing,
                    treeDensityHa: row.treeDensityHa,
                    desc: row.desc,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "บันทึกไม่สำเร็จ");
            setTreeDensities((prev) => prev.map((r) => (r.id === id ? data.row : r)));
        } catch (err) {
            setDensityRowError((prev) => ({ ...prev, [id]: err instanceof Error ? err.message : "บันทึกไม่สำเร็จ" }));
        } finally {
            setDensityBusyId(null);
        }
    }

    async function confirmDeleteDensityRow() {
        if (!pendingDeleteDensityId) return;
        const id = pendingDeleteDensityId;
        setDensityBusyId(id);
        setDensityRowError((prev) => ({ ...prev, [id]: "" }));
        try {
            const res = await fetch(`/api/rnd/tree-density/${id}`, { method: "DELETE" });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "ลบไม่สำเร็จ");
            setTreeDensities((prev) => prev.filter((r) => r.id !== id));
            setPendingDeleteDensityId(null);
        } catch (err) {
            setDensityRowError((prev) => ({ ...prev, [id]: err instanceof Error ? err.message : "ลบไม่สำเร็จ" }));
            setPendingDeleteDensityId(null);
        } finally {
            setDensityBusyId(null);
        }
    }

    async function addDensityRow() {
        setAddDensityError(null);
        const density = Number(newDensity);
        if (!newSpacing.trim() || !newDensity.trim() || !Number.isInteger(density) || density <= 0) {
            setAddDensityError("กรุณากรอกระบบระยะปลูก และความหนาแน่นเป็นจำนวนเต็มมากกว่า 0");
            return;
        }
        setAddingDensity(true);
        try {
            const res = await fetch("/api/rnd/tree-density", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    treeSpacing: newSpacing.trim(),
                    treeDensityHa: density,
                    desc: newDesc.trim() || null,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "เพิ่มไม่สำเร็จ");
            setTreeDensities((prev) => [...prev, data.row].sort((a, b) => a.treeSpacing.localeCompare(b.treeSpacing)));
            setNewSpacing("");
            setNewDensity("");
            setNewDesc("");
        } catch (err) {
            setAddDensityError(err instanceof Error ? err.message : "เพิ่มไม่สำเร็จ");
        } finally {
            setAddingDensity(false);
        }
    }

    function updateRegion(code: string, field: keyof RegionConfigRow, value: string) {
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
            !r.plantingYearMapVersion || !r.luMapVersion || !r.defaultSpacingSystem ||
            !r.defaultRubberClone || !r.defaultModel || !r.defaultBiomassAssessmentMethod
        );

    // Region config batch-saves via the bottom "บันทึกการตั้งค่า" bar; the
    // tree-density tab saves/deletes each row immediately instead (see
    // saveDensityRow/confirmDeleteDensityRow/addDensityRow above), so this handler
    // only has a region-tab case.
    async function handleSave() {
        setSaveError(null);
        if (activeTab !== "region" || !filterPCode) return;

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
                    plantingYearVersion: Number(region.plantingYearMapVersion),
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
                    {densityError ? (
                        <div className="p-4" style={{ fontSize: 13.5, color: "#c53030" }}>
                            ไม่สามารถโหลดข้อมูลความหนาแน่นต้นไม้จาก tbl_tree_density ได้ กรุณาลองใหม่อีกครั้ง
                        </div>
                    ) : densityLoading ? (
                        <div className="text-center py-4" style={{ fontSize: 13.5, color: "#5a7a65" }}>
                            กำลังโหลด…
                        </div>
                    ) : (
                        <div className="table-responsive">
                            <table className="table align-middle mb-0" style={{ fontSize: 13 }}>
                                <thead style={{ background: "#f8fbf9" }}>
                                    <tr>
                                        <th className="px-4 py-2" style={{ fontWeight: 700, fontSize: 12, color: "#5a7a65", textTransform: "uppercase" }}>ระบบระยะปลูก</th>
                                        <th className="py-2" style={{ fontWeight: 700, fontSize: 12, color: "#5a7a65", textTransform: "uppercase" }}>ความหนาแน่น (ต้น/เฮกตาร์)</th>
                                        <th className="py-2" style={{ fontWeight: 700, fontSize: 12, color: "#5a7a65", textTransform: "uppercase" }}>ความหนาแน่น (ต้น/ไร่)</th>
                                        <th className="py-2" style={{ fontWeight: 700, fontSize: 12, color: "#5a7a65", textTransform: "uppercase" }}>คำอธิบาย</th>
                                        <th className="py-2 pe-4 text-end" style={{ fontWeight: 700, fontSize: 12, color: "#5a7a65", textTransform: "uppercase" }}>จัดการ</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {treeDensities.map((row) => (
                                        <tr key={row.id}>
                                            <td className="px-4 py-2" style={{ width: "18%" }}>
                                                <input
                                                    type="text"
                                                    value={row.treeSpacing}
                                                    onChange={(e) => updateDensityField(row.id, "treeSpacing", e.target.value)}
                                                    style={{ ...INPUT_STYLE, padding: "6px 10px" }}
                                                />
                                            </td>
                                            <td className="py-2" style={{ width: "18%" }}>
                                                <input
                                                    type="number"
                                                    value={row.treeDensityHa}
                                                    onChange={(e) => updateDensityField(row.id, "treeDensityHa", e.target.value)}
                                                    style={{ ...INPUT_STYLE, padding: "6px 10px" }}
                                                />
                                            </td>
                                            <td className="py-2" style={{ width: "15%", color: "#5a7a65" }}>
                                                {row.treeDensityRai}
                                            </td>
                                            <td className="py-2" style={{ width: "29%" }}>
                                                <input
                                                    type="text"
                                                    value={row.desc ?? ""}
                                                    onChange={(e) => updateDensityField(row.id, "desc", e.target.value)}
                                                    style={{ ...INPUT_STYLE, padding: "6px 10px" }}
                                                />
                                            </td>
                                            <td className="py-2 pe-4">
                                                <div className="d-flex justify-content-end align-items-center gap-2">
                                                    {densityRowError[row.id] && (
                                                        <span style={{ fontSize: 11.5, color: "#dc2626" }}>{densityRowError[row.id]}</span>
                                                    )}
                                                    <button
                                                        onClick={() => saveDensityRow(row.id)}
                                                        disabled={densityBusyId === row.id}
                                                        className="btn btn-sm"
                                                        title="บันทึก"
                                                        style={{ background: "#edfaf3", color: "#1e7a47", border: "none", borderRadius: 8, padding: "6px 10px" }}
                                                    >
                                                        <i className="bi bi-check-lg" />
                                                    </button>
                                                    <button
                                                        onClick={() => setPendingDeleteDensityId(row.id)}
                                                        disabled={densityBusyId === row.id}
                                                        className="btn btn-sm"
                                                        title="ลบ"
                                                        style={{ background: "#fdecec", color: "#c53030", border: "none", borderRadius: 8, padding: "6px 10px" }}
                                                    >
                                                        <i className="bi bi-trash" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}

                                    {/* ── Add new row ── */}
                                    <tr>
                                        <td className="px-4 py-2">
                                            <input
                                                type="text"
                                                placeholder="เช่น 2.5x8"
                                                value={newSpacing}
                                                onChange={(e) => setNewSpacing(e.target.value)}
                                                style={{ ...INPUT_STYLE, padding: "6px 10px" }}
                                            />
                                        </td>
                                        <td className="py-2">
                                            <input
                                                type="number"
                                                placeholder="เช่น 500"
                                                value={newDensity}
                                                onChange={(e) => setNewDensity(e.target.value)}
                                                style={{ ...INPUT_STYLE, padding: "6px 10px" }}
                                            />
                                        </td>
                                        <td className="py-2" style={{ fontSize: 12, color: "#94a3b8" }}>
                                            คำนวณอัตโนมัติ
                                        </td>
                                        <td className="py-2">
                                            <input
                                                type="text"
                                                placeholder="คำอธิบาย (ไม่บังคับ)"
                                                value={newDesc}
                                                onChange={(e) => setNewDesc(e.target.value)}
                                                style={{ ...INPUT_STYLE, padding: "6px 10px" }}
                                            />
                                        </td>
                                        <td className="py-2 pe-4 text-end">
                                            <button
                                                onClick={addDensityRow}
                                                disabled={addingDensity}
                                                className="btn btn-sm"
                                                title="เพิ่ม"
                                                style={{ background: "#1e7a47", color: "#fff", border: "none", borderRadius: 8, padding: "6px 12px" }}
                                            >
                                                <i className="bi bi-plus-lg me-1" />เพิ่ม
                                            </button>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                            {addDensityError && (
                                <div className="px-4 pb-3" style={{ fontSize: 12.5, color: "#dc2626" }}>
                                    {addDensityError}
                                </div>
                            )}
                        </div>
                    )}
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
                                        <Field required label="Planting Year Map Version" value={region.plantingYearMapVersion} onChange={(v) => updateRegion(region.code, "plantingYearMapVersion", v)} options={toOptions(regionOptions?.plantingYearVersionOptions ?? [])} />
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

            {/* ── Save bar — region-config tab only; the density tab saves/deletes
                 each row immediately instead. ── */}
            {activeTab === "region" && (
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
            )}

            {/* ── Delete-row confirmation popup (replaces window.confirm) ── */}
            {pendingDeleteDensityId !== null && (
                <div
                    onClick={() => setPendingDeleteDensityId(null)}
                    style={{
                        position: "fixed", inset: 0, zIndex: 1050,
                        background: "rgba(15,23,42,0.55)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        padding: 16,
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            background: "#fff", borderRadius: 16, width: "100%", maxWidth: 400,
                            boxShadow: "0 20px 60px rgba(0,0,0,0.3)", overflow: "hidden",
                        }}
                    >
                        <div style={{ padding: "26px 26px 22px" }}>
                            <div style={{
                                width: 52, height: 52, borderRadius: "50%", margin: "0 auto 16px",
                                background: "rgba(239,68,68,0.10)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                color: "#dc2626", fontSize: 24,
                            }}>
                                <i className="bi bi-exclamation-triangle-fill" />
                            </div>
                            <h3 className="fw-bold text-center mb-2" style={{ fontSize: 18, color: "#111827" }}>
                                ลบระบบระยะปลูก &ldquo;{treeDensities.find((r) => r.id === pendingDeleteDensityId)?.treeSpacing}&rdquo;?
                            </h3>
                            <p className="text-center mb-0" style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.6 }}>
                                การลบนี้ไม่สามารถกู้คืนได้
                            </p>
                        </div>
                        <div style={{ display: "flex", gap: 10, padding: "0 26px 24px" }}>
                            <button
                                onClick={() => setPendingDeleteDensityId(null)}
                                disabled={densityBusyId === pendingDeleteDensityId}
                                className="btn"
                                style={{
                                    flex: 1, background: "#f1f5f9", color: "#334155", border: "none",
                                    borderRadius: 10, padding: "10px", fontWeight: 600, fontSize: "0.875rem",
                                }}
                            >
                                ยกเลิก
                            </button>
                            <button
                                onClick={confirmDeleteDensityRow}
                                disabled={densityBusyId === pendingDeleteDensityId}
                                className="btn"
                                style={{
                                    flex: 1, background: "#dc2626", color: "#fff", border: "none",
                                    borderRadius: 10, padding: "10px", fontWeight: 700, fontSize: "0.875rem",
                                }}
                            >
                                {densityBusyId === pendingDeleteDensityId
                                    ? <><span className="spinner-border spinner-border-sm me-2" style={{ width: 14, height: 14 }} />กำลังลบ…</>
                                    : <><i className="bi bi-trash me-1" />ลบ</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
