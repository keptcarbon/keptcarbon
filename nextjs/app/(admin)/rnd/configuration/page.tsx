"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, Card } from "@/app/components";
import { ALLOMETRY_OPTIONS } from "@/lib/allometry";
import { GROWTH_MODEL_OPTIONS } from "@/lib/growth-model";

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

// GET /api/rnd/region-config row — one saved tbl_region_config per province,
// shown in the "รายการค่าตั้งต้น" tab.
type SavedRegionConfig = {
    pCode: string;
    provinceName: string;
    region: string | null;
    luVersion: number;
    plantingYearVersion: number | null; // null = no planting-year map yet
    defaultSpacing: string;
    defaultClone: string;
    defaultGrowth: string;
    defaultAllometry: string;
    biomassProfileVersion: string;
};

const TH_STYLE: React.CSSProperties = {
    fontWeight: 700, fontSize: 12,
    textTransform: "uppercase", letterSpacing: "0.6px", color: "#5a7a65",
};

function optionLabel(options: readonly { label: string; value: string }[], value: string): string {
    return options.find((o) => o.value === value)?.label ?? value;
}

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
    biomassProfileVersion: string;
};


// GET /api/rnd/region-config-options response shape — the saved
// tbl_region_config row (if any) for a province, plus each dropdown's real
// option list sourced from whichever table owns that data.
type RegionConfigOptions = {
    config: {
        pCode: string;
        pName: string;
        luVersion: number;
        plantingYearVersion: number | null;
        defaultSpacing: string;
        defaultClone: string;
        defaultGrowth: string;
        defaultAllometry: string;
        biomassProfileVersion: string;
    } | null;
    plantingYearVersionOptions: VersionOption[];
    luVersionOptions: VersionOption[];
    spacingOptions: string[];
    cloneOptions: string[];
    growthOptions: string[];
    allometryOptions: string[];
    biomassProfileVersionOptions: VersionOption[];
};

// An imported dataset version (tbl_dataset_version) and its status.
type VersionOption = { value: string; status: "draft" | "active" | "archived" };

const VERSION_STATUS_LABEL: Record<VersionOption["status"], string> = {
    active: "ใช้งานอยู่",
    draft: "ฉบับร่าง",
    archived: "เก็บถาวร",
};

// After a save: the chosen version is active, the previously active one archived.
function restatus(versions: VersionOption[], chosen: string): VersionOption[] {
    return versions.map((v) =>
        v.value === chosen ? { ...v, status: "active" }
            : v.status === "active" ? { ...v, status: "archived" }
            : v
    );
}

function toVersionOptions(versions: VersionOption[]) {
    return versions.map((v) => ({ label: `${v.value} (${VERSION_STATUS_LABEL[v.status]})`, value: v.value }));
}

// Planting Year Map can be "none": the province is served with LU data only,
// and users must enter the year of planting themselves (backend E04 otherwise).
const NO_PLANTING_YEAR_MAP = "none";
const NO_PLANTING_YEAR_MAP_LABEL = "ยังไม่มีแผนที่ปีปลูก (ผู้ใช้ต้องระบุปีปลูกเอง)";

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

type ConfigTabKey = "list" | "region";

const CONFIG_TABS: { key: ConfigTabKey; label: string }[] = [
    { key: "list", label: "รายการค่าตั้งต้น" },
    { key: "region", label: "ค่าตั้งต้นรายภูมิภาค (Region Config)" },
];

