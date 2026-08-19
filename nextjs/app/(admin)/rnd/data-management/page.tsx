"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, Card } from "@/app/components";

type DatasetCategory = "establishment_year_map" | "lulc_map" | "biomass_profile";
type DatasetStatus = "active" | "draft" | "archived";

type ResearchDataset = {
    id: string;
    name: string;
    category: DatasetCategory;
    pCode: string;
    provinceName: string;
    version: string;
    description: string;
    updatedAt: string;
    status: DatasetStatus;
};

// A dataset's p_code ties it to a province in geo_thailand — the same key
// used when importing other data into related tables.
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

// Seeded from backend/app/core/constants.py REGION_CONFIG — the live source
// of truth until this page is wired to a datasets API.
const INITIAL_DATASETS: ResearchDataset[] = [
    {
        id: "establishment-year-rayong",
        name: "Establishment Year Map — Rayong (RAY)",
        category: "establishment_year_map",
        pCode: "RAY",
        provinceName: "ระยอง",
        version: "2026",
        description: "แผนที่ปีปลูกยางพารา จังหวัดระยอง",
        updatedAt: "2026-02-01",
        status: "active",
    },
    {
        id: "establishment-year-qa-rayong",
        name: "Establishment Year Map QA — Rayong (RAY)",
        category: "establishment_year_map",
        pCode: "RAY",
        provinceName: "ระยอง",
        version: "2026 QA",
        description: "แผนที่ปีปลูกฉบับตรวจสอบคุณภาพ จังหวัดระยอง",
        updatedAt: "2026-01-20",
        status: "draft",
    },
    {
        id: "lulc-rayong",
        name: "LULC Map — Rayong (RAY)",
        category: "lulc_map",
        pCode: "RAY",
        provinceName: "ระยอง",
        version: "2567",
        description: "แผนที่การใช้ประโยชน์ที่ดิน จังหวัดระยอง",
        updatedAt: "2025-11-02",
        status: "active",
    },
    {
        id: "biomass-profile-rrim600",
        name: "Biomass Profile — RRIM 600",
        category: "biomass_profile",
        pCode: "RAY",
        provinceName: "ระยอง",
        version: "v1",
        description: "ข้อมูลชีวมวลอ้างอิงพันธุ์ยาง RRIM 600",
        updatedAt: "2025-08-20",
        status: "active",
    },
    {
        id: "biomass-profile-hytonen",
        name: "Biomass Profile — Hytonen 2018",
        category: "biomass_profile",
        pCode: "RAY",
        provinceName: "ระยอง",
        version: "2018",
        description: "ข้อมูลชีวมวลอ้างอิงตามวิธี Hytonen (2018)",
        updatedAt: "2025-06-11",
        status: "archived",
    },
];

const CATEGORY_META: Record<DatasetCategory, { label: string; bg: string; color: string }> = {
    establishment_year_map: { label: "Map of Establishment Year", bg: "rgba(59,130,246,0.10)", color: "#1e40af" },
    lulc_map: { label: "Map of LULC", bg: "rgba(168,85,247,0.10)", color: "#7e22ce" },
    biomass_profile: { label: "Biomass Profile", bg: "rgba(236,72,153,0.10)", color: "#be185d" },
};

const CATEGORY_FILE_EXT: Record<DatasetCategory, string> = {
    establishment_year_map: ".tif",
    lulc_map: ".gpkg",
    biomass_profile: ".csv",
};

const STATUS_META: Record<DatasetStatus, { label: string; bg: string; color: string }> = {
    active: { label: "ใช้งานอยู่", bg: "#edfaf3", color: "#1e7a47" },
    draft: { label: "ฉบับร่าง", bg: "rgba(234,179,8,0.12)", color: "#a16207" },
    archived: { label: "เก็บถาวร", bg: "#f1f6f3", color: "#5a7a65" },
};

