"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, Card } from "@/app/components";

type QuotaRow = { role: string; maxProjects: number | null; maxPlotsPerProject: number | null };
type HistoryRow = QuotaRow & { id: number; savedAt: string; savedByName: string | null; savedByEmail: string | null };

// Editable copy of a row: the text in each box, "" while unlimited is ticked.
type Draft = { role: string; projects: string; plots: string; projectsUnlimited: boolean; plotsUnlimited: boolean };

const MAX_LIMIT = 100_000;

// Minimal brand green hero — aligned with the other admin pages
const HERO_BG =
    "radial-gradient(900px 420px at -5% -20%, rgba(45,158,95,0.16) 0%, rgba(45,158,95,0) 62%)," +
    "radial-gradient(700px 360px at 108% 0%, rgba(30,122,71,0.10) 0%, rgba(30,122,71,0) 58%)," +
    "linear-gradient(135deg, #ffffff 0%, #f8fbf9 100%)";

const ROLE_META: Record<string, { bg: string; color: string; label: string; hint: string }> = {
    guest: { bg: "#fff7ed", color: "#c2410c", label: "Guest", hint: "ผู้ที่ยังไม่เข้าสู่ระบบ" },
    user: { bg: "#f1f6f3", color: "#5a7a65", label: "User", hint: "ผู้ใช้ที่สมัครสมาชิก" },
    officer: { bg: "rgba(59,130,246,0.10)", color: "#1e40af", label: "Officer", hint: "เจ้าหน้าที่" },
    rd: { bg: "rgba(168,85,247,0.10)", color: "#7e22ce", label: "R&D", hint: "ทีมวิจัย" },
};
const roleMeta = (role: string) => ROLE_META[role] ?? { bg: "#f1f6f3", color: "#5a7a65", label: role, hint: "" };

const TH_STYLE: React.CSSProperties = {
    fontWeight: 700, fontSize: 13,
    textTransform: "uppercase", letterSpacing: "0.6px", color: "#5a7a65",
};

const INPUT_STYLE: React.CSSProperties = {
    width: 96, borderRadius: 10, border: "1px solid #e6f0ea", background: "#fff",
    padding: "6px 10px", fontSize: 14, color: "#1a3d2b",
};

const toDraft = (q: QuotaRow): Draft => ({
    role: q.role,
    projects: q.maxProjects === null ? "" : String(q.maxProjects),
    plots: q.maxPlotsPerProject === null ? "" : String(q.maxPlotsPerProject),
    projectsUnlimited: q.maxProjects === null,
    plotsUnlimited: q.maxPlotsPerProject === null,
});

/** The box's value as a limit: null = unlimited, undefined = not a valid number. */
function parseBox(text: string, unlimited: boolean): number | null | undefined {
    if (unlimited) return null;
    const n = Number(text);
    return Number.isInteger(n) && n >= 1 && n <= MAX_LIMIT ? n : undefined;
}

const fmtLimit = (n: number | null) => (n === null ? "ไม่จำกัด" : n.toLocaleString());

