"use client";

import { useMemo, useState } from "react";
import { Alert, Card } from "@/app/components";

type DatasetCategory = "growth_model" | "density_mapping" | "regional_config" | "allometric" | "biomass_model";
type DatasetStatus = "active" | "draft" | "archived";

type ResearchDataset = {
    id: string;
    name: string;
    category: DatasetCategory;
    version: string;
    description: string;
    updatedAt: string;
    status: DatasetStatus;
};

// Seeded from backend/app/core/constants.py — the live source of truth until
// this page is wired to a datasets API.
const INITIAL_DATASETS: ResearchDataset[] = [
    {
        id: "growth-lookup-table",
        name: "Growth Model Lookup Table",
        category: "growth_model",
        version: "35 ปี (0–35)",
        description: "ตารางค่าการเติบโตของต้นยางพาราตามอายุ",
        updatedAt: "2026-01-15",
        status: "active",
    },
    {
        id: "tree-density-mapping",
        name: "Tree Density Mapping",
        category: "density_mapping",
        version: "v1",
        description: "ตารางแปลงระบบระยะปลูกเป็นความหนาแน่นต้น/ไร่",
        updatedAt: "2025-11-02",
        status: "active",
    },
    {
        id: "region-config-rayong",
        name: "Regional Configuration — Rayong (RAY)",
        category: "regional_config",
        version: "2567",
        description: "ค่าตั้งต้นและเวอร์ชันแผนที่เฉพาะจังหวัดระยอง",
        updatedAt: "2026-02-01",
        status: "active",
    },
    {
        id: "allometric-rrim600",
        name: "Allometric Equation — RRIM 600",
        category: "allometric",
        version: "v2",
        description: "สมการอัลโลเมตริกสำหรับพันธุ์ยาง RRIM 600",
        updatedAt: "2025-08-20",
        status: "draft",
    },
    {
        id: "biomass-hytonen-2018",
        name: "Biomass Assessment Method — Hytonen 2018",
        category: "biomass_model",
        version: "2018",
        description: "วิธีประเมินชีวมวลอ้างอิงจากงานวิจัย Hytonen (2018)",
        updatedAt: "2025-06-11",
        status: "active",
    },
    {
        id: "growth-weibull",
        name: "Weibull Growth Model Coefficients",
        category: "growth_model",
        version: "v1",
        description: "ค่าสัมประสิทธิ์โมเดล Weibull สำหรับการเติบโต",
        updatedAt: "2025-09-30",
        status: "archived",
    },
];

const CATEGORY_META: Record<DatasetCategory, { label: string; bg: string; color: string }> = {
    growth_model: { label: "Growth Model", bg: "rgba(59,130,246,0.10)", color: "#1e40af" },
    density_mapping: { label: "Density Mapping", bg: "rgba(168,85,247,0.10)", color: "#7e22ce" },
    regional_config: { label: "Regional Config", bg: "#edfaf3", color: "#1e7a47" },
    allometric: { label: "Allometric Equation", bg: "rgba(234,179,8,0.12)", color: "#a16207" },
    biomass_model: { label: "Biomass Model", bg: "rgba(236,72,153,0.10)", color: "#be185d" },
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

export default function RndDataManagementPage() {
    const [datasets, setDatasets] = useState<ResearchDataset[]>(INITIAL_DATASETS);
    const [search, setSearch] = useState("");
    const [categoryFilter, setCategoryFilter] = useState<DatasetCategory | "all">("all");
    const [success, setSuccess] = useState<string | null>(null);
    const [pendingDelete, setPendingDelete] = useState<ResearchDataset | null>(null);

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

            {success && (
                <Alert type="success" className="mb-3">
                    {success}
                </Alert>
            )}

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
                                    <td colSpan={6} className="text-center py-5" style={{ color: "#5a7a65" }}>
                                        <i className="bi bi-search d-block mb-2" style={{ fontSize: 26, color: "#c7dbcf" }} />
                                        ไม่พบชุดข้อมูลที่ตรงกับเงื่อนไข
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

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