export default function RndConfigurationPage() {
    const [activeTab, setActiveTab] = useState<ConfigTabKey>("list");
    const [regions, setRegions] = useState<RegionConfigRow[]>([]);

    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState<string | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);

    // ── รายการค่าตั้งต้น tab — every saved tbl_region_config row. ──
    const [savedConfigs, setSavedConfigs] = useState<SavedRegionConfig[]>([]);
    const [savedConfigsLoading, setSavedConfigsLoading] = useState(true);
    const [savedConfigsError, setSavedConfigsError] = useState(false);
    const [listRegion, setListRegion] = useState("");
    const [listSearch, setListSearch] = useState("");

    // Regions that actually have a saved config, for the list's filter dropdown.
    const listRegions = useMemo(
        () => Array.from(new Set(savedConfigs.map((c) => c.region).filter((r): r is string => !!r))).sort(),
        [savedConfigs]
    );

    const filteredConfigs = useMemo(() => {
        const q = listSearch.trim().toLowerCase();
        return savedConfigs.filter((c) => {
            if (listRegion && c.region !== listRegion) return false;
            if (!q) return true;
            return [
                c.provinceName, c.pCode, String(c.plantingYearVersion ?? ""), String(c.luVersion),
                c.biomassProfileVersion, c.defaultSpacing, c.defaultClone,
                optionLabel(GROWTH_MODEL_OPTIONS, c.defaultGrowth), optionLabel(ALLOMETRY_OPTIONS, c.defaultAllometry),
            ].some((v) => v.toLowerCase().includes(q));
        });
    }, [savedConfigs, listRegion, listSearch]);

    async function loadSavedConfigs() {
        setSavedConfigsError(false);
        try {
            const res = await fetch("/api/rnd/region-config/");
            if (!res.ok) throw new Error();
            const data = await res.json();
            setSavedConfigs(data.configs ?? []);
        } catch {
            setSavedConfigsError(true);
        } finally {
            setSavedConfigsLoading(false);
        }
    }

    useEffect(() => {
        void loadSavedConfigs();
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
                            plantingYearMapVersion: cfg.plantingYearVersion === null ? NO_PLANTING_YEAR_MAP : String(cfg.plantingYearVersion),
                            plantingYearMapQaVersion: "",
                            defaultSpacingSystem: cfg.defaultSpacing,
                            defaultRubberClone: cfg.defaultClone,
                            defaultModel: cfg.defaultGrowth,
                            defaultBiomassAssessmentMethod: cfg.defaultAllometry,
                            biomassProfileVersion: cfg.biomassProfileVersion,
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
                biomassProfileVersion: "",
            },
        ]);
    }

    function updateRegion(code: string, field: keyof RegionConfigRow, value: string) {
        setRegions((prev) =>
            prev.map((row) => (row.code === code ? { ...row, [field]: value } : row))
        );
        // Field values changed since the last check -- the stale result no
        // longer reflects what's on screen, so drop it rather than show a
        // check mark for parameters that have since been edited.
        setValidateResult((prev) => {
            if (!(code in prev)) return prev;
            const next = { ...prev };
            delete next[code];
            return next;
        });
    }

    // ── "ตรวจสอบพารามิเตอร์" — lets an editor confirm, before saving, that a
    // candidate clone/growth/allometry combination actually has rows in
    // tbl_biomass_profile (mirrors CarbonService's exact lookup). Each option
    // individually exists in the dropdown's source table, but the three
    // together not sharing a row would otherwise only surface as a silently
    // empty carbon calculation later. ──
    const [validatingCode, setValidatingCode] = useState<string | null>(null);
    const [validateResult, setValidateResult] = useState<
        Record<string, { valid: boolean; rowCount: number; ageMin: number | null; ageMax: number | null } | { error: string }>
    >({});

    async function validateRegionParams(region: RegionConfigRow) {
        setValidatingCode(region.code);
        setValidateResult((prev) => {
            const next = { ...prev };
            delete next[region.code];
            return next;
        });
        try {
            const res = await fetch("/api/rnd/region-config/validate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    pCode: region.code,
                    defaultClone: region.defaultRubberClone,
                    defaultGrowth: region.defaultModel,
                    defaultAllometry: region.defaultBiomassAssessmentMethod,
                    biomassProfileVersion: region.biomassProfileVersion,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "ตรวจสอบไม่สำเร็จ");
            setValidateResult((prev) => ({ ...prev, [region.code]: data }));
        } catch (err) {
            setValidateResult((prev) => ({
                ...prev,
                [region.code]: { error: err instanceof Error ? err.message : "ตรวจสอบไม่สำเร็จ" },
            }));
        } finally {
            setValidatingCode(null);
        }
    }

    // All 6 region-config dropdowns are required — block Save until whatever
    // province is currently being edited has every one of them filled in.
    const regionFieldsIncomplete =
        activeTab === "region" &&
        !!filterPCode &&
        visibleRegions.some((r) =>
            !r.plantingYearMapVersion || !r.luMapVersion || !r.defaultSpacingSystem ||
            !r.defaultRubberClone || !r.defaultModel || !r.defaultBiomassAssessmentMethod ||
            !r.biomassProfileVersion
        );

    // Save also requires a passing "ตรวจสอบพารามิเตอร์" check for the province
    // currently being edited -- updateRegion() clears validateResult on any
    // field edit, so an unvalidated or stale result blocks Save the same way
    // an unrun one does.
    const currentValidation = filterPCode ? validateResult[filterPCode] : undefined;
    const regionNotValidated =
        activeTab === "region" &&
        !!filterPCode &&
        !regionFieldsIncomplete &&
        (!currentValidation || "error" in currentValidation || !currentValidation.valid);

    // Opens a province's config in the edit tab (from the list's "แก้ไข").
    function editConfig(pCode: string) {
        const province = provinces.find((p) => p.pCode === pCode);
        if (province) setFilterRegion(province.region);
        setFilterPCode(pCode);
        setSaveError(null);
        setActiveTab("region");
    }

    // Region config saves via the bottom "บันทึกการตั้งค่า" bar.
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
                    plantingYearVersion: region.plantingYearMapVersion === NO_PLANTING_YEAR_MAP ? null : Number(region.plantingYearMapVersion),
                    biomassProfileVersion: region.biomassProfileVersion,
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
            setSuccess(
                `บันทึกค่าตั้งต้นสำหรับ ${region.provinceName} (${region.code}) สำเร็จ — เวอร์ชันที่เลือกถูกตั้งเป็นใช้งานอยู่แล้ว` +
                (data.distributionFound === false
                    ? " (ยังไม่มี Planting Year Distribution สำหรับ LU + Planting Year คู่นี้ กรุณานำเข้าที่หน้าจัดการข้อมูล)"
                    : "")
            );
            setTimeout(() => setSuccess(null), 6000);
            void loadSavedConfigs();
            // Relabel the version dropdowns to match the new active/archived statuses.
            setRegionOptions((prev) => prev && {
                ...prev,
                plantingYearVersionOptions: region.plantingYearMapVersion === NO_PLANTING_YEAR_MAP
                    ? prev.plantingYearVersionOptions.map((v) => (v.status === "active" ? { ...v, status: "archived" } : v))
                    : restatus(prev.plantingYearVersionOptions, region.plantingYearMapVersion),
                luVersionOptions: restatus(prev.luVersionOptions, region.luMapVersion),
                biomassProfileVersionOptions: restatus(prev.biomassProfileVersionOptions, region.biomassProfileVersion),
            });
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

            {activeTab === "list" && (
                <>
                    {/* ── Toolbar: ภาค filter · search · add, on one line ── */}
                    <div className="d-flex flex-nowrap align-items-center gap-2 mb-3">
                        <select
                            value={listRegion}
                            onChange={(e) => setListRegion(e.target.value)}
                            className="form-select"
                            style={{ width: "auto", flexShrink: 0, borderRadius: 10, border: "1px solid #e6f0ea", fontSize: 13, color: "#1a3d2b" }}
                        >
                            <option value="">ทุกภาค</option>
                            {listRegions.map((r) => (
                                <option key={r} value={r}>{REGION_LABELS[r] ?? r}</option>
                            ))}
                        </select>
                        <div style={{ position: "relative", flex: "1 1 auto", minWidth: 0, maxWidth: 340 }}>
                            <i className="bi bi-search" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: 14 }} />
                            <input
                                value={listSearch}
                                onChange={(e) => setListSearch(e.target.value)}
                                placeholder="ค้นหาจังหวัด เวอร์ชัน หรือ Allometry…"
                                style={{ width: "100%", borderRadius: 12, border: "1px solid #e6f0ea", background: "#fff", padding: "10px 14px 10px 38px", fontSize: 14, outline: "none", color: "#1a3d2b" }}
                            />
                        </div>
                        <button
                            onClick={() => { setFilterRegion(""); setFilterPCode(""); setSaveError(null); setActiveTab("region"); }}
                            className="btn ms-auto"
                            style={{
                                background: "#1e7a47", color: "#fff", border: "none",
                                borderRadius: 10, padding: "9px 12px", fontWeight: 600, fontSize: "0.85rem",
                                display: "flex", alignItems: "center", gap: 6,
                                width: "auto", flexShrink: 0, whiteSpace: "nowrap",
                            }}
                        >
                            <i className="bi bi-plus-lg" />
                            เพิ่มค่าตั้งต้นจังหวัด
                        </button>
                    </div>
                    <div style={{ background: "#fff", border: "1px solid #e6f0ea", borderRadius: 16, overflow: "hidden" }}>
                        <div className="table-responsive">
                            <table className="table table-hover align-middle mb-0" style={{ fontSize: 13, minWidth: 900 }}>
                                <thead style={{ background: "#f8fbf9" }}>
                                    <tr>
                                        {["จังหวัด", "ภาค", "Planting Year", "LU Map", "Biomass Profile", "ระยะปลูก", "พันธุ์ยาง", "Growth Model / Allometry"].map((h, idx) => (
                                            <th key={h} className={idx === 0 ? "px-4 py-3" : "py-3"} style={TH_STYLE}>{h}</th>
                                        ))}
                                        <th className="px-4 py-3 text-end" style={TH_STYLE}>จัดการ</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredConfigs.map((c) => (
                                        <tr key={c.pCode}>
                                            <td className="px-4 py-3">
                                                <div className="fw-semibold" style={{ color: "#1a3d2b" }}>{c.provinceName}</div>
                                                <div style={{ fontSize: 12, color: "#94a3b8" }}>{c.pCode}</div>
                                            </td>
                                            <td className="py-3" style={{ color: "#5a7a65" }}>{c.region ? REGION_LABELS[c.region] ?? c.region : "-"}</td>
                                            <td className="py-3" style={{ color: c.plantingYearVersion === null ? "#94a3b8" : "#5a7a65" }}>{c.plantingYearVersion ?? "ยังไม่มี"}</td>
                                            <td className="py-3" style={{ color: "#5a7a65" }}>{c.luVersion}</td>
                                            <td className="py-3" style={{ color: "#5a7a65" }}>{c.biomassProfileVersion}</td>
                                            <td className="py-3" style={{ color: "#5a7a65" }}>{c.defaultSpacing}</td>
                                            <td className="py-3" style={{ color: "#5a7a65" }}>{c.defaultClone}</td>
                                            <td className="py-3" style={{ color: "#5a7a65", maxWidth: 240 }}>
                                                <div>{optionLabel(GROWTH_MODEL_OPTIONS, c.defaultGrowth)}</div>
                                                <div style={{ fontSize: 12, color: "#94a3b8" }}>{optionLabel(ALLOMETRY_OPTIONS, c.defaultAllometry)}</div>
                                            </td>
                                            <td className="px-4 py-3 text-end">
                                                <button
                                                    className="btn btn-sm"
                                                    onClick={() => editConfig(c.pCode)}
                                                    style={{ border: "1px solid #e6f0ea", borderRadius: 9, color: "#1a3d2b", background: "#fff", padding: "5px 11px", fontSize: "0.78rem", whiteSpace: "nowrap" }}
                                                >
                                                    <i className="bi bi-pencil me-1" />แก้ไข
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {savedConfigsLoading && (
                                        <tr>
                                            <td colSpan={9} className="text-center py-5" style={{ color: "#5a7a65" }}>กำลังโหลด…</td>
                                        </tr>
                                    )}
                                    {!savedConfigsLoading && savedConfigsError && (
                                        <tr>
                                            <td colSpan={9} className="text-center py-5" style={{ color: "#c53030" }}>
                                                โหลดรายการค่าตั้งต้นไม่สำเร็จ กรุณาลองใหม่อีกครั้ง
                                            </td>
                                        </tr>
                                    )}
                                    {!savedConfigsLoading && !savedConfigsError && filteredConfigs.length === 0 && (
                                        <tr>
                                            <td colSpan={9} className="text-center py-5" style={{ color: "#5a7a65" }}>
                                                {savedConfigs.length === 0 ? "ยังไม่มีค่าตั้งต้นของจังหวัดใด" : "ไม่พบค่าตั้งต้นที่ตรงกับเงื่อนไข"}
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
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
                                    <div style={{ fontSize: 12.5, color: "#5a7a65", background: "#f8fbf9", border: "1px solid #e6f0ea", borderRadius: 10, padding: "8px 12px", marginBottom: 14 }}>
                                        <i className="bi bi-info-circle me-1" />
                                        เมื่อบันทึก เวอร์ชันข้อมูลที่เลือก (Planting Year / LU / Biomass Profile) จะถูกตั้งเป็น <strong>ใช้งานอยู่</strong> และเวอร์ชันเดิมจะถูก <strong>เก็บถาวร</strong>
                                    </div>
                                    <div className="row g-3">
                                        <div className="col-12 col-lg-6">
                                            <Field required label="Planting Year Map Version" value={region.plantingYearMapVersion} onChange={(v) => updateRegion(region.code, "plantingYearMapVersion", v)} options={[...toVersionOptions(regionOptions?.plantingYearVersionOptions ?? []), { label: NO_PLANTING_YEAR_MAP_LABEL, value: NO_PLANTING_YEAR_MAP }]} />
                                        </div>
                                        <div className="col-12 col-lg-6">
                                            <Field required label="LU Map Version" value={region.luMapVersion} onChange={(v) => updateRegion(region.code, "luMapVersion", v)} options={toVersionOptions(regionOptions?.luVersionOptions ?? [])} />
                                        </div>
                                        <div className="col-12 col-lg-6">
                                            <Field required label="Default Spacing System" value={region.defaultSpacingSystem} onChange={(v) => updateRegion(region.code, "defaultSpacingSystem", v)} options={toOptions(regionOptions?.spacingOptions ?? [])} />
                                        </div>
                                        <div className="col-12 col-lg-6">
                                            <Field required label="Default Rubber Clone" value={region.defaultRubberClone} onChange={(v) => updateRegion(region.code, "defaultRubberClone", v)} options={toOptions(regionOptions?.cloneOptions ?? [])} />
                                        </div>
                                        <div className="col-12 col-lg-6">
                                            <Field required label="Default Growth Model" value={region.defaultModel} onChange={(v) => updateRegion(region.code, "defaultModel", v)} options={toOptions(regionOptions?.growthOptions ?? [])} />
                                        </div>
                                        <div className="col-12 col-lg-6">
                                            <Field required label="Biomass Profile Version" value={region.biomassProfileVersion} onChange={(v) => updateRegion(region.code, "biomassProfileVersion", v)} options={toVersionOptions(regionOptions?.biomassProfileVersionOptions ?? [])} />
                                        </div>

                                        {/* ── ย้ายฟิลด์ที่มีข้อความยาวมากมาไว้ด้านล่างสุด และให้กางเต็ม 100% (col-12) ── */}
                                        <div className="col-12">
                                            <Field required label="Default Biomass Assessment Method" value={region.defaultBiomassAssessmentMethod} onChange={(v) => updateRegion(region.code, "defaultBiomassAssessmentMethod", v)} options={toOptions(regionOptions?.allometryOptions ?? [])} />
                                        </div>

                                        {/* ── Validate button ── */}
                                        <div className="col-12">
                                            <div style={FIELD_LABEL_STYLE}>
                                                ตรวจสอบพารามิเตอร์ <span style={{ color: "#dc2626" }}>*</span>
                                            </div>
                                            <div className="d-flex align-items-center gap-2 flex-wrap">
                                            <button
                                                type="button"
                                                onClick={() => validateRegionParams(region)}
                                                disabled={
                                                    validatingCode === region.code ||
                                                    !region.defaultRubberClone || !region.defaultModel || !region.defaultBiomassAssessmentMethod ||
                                                    !region.biomassProfileVersion
                                                }
                                                className="btn btn-sm"
                                                style={{
                                                    background: "#fff", color: "#1e7a47", border: "1px solid #1e7a47",
                                                    borderRadius: 8, padding: "6px 14px", fontWeight: 600, fontSize: 12.5,
                                                }}
                                            >
                                                {validatingCode === region.code
                                                    ? <><span className="spinner-border spinner-border-sm me-2" style={{ width: 11, height: 11 }} />กำลังตรวจสอบ…</>
                                                    : <><i className="bi bi-search me-1" />ตรวจสอบ</>}
                                            </button>
                                            {(() => {
                                                const result = validateResult[region.code];
                                                if (!result) return null;
                                                if ("error" in result) {
                                                    return (
                                                        <span style={{ fontSize: 12.5, color: "#dc2626" }}>
                                                            <i className="bi bi-exclamation-circle me-1" />{result.error}
                                                        </span>
                                                    );
                                                }
                                                if (!result.valid) {
                                                    return (
                                                        <span style={{ fontSize: 12.5, color: "#dc2626" }}>
                                                            <i className="bi bi-x-circle me-1" />
                                                            ไม่พบข้อมูลใน tbl_biomass_profile สำหรับชุดค่านี้ — บันทึกแล้วจะคำนวณคาร์บอนไม่ได้
                                                        </span>
                                                    );
                                                }
                                                return (
                                                    <span style={{ fontSize: 12.5, color: "#1e7a47" }}>
                                                        <i className="bi bi-check-circle me-1" />
                                                        พบข้อมูล {result.rowCount} รายการ
                                                        {result.ageMin !== null && result.ageMax !== null && ` (อายุ ${result.ageMin}-${result.ageMax} ปี)`}
                                                    </span>
                                                );
                                            })()}
                                            </div>
                                        </div>
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

            {/* ── Save bar — region-config tab only. ── */}
            {activeTab === "region" && (
                <div className="d-flex flex-column align-items-end gap-2 mt-4">
                    {regionFieldsIncomplete && (
                        <div style={{ fontSize: 12.5, color: "#dc2626" }}>
                            กรุณาเลือกตัวเลือกที่จำเป็น (*) ให้ครบก่อนบันทึก
                        </div>
                    )}
                    {!regionFieldsIncomplete && regionNotValidated && (
                        <div style={{ fontSize: 12.5, color: "#dc2626" }}>
                            กรุณากด &ldquo;ตรวจสอบพารามิเตอร์&rdquo; และผ่านการตรวจสอบก่อนบันทึก
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
                        disabled={saving || !filterPCode || regionFieldsIncomplete || regionNotValidated}
                        className="btn"
                        style={{
                            background: "#1e7a47", color: "#fff", border: "none",
                            borderRadius: 10, padding: "10px 22px", fontWeight: 600, fontSize: "0.9rem",
                            opacity: !filterPCode || regionFieldsIncomplete || regionNotValidated ? 0.5 : 1,
                        }}
                    >
                        {saving
                            ? <><span className="spinner-border spinner-border-sm me-2" style={{ width: 14, height: 14 }} />กำลังบันทึก…</>
                            : "บันทึกการตั้งค่า"}
                    </button>
                </div>
            )}

        </>
    );
}
