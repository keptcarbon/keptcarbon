"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, Card } from "@/app/components";

type AuthLog = {
    id: number;
    userUuid: string | null;
    email: string;
    eventType: "login" | "logout";
    provider: "local" | "line" | "google" | "facebook" | string;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: string;
    displayName: string | null;
    username: string | null;
};

const PAGE_SIZE = 15;

// Minimal brand green hero — aligned with the other admin pages
const HERO_BG =
    "radial-gradient(900px 420px at -5% -20%, rgba(45,158,95,0.16) 0%, rgba(45,158,95,0) 62%)," +
    "radial-gradient(700px 360px at 108% 0%, rgba(30,122,71,0.10) 0%, rgba(30,122,71,0) 58%)," +
    "linear-gradient(135deg, #ffffff 0%, #f8fbf9 100%)";

const EVENT_META: Record<string, { bg: string; color: string; label: string; icon: string }> = {
    login: { bg: "#edfaf3", color: "#1e7a47", label: "เข้าสู่ระบบ", icon: "bi-box-arrow-in-right" },
    logout: { bg: "#f1f6f3", color: "#5a7a65", label: "ออกจากระบบ", icon: "bi-box-arrow-right" },
};

const PROVIDER_META: Record<string, { bg: string; color: string; label: string; icon: string }> = {
    local: { bg: "#f1f6f3", color: "#1a3d2b", label: "อีเมล", icon: "bi-envelope" },
    line: { bg: "#06C755", color: "#fff", label: "LINE", icon: "bi-line" },
    google: { bg: "rgba(66,133,244,0.10)", color: "#1a73e8", label: "Google", icon: "bi-google" },
    facebook: { bg: "rgba(24,119,242,0.10)", color: "#1877f2", label: "Facebook", icon: "bi-facebook" },
};

const TH_STYLE: React.CSSProperties = {
    fontWeight: 700, fontSize: 13,
    textTransform: "uppercase", letterSpacing: "0.6px", color: "#5a7a65",
};