const HERO_BG =
    "radial-gradient(900px 420px at -5% -20%, rgba(45,158,95,0.16) 0%, rgba(45,158,95,0) 62%)," +
    "radial-gradient(700px 360px at 108% 0%, rgba(30,122,71,0.10) 0%, rgba(30,122,71,0) 58%)," +
    "linear-gradient(135deg, #ffffff 0%, #f8fbf9 100%)";

const TH_STYLE: React.CSSProperties = {
    fontWeight: 700, fontSize: 12,
    textTransform: "uppercase", letterSpacing: "0.6px", color: "#5a7a65",
};

type TabKey = "list" | "import";

const TABS: { key: TabKey; label: string }[] = [
    { key: "list", label: "รายการข้อมูล" },
    { key: "import", label: "นำเข้าข้อมูล" },
];

type ImportStep = 1 | 2 | 3 | 4;
const LAST_IMPORT_STEP: ImportStep = 4;

const IMPORT_STEPS: { step: ImportStep; label: string }[] = [
    { step: 1, label: "เลือกจังหวัด" },
    { step: 2, label: "เลือกประเภทและไฟล์" },
    { step: 3, label: "ตรวจสอบข้อมูล" },
    { step: 4, label: "ยืนยันการนำเข้า" },
];

export default function RndDataManagementPage() {
    const [activeTab, setActiveTab] = useState<TabKey>("list");
    const [datasets, setDatasets] = useState<ResearchDataset[]>(INITIAL_DATASETS);
    const [search, setSearch] = useState("");
    const [categoryFilter, setCategoryFilter] = useState<DatasetCategory | "all">("all");
    const [success, setSuccess] = useState<string | null>(null);
    const [pendingDelete, setPendingDelete] = useState<ResearchDataset | null>(null);

    // ── Import wizard state ──
    const [importStep, setImportStep] = useState<ImportStep>(1);
    const [importRegion, setImportRegion] = useState("");
    const [importPCode, setImportPCode] = useState("");
    const [importCategory, setImportCategory] = useState<DatasetCategory | "">("");
    const [importVersion, setImportVersion] = useState("");
    const [importFile, setImportFile] = useState<File | null>(null);
    const [importing, setImporting] = useState(false);

    // ── geo_thailand reference (region → province → p_code) ──
    const [provinces, setProvinces] = useState<GeoProvince[]>([]);
    const [provincesLoading, setProvincesLoading] = useState(true);
    const [provincesError, setProvincesError] = useState(false);

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

    const regions = useMemo(
        () => Array.from(new Set(provinces.map((p) => p.region))).sort(),
        [provinces]
    );
    const provincesInRegion = useMemo(
        () => provinces.filter((p) => p.region === importRegion).sort((a, b) => a.nameTh.localeCompare(b.nameTh, "th")),
        [provinces, importRegion]
    );
    const selectedProvince = useMemo(
        () => provinces.find((p) => p.pCode === importPCode) ?? null,
        [provinces, importPCode]
    );

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return datasets.filter((d) => {
            const matchesQuery =
                !q ||
                d.name.toLowerCase().includes(q) ||
                d.description.toLowerCase().includes(q);
            const matchesCategory = categoryFilter === "all" || d.category === categoryFilter;
            return matchesQuery && matchesCategory;
        });
    }, [datasets, search, categoryFilter]);

    function handleAdd() {
        // No datasets API yet — this only demonstrates the UI flow.
        setSuccess("การอัปโหลดชุดข้อมูลใหม่ยังไม่เชื่อมต่อ API จริง");
        setTimeout(() => setSuccess(null), 3000);
    }

    function confirmDelete() {
        if (!pendingDelete) return;
        setDatasets((prev) => prev.filter((d) => d.id !== pendingDelete.id));
        setSuccess(`ลบ “${pendingDelete.name}” แล้ว`);
        setTimeout(() => setSuccess(null), 3000);
        setPendingDelete(null);
    }

    function resetImportWizard() {
        setImportStep(1);
        setImportRegion("");
        setImportPCode("");
        setImportCategory("");
        setImportVersion("");
        setImportFile(null);
    }

    function handleImportFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        setImportFile(e.target.files?.[0] ?? null);
    }

    async function handleConfirmImport() {
        if (!selectedProvince || !importCategory || !importFile) return;
        setImporting(true);
        // No datasets API yet — this only demonstrates the UI flow.
        await new Promise((resolve) => setTimeout(resolve, 700));
        const newDataset: ResearchDataset = {
            id: `imported-${Date.now()}`,
            name: importFile.name.replace(/\.[^/.]+$/, ""),
            category: importCategory,
            pCode: selectedProvince.pCode,
            provinceName: selectedProvince.nameTh,
            version: importVersion.trim() || "v1",
            description: "นำเข้าโดยผู้ใช้งาน R&D",
            updatedAt: new Date().toISOString().slice(0, 10),
            status: "draft",
        };
        setDatasets((prev) => [newDataset, ...prev]);
        setImporting(false);
        setSuccess(`นำเข้า “${newDataset.name}” สำเร็จ`);
        setTimeout(() => setSuccess(null), 3000);
        resetImportWizard();
    }

    return (
        <>
            {/* ── Hero card ── */}
            <Card className="border-0 shadow-sm mb-4 overflow-hidden">
                <div className="p-4 p-md-5" style={{ background: HERO_BG, borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                    <h1 className="fw-bold mb-2" style={{ letterSpacing: "-0.02em", color: "#1a3d2b", fontSize: 26 }}>จัดการข้อมูลอ้างอิงงานวิจัย</h1>
                    <div style={{ color: "#5a7a65", fontSize: 14 }}>
                        ชุดข้อมูลอ้างอิงทั้งหมด <span className="fw-semibold" style={{ color: "#1a3d2b" }}>{datasets.length}</span> ชุด
                        {" · "}จัดการค่าสัมประสิทธิ์ โมเดลการเติบโต และข้อมูลอ้างอิงที่ใช้ในการคำนวณคาร์บอน
                    </div>
                </div>
            </Card>

            {/* ── Tabs ── */}
            <div className="d-flex align-items-center gap-1 mb-4" style={{ borderBottom: "1px solid #e6f0ea" }}>
                {TABS.map((tab) => (
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

            {success && (
                <Alert type="success" className="mb-3">
                    {success}
                </Alert>
            )}

            {activeTab === "list" && (
            <>
            {/* ── Toolbar ── */}
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
                <div className="d-flex flex-wrap align-items-center gap-2">
                    <div style={{ position: "relative", flex: "1 1 260px", maxWidth: 340 }}>
                        <i className="bi bi-search" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: 14 }} />
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="ค้นหาชื่อหรือคำอธิบาย…"
                            style={{ width: "100%", borderRadius: 12, border: "1px solid #e6f0ea", background: "#fff", padding: "10px 14px 10px 38px", fontSize: 14, outline: "none", color: "#1a3d2b" }}
                        />
                    </div>
                    <select
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value as DatasetCategory | "all")}
                        className="form-select"
                        style={{ width: "auto", borderRadius: 10, border: "1px solid #e6f0ea", fontSize: 13, color: "#1a3d2b" }}
                    >
                        <option value="all">ทุกประเภท</option>
                        {Object.entries(CATEGORY_META).map(([key, meta]) => (
                            <option key={key} value={key}>{meta.label}</option>
                        ))}
                    </select>
                </div>
                <button
                    onClick={handleAdd}
                    className="btn"
                    style={{
                        background: "#1e7a47", color: "#fff", border: "none",
                        borderRadius: 10, padding: "9px 18px", fontWeight: 600, fontSize: "0.85rem",
                        display: "flex", alignItems: "center", gap: 6,
                    }}
                >
                    <i className="bi bi-plus-lg" />
                    เพิ่มชุดข้อมูล
                </button>
            </div>

            {/* ── Datasets table ── */}
            <div style={{ background: "#fff", border: "1px solid #e6f0ea", borderRadius: 16, boxShadow: "0 1px 2px rgba(16,40,28,0.04)", overflow: "hidden" }}>
                <div className="table-responsive">
                    <table className="table table-hover align-middle mb-0" style={{ fontSize: 13 }}>
                        <thead style={{ background: "#f8fbf9" }}>
                            <tr>
                                <th className="px-4 py-3" style={TH_STYLE}>ชุดข้อมูล</th>
                                <th className="py-3" style={TH_STYLE}>ประเภท</th>
                                <th className="py-3" style={TH_STYLE}>จังหวัด</th>
                                <th className="py-3" style={TH_STYLE}>เวอร์ชัน</th>
                                <th className="py-3" style={TH_STYLE}>สถานะ</th>
                                <th className="py-3" style={TH_STYLE}>อัปเดตล่าสุด</th>
                                <th className="px-4 py-3 text-end" style={TH_STYLE}>จัดการ</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((d) => {
                                const cat = CATEGORY_META[d.category];
                                const status = STATUS_META[d.status];
                                return (
                                    <tr key={d.id}>
                                        <td className="px-4 py-3">
                                            <div className="fw-semibold" style={{ color: "#1a3d2b" }}>{d.name}</div>
                                            <div style={{ fontSize: 12, color: "#5a7a65" }}>{d.description}</div>
                                        </td>
                                        <td className="py-3">
                                            <span className="badge rounded-pill" style={{ background: cat.bg, color: cat.color, fontWeight: 600, fontSize: 12, padding: "4px 10px" }}>
                                                {cat.label}
                                            </span>
                                        </td>
                                        <td className="py-3" style={{ color: "#5a7a65" }}>
                                            {d.provinceName} <span style={{ color: "#94a3b8" }}>({d.pCode})</span>
                                        </td>
                                        <td className="py-3" style={{ color: "#5a7a65" }}>{d.version}</td>
                                        <td className="py-3">
                                            <span className="badge rounded-pill" style={{ background: status.bg, color: status.color, fontWeight: 600, fontSize: 12, padding: "4px 10px" }}>
                                                {status.label}
                                            </span>
                                        </td>
                                        <td className="py-3" style={{ fontSize: 13, color: "#5a7a65" }}>
                                            {new Date(d.updatedAt).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" })}
                                        </td>
                                        <td className="px-4 py-3 text-end">
                                            <div className="d-flex justify-content-end gap-2">
                                                <button
                                                    className="btn btn-sm"
                                                    onClick={handleAdd}
                                                    style={{ border: "1px solid #e6f0ea", borderRadius: 9, color: "#1a3d2b", background: "#fff", padding: "5px 11px", fontSize: "0.78rem" }}
                                                >
                                                    <i className="bi bi-pencil me-1" />แก้ไข
                                                </button>
                                                <button
                                                    className="btn btn-sm"
                                                    onClick={() => setPendingDelete(d)}
                                                    style={{
                                                        background: "#fef2f2", color: "#c53030", border: "1px solid #fecaca",
                                                        borderRadius: 9, padding: "5px 11px", fontWeight: 600, fontSize: "0.78rem",
                                                    }}
                                                >
                                                    <i className="bi bi-trash me-1" />ลบ
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {filtered.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="text-center py-5" style={{ color: "#5a7a65" }}>
                                        <i className="bi bi-search d-block mb-2" style={{ fontSize: 26, color: "#c7dbcf" }} />
                                        ไม่พบชุดข้อมูลที่ตรงกับเงื่อนไข
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            </>
            )}

            {activeTab === "import" && (
                <div style={{ background: "#fff", border: "1px solid #e6f0ea", borderRadius: 16, padding: "32px 40px", maxWidth: 640, margin: "0 auto" }}>
                    {/* ── Step indicator ── */}
                    <div className="d-flex align-items-start justify-content-center mb-4">
                        {IMPORT_STEPS.map((s, i) => (
                            <div key={s.step} className="d-flex align-items-start">
                                <div className="d-flex flex-column align-items-center" style={{ minWidth: 100 }}>
                                    <div style={{
                                        width: 34, height: 34, borderRadius: "50%",
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                        fontWeight: 700, fontSize: 14,
                                        background: importStep >= s.step ? "#1e7a47" : "#f1f6f3",
                                        color: importStep >= s.step ? "#fff" : "#5a7a65",
                                        boxShadow: importStep === s.step ? "0 0 0 4px #d7f0e1" : "none",
                                        transition: "all 0.15s ease",
                                    }}>
                                        {importStep > s.step ? <i className="bi bi-check-lg" /> : s.step}
                                    </div>
                                    <div style={{
                                        fontSize: 12, marginTop: 6, fontWeight: 600, textAlign: "center",
                                        color: importStep >= s.step ? "#1a3d2b" : "#94a3b8",
                                    }}>
                                        {s.label}
                                    </div>
                                </div>
                                {i < IMPORT_STEPS.length - 1 && (
                                    <div style={{ width: 48, height: 2, background: importStep > s.step ? "#1e7a47" : "#e6f0ea", marginTop: 16 }} />
                                )}
                            </div>
                        ))}
                    </div>

                    {/* ── Step 1: province ── */}
                    {importStep === 1 && (
                        <div>
                            {provincesError ? (
                                <div style={{ fontSize: 13.5, color: "#c53030" }}>
                                    ไม่สามารถโหลดข้อมูลจังหวัดจาก geo_thailand ได้ กรุณาลองใหม่อีกครั้ง
                                </div>
                            ) : (
                                <>
                                    <div className="mb-3">
                                        <div style={{ fontSize: 13.5, fontWeight: 600, color: "#5a7a65", marginBottom: 4 }}>ภาค</div>
                                        <select
                                            value={importRegion}
                                            onChange={(e) => {
                                                setImportRegion(e.target.value);
                                                setImportPCode("");
                                            }}
                                            disabled={provincesLoading}
                                            className="form-select"
                                            style={{ borderRadius: 10, border: "1px solid #e6f0ea", fontSize: 14, color: "#1a3d2b", padding: "9px 12px" }}
                                        >
                                            <option value="">{provincesLoading ? "กำลังโหลด…" : "เลือกภาค…"}</option>
                                            {regions.map((r) => (
                                                <option key={r} value={r}>{REGION_LABELS[r] ?? r}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 13.5, fontWeight: 600, color: "#5a7a65", marginBottom: 4 }}>จังหวัด</div>
                                        <select
                                            value={importPCode}
                                            onChange={(e) => setImportPCode(e.target.value)}
                                            disabled={!importRegion}
                                            className="form-select"
                                            style={{ borderRadius: 10, border: "1px solid #e6f0ea", fontSize: 14, color: "#1a3d2b", padding: "9px 12px" }}
                                        >
                                            <option value="">{importRegion ? "เลือกจังหวัด…" : "เลือกภาคก่อน"}</option>
                                            {provincesInRegion.map((p) => (
                                                <option key={p.pCode} value={p.pCode}>{p.nameTh} ({p.pCode})</option>
                                            ))}
                                        </select>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* ── Step 2: category + file ── */}
                    {importStep === 2 && (
                        <div>
                            <div style={{ fontSize: 13.5, fontWeight: 600, color: "#5a7a65", marginBottom: 12 }}>
                                จังหวัด: <span style={{ color: "#1a3d2b" }}>{selectedProvince?.nameTh} ({selectedProvince?.pCode})</span>
                            </div>
                            <div className="mb-3">
                                <div style={{ fontSize: 13.5, fontWeight: 600, color: "#5a7a65", marginBottom: 4 }}>ประเภทข้อมูล</div>
                                <select
                                    value={importCategory}
                                    onChange={(e) => setImportCategory(e.target.value as DatasetCategory)}
                                    className="form-select"
                                    style={{ borderRadius: 10, border: "1px solid #e6f0ea", fontSize: 14, color: "#1a3d2b", padding: "9px 12px" }}
                                >
                                    <option value="">เลือกประเภทข้อมูล…</option>
                                    {Object.entries(CATEGORY_META).map(([key, meta]) => (
                                        <option key={key} value={key}>{meta.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="mb-3">
                                <div style={{ fontSize: 13.5, fontWeight: 600, color: "#5a7a65", marginBottom: 4 }}>เวอร์ชัน (ถ้ามี)</div>
                                <input
                                    value={importVersion}
                                    onChange={(e) => setImportVersion(e.target.value)}
                                    placeholder="เช่น v1, 2568"
                                    style={{ width: "100%", borderRadius: 10, border: "1px solid #e6f0ea", background: "#fff", padding: "9px 12px", fontSize: 14, outline: "none", color: "#1a3d2b" }}
                                />
                            </div>
                            <div>
                                <div style={{ fontSize: 13.5, fontWeight: 600, color: "#5a7a65", marginBottom: 4 }}>ไฟล์ข้อมูล</div>
                                <label
                                    htmlFor="import-file-input"
                                    style={{
                                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                                        gap: 6, padding: "28px 16px", borderRadius: 12,
                                        border: "1.5px dashed #cfe4d8", background: "#f8fbf9",
                                        cursor: "pointer", textAlign: "center",
                                    }}
                                >
                                    <i className="bi bi-cloud-arrow-up" style={{ fontSize: 26, color: "#1e7a47" }} />
                                    {importFile ? (
                                        <span style={{ fontSize: 13.5, fontWeight: 600, color: "#1a3d2b" }}>{importFile.name}</span>
                                    ) : (
                                        <>
                                            <span style={{ fontSize: 14, fontWeight: 600, color: "#1a3d2b" }}>คลิกเพื่อเลือกไฟล์ หรือวางไฟล์ที่นี่</span>
                                            <span style={{ fontSize: 13.5, color: "#94a3b8" }}>
                                                {importCategory ? `รองรับ ${CATEGORY_FILE_EXT[importCategory]}` : "เลือกประเภทข้อมูลก่อนเพื่อดูชนิดไฟล์ที่รองรับ"}
                                            </span>
                                        </>
                                    )}
                                    <input
                                        id="import-file-input"
                                        type="file"
                                        accept={importCategory ? CATEGORY_FILE_EXT[importCategory] : undefined}
                                        onChange={handleImportFileChange}
                                        style={{ display: "none" }}
                                    />
                                </label>
                            </div>
                        </div>
                    )}

                    {/* ── Step 3: review ── */}
                    {importStep === 3 && (
                        <div>
                            <div style={{ fontSize: 14, color: "#5a7a65", marginBottom: 16 }}>
                                ตรวจสอบข้อมูลก่อนนำเข้าสู่ระบบ
                            </div>
                            <div style={{ border: "1px solid #f1f5f9", borderRadius: 12, overflow: "hidden" }}>
                                {[
                                    { label: "จังหวัด", value: selectedProvince ? `${selectedProvince.nameTh} (${selectedProvince.pCode})` : "-" },
                                    { label: "ประเภทข้อมูล", value: importCategory ? CATEGORY_META[importCategory].label : "-" },
                                    { label: "เวอร์ชัน", value: importVersion.trim() || "v1" },
                                    { label: "ไฟล์", value: importFile?.name ?? "-" },
                                    { label: "ขนาดไฟล์", value: importFile ? `${(importFile.size / 1024).toFixed(1)} KB` : "-" },
                                ].map((row, i) => (
                                    <div
                                        key={row.label}
                                        className="d-flex justify-content-between"
                                        style={{ padding: "12px 16px", borderTop: i === 0 ? "none" : "1px solid #f1f5f9" }}
                                    >
                                        <span style={{ fontSize: 13, color: "#5a7a65" }}>{row.label}</span>
                                        <span style={{ fontSize: 13, fontWeight: 600, color: "#1a3d2b" }}>{row.value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── Step 4: confirm ── */}
                    {importStep === 4 && (
                        <div className="text-center">
                            <div style={{
                                width: 52, height: 52, borderRadius: "50%", margin: "0 auto 16px",
                                background: "#edfaf3", display: "flex", alignItems: "center", justifyContent: "center",
                                color: "#1e7a47", fontSize: 24,
                            }}>
                                <i className="bi bi-upload" />
                            </div>
                            <h3 className="fw-bold mb-2" style={{ fontSize: 18, color: "#1a3d2b" }}>
                                พร้อมนำเข้า &ldquo;{importFile?.name}&rdquo;
                            </h3>
                            <p className="mb-0" style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.6 }}>
                                ระบบจะเพิ่มชุดข้อมูลนี้เป็นสถานะ<strong>ฉบับร่าง</strong>สำหรับจังหวัด
                                <strong> {selectedProvince?.nameTh} ({selectedProvince?.pCode})</strong> ในรายการข้อมูลอ้างอิง
                            </p>
                        </div>
                    )}

                    {/* ── Step navigation ── */}
                    <div className="d-flex justify-content-between mt-4">
                        <button
                            onClick={() => setImportStep((s) => (s > 1 ? ((s - 1) as ImportStep) : s))}
                            disabled={importStep === 1}
                            className="btn"
                            style={{
                                background: "#f1f5f9", color: "#334155", border: "none",
                                borderRadius: 10, padding: "9px 20px", fontWeight: 600, fontSize: "0.85rem",
                                opacity: importStep === 1 ? 0.5 : 1,
                            }}
                        >
                            ย้อนกลับ
                        </button>
                        {importStep < LAST_IMPORT_STEP ? (
                            <button
                                onClick={() => setImportStep((s) => (s < LAST_IMPORT_STEP ? ((s + 1) as ImportStep) : s))}
                                disabled={
                                    (importStep === 1 && !importPCode) ||
                                    (importStep === 2 && (!importCategory || !importFile))
                                }
                                className="btn"
                                style={{
                                    background: "#1e7a47", color: "#fff", border: "none",
                                    borderRadius: 10, padding: "9px 20px", fontWeight: 600, fontSize: "0.85rem",
                                    opacity: (importStep === 1 && !importPCode) || (importStep === 2 && (!importCategory || !importFile)) ? 0.5 : 1,
                                }}
                            >
                                ถัดไป
                            </button>
                        ) : (
                            <button
                                onClick={handleConfirmImport}
                                disabled={importing}
                                className="btn"
                                style={{
                                    background: "#1e7a47", color: "#fff", border: "none",
                                    borderRadius: 10, padding: "9px 20px", fontWeight: 600, fontSize: "0.85rem",
                                }}
                            >
                                {importing
                                    ? <><span className="spinner-border spinner-border-sm me-2" style={{ width: 14, height: 14 }} />กำลังนำเข้า…</>
                                    : "นำเข้าข้อมูล"}
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* ── Delete confirmation modal ── */}
            {pendingDelete && (
                <div
                    onClick={() => setPendingDelete(null)}
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
                            background: "#fff", borderRadius: 16, width: "100%", maxWidth: 440,
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
                            <h3 className="fw-bold text-center mb-2" style={{ fontSize: 19, color: "#111827" }}>
                                ลบ &ldquo;{pendingDelete.name}&rdquo;?
                            </h3>
                            <p className="text-center mb-0" style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.6 }}>
                                ชุดข้อมูลนี้จะถูกลบออกจากระบบและ<strong>ไม่สามารถกู้คืนได้</strong>
                            </p>
                        </div>
                        <div style={{ display: "flex", gap: 10, padding: "0 26px 24px" }}>
                            <button
                                onClick={() => setPendingDelete(null)}
                                className="btn"
                                style={{
                                    flex: 1, background: "#f1f5f9", color: "#334155", border: "none",
                                    borderRadius: 10, padding: "10px", fontWeight: 600, fontSize: "0.875rem",
                                }}
                            >
                                ยกเลิก
                            </button>
                            <button
                                onClick={confirmDelete}
                                className="btn"
                                style={{
                                    flex: 1, background: "#dc2626", color: "#fff", border: "none",
                                    borderRadius: 10, padding: "10px", fontWeight: 700, fontSize: "0.875rem",
                                }}
                            >
                                <i className="bi bi-trash me-1" />ลบถาวร
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