export default function QuotasPage() {
    const [saved, setSaved] = useState<QuotaRow[]>([]);
    const [drafts, setDrafts] = useState<Draft[]>([]);
    const [history, setHistory] = useState<HistoryRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    useEffect(() => {
        fetchQuotas();
    }, []);

    async function fetchQuotas() {
        try {
            setLoading(true);
            const res = await fetch("/api/admin/quotas", { cache: "no-store" });
            if (res.ok) {
                const data = await res.json();
                setSaved(data.quotas);
                setDrafts(data.quotas.map(toDraft));
                setHistory(data.history);
            } else {
                setError("ไม่สามารถดึงข้อมูลการจำกัดจำนวนได้");
            }
        } catch {
            setError("เกิดข้อผิดพลาดในการเชื่อมต่อ");
        } finally {
            setLoading(false);
        }
    }

    const parsed = useMemo(
        () => drafts.map((d) => ({
            role: d.role,
            maxProjects: parseBox(d.projects, d.projectsUnlimited),
            maxPlotsPerProject: parseBox(d.plots, d.plotsUnlimited),
        })),
        [drafts]
    );
    const allValid = parsed.every((p) => p.maxProjects !== undefined && p.maxPlotsPerProject !== undefined);
    const dirty = parsed.some((p, i) =>
        p.maxProjects !== saved[i]?.maxProjects || p.maxPlotsPerProject !== saved[i]?.maxPlotsPerProject
    );

    function update(i: number, patch: Partial<Draft>) {
        setSuccess(null);
        setDrafts((prev) => prev.map((d, j) => (j === i ? { ...d, ...patch } : d)));
    }

    async function handleSave() {
        if (!allValid || !dirty) return;
        setSaving(true);
        setError(null);
        setSuccess(null);
        try {
            const res = await fetch("/api/admin/quotas", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ quotas: parsed }),
            });
            if (res.ok) {
                setSuccess("บันทึกการจำกัดจำนวนเรียบร้อยแล้ว — มีผลกับการบันทึกครั้งถัดไปทันที");
                await fetchQuotas();
            } else {
                const data = await res.json().catch(() => ({}));
                setError(data.error || "บันทึกไม่สำเร็จ");
            }
        } catch {
            setError("เกิดข้อผิดพลาดในการเชื่อมต่อ");
        } finally {
            setSaving(false);
        }
    }

    if (loading && saved.length === 0) {
        return (
            <div className="d-flex align-items-center justify-content-center" style={{ minHeight: 300 }}>
                <div className="spinner-border text-success" role="status" />
            </div>
        );
    }

    return (
        <>
            <style>{`
                .qt-input:focus, .qt-input:focus-visible {
                    outline: none;
                    border-color: #2d9e5f !important;
                    box-shadow: 0 0 0 3px rgba(45, 158, 95, 0.15);
                }
                .qt-input.is-invalid { border-color: #dc3545 !important; }
            `}</style>

            {/* ── Hero card ── */}
            <Card className="border-0 shadow-sm mb-4 overflow-hidden">
                <div className="p-4 p-md-5" style={{ background: HERO_BG, borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                    <h1 className="fw-bold mb-2" style={{ letterSpacing: "-0.02em", color: "#1a3d2b", fontSize: 26 }}>จำกัดจำนวนโครงการและแปลง</h1>
                    <div style={{ color: "#5a7a65", fontSize: 14 }}>
                        กำหนดจำนวนโครงการสูงสุดและจำนวนแปลงต่อโครงการของแต่ละบทบาท
                        {" · "}การลดค่าจะไม่ลบข้อมูลเดิม เพียงแต่ไม่ให้เพิ่มโครงการ/แปลงใหม่เกินจำนวนที่กำหนด
                    </div>
                </div>
            </Card>

            {error && (
                <Alert type="error" className="mb-3">
                    <div className="d-flex align-items-start justify-content-between gap-3 w-100">
                        <div>{error}</div>
                        <button className="btn btn-sm btn-light border" onClick={() => setError(null)}>ปิด</button>
                    </div>
                </Alert>
            )}
            {success && <Alert type="success" className="mb-3">{success}</Alert>}

            {/* ── Quota table ── */}
            <div className="mb-4" style={{ background: "#fff", border: "1px solid #e6f0ea", borderRadius: 16, boxShadow: "0 1px 2px rgba(16,40,28,0.04)", overflow: "hidden" }}>
                <div className="table-responsive">
                    <table className="table align-middle mb-0" style={{ fontSize: 13 }}>
                        <thead style={{ background: "#f8fbf9" }}>
                            <tr>
                                <th className="px-4 py-3" style={TH_STYLE}>บทบาท</th>
                                <th className="py-3" style={TH_STYLE}>โครงการสูงสุด</th>
                                <th className="py-3" style={TH_STYLE}>แปลงต่อโครงการ</th>
                                <th className="px-4 py-3 text-end" style={TH_STYLE}>แปลงรวมสูงสุด</th>
                            </tr>
                        </thead>
                        <tbody>
                            {drafts.map((d, i) => {
                                const rm = roleMeta(d.role);
                                const p = parsed[i];
                                const total =
                                    p.maxProjects === undefined || p.maxPlotsPerProject === undefined
                                        ? "-"
                                        : p.maxProjects === null || p.maxPlotsPerProject === null
                                            ? "ไม่จำกัด"
                                            : (p.maxProjects * p.maxPlotsPerProject).toLocaleString();
                                return (
                                    <tr key={d.role}>
                                        <td className="px-4 py-3">
                                            <span className="badge rounded-pill" style={{ background: rm.bg, color: rm.color, fontWeight: 600, fontSize: 12, padding: "4px 10px" }}>
                                                {rm.label}
                                            </span>
                                            {rm.hint && <div style={{ fontSize: 12, color: "#5a7a65", marginTop: 4 }}>{rm.hint}</div>}
                                        </td>
                                        <td className="py-3">
                                            <LimitCell
                                                value={d.projects}
                                                unlimited={d.projectsUnlimited}
                                                invalid={p.maxProjects === undefined}
                                                onValue={(v) => update(i, { projects: v })}
                                                onUnlimited={(u) => update(i, { projectsUnlimited: u })}
                                                // Guests are always limited -- the limit is what pushes them to register.
                                                lockUnlimited={d.role === "guest"}
                                            />
                                        </td>
                                        <td className="py-3">
                                            <LimitCell
                                                value={d.plots}
                                                unlimited={d.plotsUnlimited}
                                                invalid={p.maxPlotsPerProject === undefined}
                                                onValue={(v) => update(i, { plots: v })}
                                                onUnlimited={(u) => update(i, { plotsUnlimited: u })}
                                                lockUnlimited={d.role === "guest"}
                                            />
                                        </td>
                                        <td className="px-4 py-3 text-end fw-semibold" style={{ color: "#1a3d2b", whiteSpace: "nowrap" }}>{total}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <div className="d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-2 px-4 py-3" style={{ borderTop: "1px solid #f1f5f9" }}>
                    <div style={{ fontSize: 12, color: "#5a7a65" }}>
                        ค่าของ Guest ต้องไม่มากกว่าบทบาทอื่น · Admin ไม่มีสิทธิ์สร้างโครงการ
                    </div>
                    <div className="d-flex gap-2 justify-content-end">
                        <button
                            className="btn btn-sm"
                            disabled={!dirty || saving}
                            onClick={() => { setDrafts(saved.map(toDraft)); setSuccess(null); }}
                            style={{ border: "1px solid #e6f0ea", borderRadius: 8, color: "#1a3d2b", background: "#fff", padding: "6px 14px" }}
                        >
                            ยกเลิก
                        </button>
                        <button
                            className="btn btn-sm btn-success"
                            disabled={!dirty || !allValid || saving}
                            onClick={handleSave}
                            style={{ borderRadius: 8, padding: "6px 14px", fontWeight: 600 }}
                        >
                            {saving ? "กำลังบันทึก…" : "บันทึกการตั้งค่า"}
                        </button>
                    </div>
                </div>
            </div>

            {/* ── History ── */}
            <h2 className="fw-bold mb-3" style={{ color: "#1a3d2b", fontSize: 18 }}>ประวัติการเปลี่ยนแปลง</h2>
            <div style={{ background: "#fff", border: "1px solid #e6f0ea", borderRadius: 16, boxShadow: "0 1px 2px rgba(16,40,28,0.04)", overflow: "hidden" }}>
                <div className="table-responsive">
                    <table className="table table-hover align-middle mb-0" style={{ fontSize: 13 }}>
                        <thead style={{ background: "#f8fbf9" }}>
                            <tr>
                                <th className="px-4 py-3" style={TH_STYLE}>บทบาท</th>
                                <th className="py-3" style={TH_STYLE}>โครงการสูงสุด</th>
                                <th className="py-3" style={TH_STYLE}>แปลงต่อโครงการ</th>
                                <th className="py-3" style={TH_STYLE}>บันทึกโดย</th>
                                <th className="px-4 py-3 text-end" style={TH_STYLE}>เวลา</th>
                            </tr>
                        </thead>
                        <tbody>
                            {history.map((h) => {
                                const rm = roleMeta(h.role);
                                return (
                                    <tr key={h.id}>
                                        <td className="px-4 py-3">
                                            <span className="badge rounded-pill" style={{ background: rm.bg, color: rm.color, fontWeight: 600, fontSize: 12, padding: "4px 10px" }}>
                                                {rm.label}
                                            </span>
                                        </td>
                                        <td className="py-3" style={{ color: "#1a3d2b" }}>{fmtLimit(h.maxProjects)}</td>
                                        <td className="py-3" style={{ color: "#1a3d2b" }}>{fmtLimit(h.maxPlotsPerProject)}</td>
                                        <td className="py-3" style={{ color: "#5a7a65" }}>
                                            {h.savedByName || h.savedByEmail || "ค่าเริ่มต้น"}
                                        </td>
                                        <td className="px-4 py-3 text-end" style={{ color: "#5a7a65", whiteSpace: "nowrap" }}>
                                            {new Date(h.savedAt).toLocaleString("th-TH", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                                        </td>
                                    </tr>
                                );
                            })}
                            {history.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="text-center py-5" style={{ color: "#5a7a65" }}>ยังไม่มีประวัติการเปลี่ยนแปลง</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </>
    );
}

function LimitCell({
    value, unlimited, invalid, onValue, onUnlimited, lockUnlimited,
}: {
    value: string;
    unlimited: boolean;
    invalid: boolean;
    onValue: (v: string) => void;
    onUnlimited: (u: boolean) => void;
    lockUnlimited?: boolean;
}) {
    return (
        <div className="d-flex align-items-center gap-3 flex-wrap">
            <input
                type="number"
                min={1}
                max={MAX_LIMIT}
                step={1}
                inputMode="numeric"
                value={unlimited ? "" : value}
                placeholder={unlimited ? "∞" : ""}
                disabled={unlimited}
                onChange={(e) => onValue(e.target.value)}
                className={`qt-input${invalid ? " is-invalid" : ""}`}
                style={{ ...INPUT_STYLE, background: unlimited ? "#f8fbf9" : "#fff" }}
            />
            {!lockUnlimited && (
                <label className="d-flex align-items-center gap-1 mb-0" style={{ fontSize: 13, color: "#5a7a65", cursor: "pointer" }}>
                    <input type="checkbox" checked={unlimited} onChange={(e) => onUnlimited(e.target.checked)} />
                    ไม่จำกัด
                </label>
            )}
        </div>
    );
}