export default function AuthLogsPage() {
    const [logs, setLogs] = useState<AuthLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [providerFilter, setProviderFilter] = useState("all");
    const [eventTypeFilter, setEventTypeFilter] = useState("all");
    const [page, setPage] = useState(1);

    useEffect(() => {
        fetchLogs();
    }, []);

    async function fetchLogs() {
        try {
            setLoading(true);
            const res = await fetch("/api/admin/auth-logs");
            if (res.ok) {
                const data = await res.json();
                setLogs(data.logs);
            } else {
                setError("ไม่สามารถดึงข้อมูลบันทึกการเข้าสู่ระบบได้");
            }
        } catch {
            setError("เกิดข้อผิดพลาดในการเชื่อมต่อ");
        } finally {
            setLoading(false);
        }
    }

    const filteredLogs = useMemo(() => {
        const q = search.trim().toLowerCase();
        return logs.filter((l) => {
            if (providerFilter !== "all" && l.provider !== providerFilter) return false;
            if (eventTypeFilter !== "all" && l.eventType !== eventTypeFilter) return false;
            if (!q) return true;
            return (
                (l.displayName || "").toLowerCase().includes(q) ||
                (l.username || "").toLowerCase().includes(q) ||
                (l.email || "").toLowerCase().includes(q) ||
                (l.ipAddress || "").toLowerCase().includes(q)
            );
        });
    }, [logs, search, providerFilter, eventTypeFilter]);

    // Reset to page 1 whenever a filter narrows/widens the result set.
    useEffect(() => {
        setPage(1);
    }, [search, providerFilter, eventTypeFilter]);

    const totalPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
    const paginatedLogs = filteredLogs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    if (loading) {
        return (
            <div className="d-flex align-items-center justify-content-center" style={{ minHeight: 300 }}>
                <div className="spinner-border text-success" role="status" />
            </div>
        );
    }

    return (
        <>
            {/* ── Hero card ── */}
            <Card className="border-0 shadow-sm mb-4 overflow-hidden">
                <div className="p-4 p-md-5" style={{ background: HERO_BG, borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                    <h1 className="fw-bold mb-2" style={{ letterSpacing: "-0.02em", color: "#1a3d2b", fontSize: 26 }}>บันทึกการเข้าสู่ระบบ</h1>
                    <div style={{ color: "#5a7a65", fontSize: 14 }}>
                        บันทึกทั้งหมด <span className="fw-semibold" style={{ color: "#1a3d2b" }}>{logs.length}</span> รายการ
                        {" · "}ประวัติการเข้าสู่ระบบของผู้ใช้ในระบบ
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

            {/* ── Filter toolbar ── */}
            <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
                <div style={{ position: "relative", flex: "1 1 260px", maxWidth: 380 }}>
                    <i className="bi bi-search" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: 14 }} />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="ค้นหาชื่อ อีเมล หรือ IP…"
                        style={{ width: "100%", borderRadius: 12, border: "1px solid #e6f0ea", background: "#fff", padding: "10px 14px 10px 38px", fontSize: 14, outline: "none", color: "#1a3d2b" }}
                    />
                    {search && (
                        <button
                            onClick={() => setSearch("")}
                            aria-label="ล้างการค้นหา"
                            style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", border: "none", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: 15, lineHeight: 1 }}
                        >
                            <i className="bi bi-x-circle-fill" />
                        </button>
                    )}
                </div>
                <select
                    value={eventTypeFilter}
                    onChange={(e) => setEventTypeFilter(e.target.value)}
                    style={{ borderRadius: 12, border: "1px solid #e6f0ea", background: "#fff", padding: "10px 14px", fontSize: 14, color: "#1a3d2b" }}
                >
                    <option value="all">ทุกประเภท</option>
                    <option value="login">เข้าสู่ระบบ</option>
                    <option value="logout">ออกจากระบบ</option>
                </select>
                <select
                    value={providerFilter}
                    onChange={(e) => setProviderFilter(e.target.value)}
                    style={{ borderRadius: 12, border: "1px solid #e6f0ea", background: "#fff", padding: "10px 14px", fontSize: 14, color: "#1a3d2b" }}
                >
                    <option value="all">ทุกช่องทาง</option>
                    <option value="local">อีเมล</option>
                    <option value="line">LINE</option>
                    <option value="google">Google</option>
                    <option value="facebook">Facebook</option>
                </select>
                <div className="ms-auto" style={{ fontSize: 13, color: "#5a7a65" }}>
                    แสดง <span style={{ fontWeight: 700, color: "#1a3d2b" }}>{filteredLogs.length}</span> จาก {logs.length} รายการ
                </div>
            </div>

            {/* ── Logs table ── */}
            <div style={{ background: "#fff", border: "1px solid #e6f0ea", borderRadius: 16, boxShadow: "0 1px 2px rgba(16,40,28,0.04)", overflow: "hidden" }}>
                <div className="table-responsive">
                    <table className="table table-hover align-middle mb-0" style={{ fontSize: 13 }}>
                        <thead style={{ background: "#f8fbf9" }}>
                            <tr>
                                <th className="px-4 py-3" style={TH_STYLE}>ผู้ใช้งาน</th>
                                <th className="py-3" style={TH_STYLE}>ประเภท</th>
                                <th className="py-3" style={TH_STYLE}>ช่องทาง</th>
                                <th className="py-3" style={TH_STYLE}>IP Address</th>
                                <th className="py-3" style={TH_STYLE}>อุปกรณ์</th>
                                <th className="px-4 py-3 text-end" style={TH_STYLE}>เวลา</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedLogs.map((l) => {
                                const em = EVENT_META[l.eventType] ?? EVENT_META.login;
                                const pm = PROVIDER_META[l.provider] ?? PROVIDER_META.local;
                                const name = l.displayName || l.username || l.email;

                                return (
                                    <tr key={l.id}>
                                        <td className="px-4 py-3">
                                            <div className="fw-semibold" style={{ color: "#1a3d2b" }}>{name}</div>
                                            <div style={{ fontSize: 12, color: "#5a7a65" }}>{l.email}</div>
                                        </td>
                                        <td className="py-3">
                                            <span className="badge rounded-pill" style={{ background: em.bg, color: em.color, fontWeight: 600, fontSize: 12, padding: "4px 10px" }}>
                                                <i className={`bi ${em.icon} me-1`} />
                                                {em.label}
                                            </span>
                                        </td>
                                        <td className="py-3">
                                            <span className="badge rounded-pill" style={{ background: pm.bg, color: pm.color, fontWeight: 600, fontSize: 12, padding: "4px 10px" }}>
                                                <i className={`bi ${pm.icon} me-1`} />
                                                {pm.label}
                                            </span>
                                        </td>
                                        <td className="py-3" style={{ color: "#5a7a65" }}>{l.ipAddress || "-"}</td>
                                        <td className="py-3" style={{ color: "#5a7a65", maxWidth: 220 }}>
                                            <div className="text-truncate" title={l.userAgent || ""}>
                                                {l.userAgent || "-"}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-end" style={{ fontSize: 13, color: "#5a7a65", whiteSpace: "nowrap" }}>
                                            {new Date(l.createdAt).toLocaleString("th-TH", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                                        </td>
                                    </tr>
                                );
                            })}
                            {paginatedLogs.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="text-center py-5" style={{ color: "#5a7a65" }}>
                                        <i className="bi bi-search d-block mb-2" style={{ fontSize: 26, color: "#c7dbcf" }} />
                                        {search || providerFilter !== "all" || eventTypeFilter !== "all"
                                            ? "ไม่พบบันทึกที่ตรงกับเงื่อนไข"
                                            : "ยังไม่มีบันทึกการเข้าสู่ระบบ"}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* ── Pagination ── */}
                {totalPages > 1 && (
                    <div className="d-flex align-items-center justify-content-between gap-2 px-4 py-3" style={{ borderTop: "1px solid #f1f5f9" }}>
                        <div style={{ fontSize: 13, color: "#5a7a65" }}>
                            หน้า {page} จาก {totalPages}
                        </div>
                        <div className="d-flex gap-2">
                            <button
                                className="btn btn-sm"
                                disabled={page <= 1}
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                style={{ border: "1px solid #e6f0ea", borderRadius: 8, color: "#1a3d2b", background: "#fff" }}
                            >
                                <i className="bi bi-chevron-left" />
                            </button>
                            <button
                                className="btn btn-sm"
                                disabled={page >= totalPages}
                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                style={{ border: "1px solid #e6f0ea", borderRadius: 8, color: "#1a3d2b", background: "#fff" }}
                            >
                                <i className="bi bi-chevron-right" />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}