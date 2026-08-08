"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Alert, Card } from "@/app/components";

type UserRecord = {
    id: string;
    email: string;
    username: string;
    firstName: string;
    lastName: string;
    displayName: string;
    phone: string;
    pictureUrl: string | null;
    role: "user" | "officer" | "admin" | "rd";
    createdAt: string;
};

const PAGE_SIZE = 10;

// Minimal brand green hero — aligned with the redesigned authenticated pages
const HERO_BG =
    "radial-gradient(900px 420px at -5% -20%, rgba(45,158,95,0.16) 0%, rgba(45,158,95,0) 62%)," +
    "radial-gradient(700px 360px at 108% 0%, rgba(30,122,71,0.10) 0%, rgba(30,122,71,0) 58%)," +
    "linear-gradient(135deg, #ffffff 0%, #f8fbf9 100%)";

const ROLE_META: Record<UserRecord["role"], { bg: string; color: string; label: string }> = {
    admin: { bg: "#fef2f2", color: "#c53030", label: "Admin" },
    officer: { bg: "rgba(59,130,246,0.10)", color: "#1e40af", label: "Officer" },
    rd: { bg: "rgba(168,85,247,0.10)", color: "#7e22ce", label: "R&D" },
    user: { bg: "#f1f6f3", color: "#5a7a65", label: "User" },
};

const TH_STYLE: React.CSSProperties = {
    fontWeight: 700, fontSize: 13,
    textTransform: "uppercase", letterSpacing: "0.6px", color: "#5a7a65",
};

export default function UserManagementPage() {
    const { user } = useAuth();
    const [users, setUsers] = useState<UserRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    // Two-step delete confirmation: pendingDelete holds the target user,
    // confirmStep advances 1 → 2 so the admin has to confirm twice.
    const [pendingDelete, setPendingDelete] = useState<UserRecord | null>(null);
    const [confirmStep, setConfirmStep] = useState<1 | 2>(1);
    const [deleting, setDeleting] = useState(false);
    const [page, setPage] = useState(1);

    const filteredUsers = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return users;
        return users.filter((u) =>
            (u.displayName || "").toLowerCase().includes(q) ||
            (u.email || "").toLowerCase().includes(q) ||
            (u.username || "").toLowerCase().includes(q)
        );
    }, [users, search]);

    // Reset to page 1 whenever the search narrows/widens the result set.
    useEffect(() => {
        setPage(1);
    }, [search]);

    const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
    const paginatedUsers = filteredUsers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    useEffect(() => {
        fetchUsers();
    }, []);

    async function fetchUsers() {
        try {
            setLoading(true);
            const res = await fetch("/api/admin/users");
            if (res.ok) {
                const data = await res.json();
                setUsers(data.users);
            } else {
                setError("ไม่สามารถดึงข้อมูลผู้ใช้ได้");
            }
        } catch {
            setError("เกิดข้อผิดพลาดในการเชื่อมต่อ");
        } finally {
            setLoading(false);
        }
    }

    async function handleRoleChange(userId: string, newRole: string) {
        try {
            const res = await fetch("/api/admin/users", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: userId, role: newRole }),
            });
            if (res.ok) {
                setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole as UserRecord["role"] } : u)));
                setSuccess("อัปเดตบทบาทผู้ใช้สำเร็จ");
                setTimeout(() => setSuccess(null), 3000);
            } else {
                const data = await res.json();
                setError(data.error || "ไม่สามารถอัปเดตบทบาทได้");
            }
        } catch {
            setError("เกิดข้อผิดพลาดในการเชื่อมต่อ");
        }
    }

    function openDeleteModal(u: UserRecord) {
        setPendingDelete(u);
        setConfirmStep(1);
    }

    function closeDeleteModal() {
        if (deleting) return;
        setPendingDelete(null);
        setConfirmStep(1);
    }

    async function confirmDeleteUser() {
        if (!pendingDelete) return;
        const userId = pendingDelete.id;
        setDeleting(true);
        try {
            const res = await fetch("/api/admin/users", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: userId }),
            });
            if (res.ok) {
                const data = await res.json().catch(() => ({}));
                setUsers((prev) => prev.filter((u) => u.id !== userId));
                const n = data.deletedProjects ?? 0;
                setSuccess(`ลบผู้ใช้สำเร็จ${n > 0 ? ` (พร้อมโปรเจกต์ ${n} รายการ)` : ""}`);
                setTimeout(() => setSuccess(null), 3000);
                setPendingDelete(null);
                setConfirmStep(1);
            } else {
                const data = await res.json().catch(() => ({}));
                setError(data.error || "ไม่สามารถลบผู้ใช้ได้");
            }
        } catch {
            setError("เกิดข้อผิดพลาดในการเชื่อมต่อ");
        } finally {
            setDeleting(false);
        }
    }

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
                    <h1 className="fw-bold mb-2" style={{ letterSpacing: "-0.02em", color: "#1a3d2b", fontSize: 26 }}>จัดการผู้ใช้</h1>
                    <div style={{ color: "#5a7a65", fontSize: 14 }}>
                        บัญชีผู้ใช้ทั้งหมด <span className="fw-semibold" style={{ color: "#1a3d2b" }}>{users.length}</span> บัญชี
                        {" · "}กำหนดสิทธิ์และจัดการบัญชีผู้ใช้ในระบบ
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
            {success && (
                <Alert type="success" className="mb-3">
                    {success}
                </Alert>
            )}

            {/* ── Search toolbar ── */}
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
                <div style={{ position: "relative", flex: "1 1 280px", maxWidth: 420 }}>
                    <i className="bi bi-search" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: 14 }} />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="ค้นหาชื่อ อีเมล หรือชื่อผู้ใช้…"
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
                <div style={{ fontSize: 13, color: "#5a7a65" }}>
                    แสดง <span style={{ fontWeight: 700, color: "#1a3d2b" }}>{filteredUsers.length}</span> จาก {users.length} บัญชี
                </div>
            </div>

            {/* ── Users table ── */}
            <div style={{ background: "#fff", border: "1px solid #e6f0ea", borderRadius: 16, boxShadow: "0 1px 2px rgba(16,40,28,0.04)", overflow: "hidden" }}>
                <div className="table-responsive">
                    <table className="table table-hover align-middle mb-0" style={{ fontSize: 13 }}>
                        <thead style={{ background: "#f8fbf9" }}>
                            <tr>
                                <th className="px-4 py-3" style={TH_STYLE}>ผู้ใช้งาน</th>
                                <th className="py-3" style={TH_STYLE}>บทบาท</th>
                                <th className="py-3" style={TH_STYLE}>เบอร์โทรศัพท์</th>
                                <th className="py-3" style={TH_STYLE}>วันที่เข้าร่วม</th>
                                <th className="px-4 py-3 text-end" style={TH_STYLE}>จัดการ</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedUsers.map((u) => {
                                const displayName = u.displayName || "ไม่ระบุชื่อ";
                                const displayEmail = u.email;
                                const displayPhone = u.phone || "-";
                                const initial = (u.displayName?.[0] || u.email[0]).toUpperCase();
                                const rm = ROLE_META[u.role] ?? ROLE_META.user;
                                const isSelf = u.id === user?.id;

                                return (
                                    <tr key={u.id}>
                                        <td className="px-4 py-3">
                                            <div className="d-flex align-items-center gap-3">
                                                {u.pictureUrl ? (
                                                    <img
                                                        src={u.pictureUrl}
                                                        alt={displayName}
                                                        referrerPolicy="no-referrer"
                                                        style={{ width: 40, height: 40, borderRadius: "50%", flexShrink: 0, objectFit: "cover" }}
                                                    />
                                                ) : (
                                                    <div style={{
                                                        width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
                                                        background: "linear-gradient(135deg, #1e7a47 0%, #2d9e5f 100%)",
                                                        display: "flex", alignItems: "center", justifyContent: "center",
                                                        color: "white", fontSize: 14, fontWeight: 700,
                                                    }}>
                                                        {initial}
                                                    </div>
                                                )}
                                                <div>
                                                    <div className="fw-semibold" style={{ color: "#1a3d2b" }}>
                                                        {displayName}
                                                        {isSelf && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: "#1e7a47", background: "#edfaf3", padding: "2px 7px", borderRadius: 50, verticalAlign: "middle" }}>คุณ</span>}
                                                    </div>
                                                    <div style={{ fontSize: 12, color: "#5a7a65" }}>{displayEmail}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="py-3">
                                            <div className="d-flex align-items-center gap-2">
                                                <span className="badge rounded-pill" style={{ background: rm.bg, color: rm.color, fontWeight: 600, fontSize: 13, padding: "4px 10px" }}>
                                                    {rm.label}
                                                </span>
                                                {!isSelf && (
                                                    <select
                                                        className="form-select form-select-sm"
                                                        style={{ width: "auto", borderRadius: 8, border: "1px solid #e6f0ea", fontSize: 12, padding: "3px 28px 3px 8px", color: "#1a3d2b" }}
                                                        value={u.role}
                                                        onChange={(e) => handleRoleChange(u.id, e.target.value)}
                                                    >
                                                        <option value="user">User</option>
                                                        <option value="officer">Officer</option>
                                                        <option value="rd">R&D</option>
                                                        <option value="admin">Admin</option>
                                                    </select>
                                                )}
                                            </div>
                                        </td>
                                        <td className="py-3" style={{ color: "#5a7a65" }}>{displayPhone}</td>
                                        <td className="py-3" style={{ fontSize: 13, color: "#5a7a65" }}>
                                            {new Date(u.createdAt).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" })}
                                        </td>
                                        <td className="px-4 py-3 text-end">
                                            {!isSelf && (
                                                <button
                                                    className="btn"
                                                    onClick={() => openDeleteModal(u)}
                                                    style={{
                                                        background: "#fef2f2",
                                                        color: "#c53030",
                                                        border: "1px solid #fecaca",
                                                        borderRadius: 9,
                                                        padding: "5px 13px",
                                                        fontWeight: 600,
                                                        fontSize: "0.8rem",
                                                        transition: "all 0.15s ease",
                                                    }}
                                                >
                                                    <i className="bi bi-trash me-1" />ลบ
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                            {paginatedUsers.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="text-center py-5" style={{ color: "#5a7a65" }}>
                                        <i className="bi bi-search d-block mb-2" style={{ fontSize: 26, color: "#c7dbcf" }} />
                                        {search
                                            ? <>ไม่พบผู้ใช้ที่ตรงกับ “{search}”</>
                                            : "ไม่พบข้อมูลผู้ใช้ในระบบ"}
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

            {/* ── Two-step delete confirmation modal ── */}
            {pendingDelete && (
                <div
                    onClick={closeDeleteModal}
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
                                background: confirmStep === 1 ? "rgba(239,68,68,0.10)" : "rgba(239,68,68,0.16)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                color: "#dc2626", fontSize: 24,
                            }}>
                                <i className={`bi ${confirmStep === 1 ? "bi-exclamation-triangle-fill" : "bi-trash3-fill"}`} />
                            </div>

                            {confirmStep === 1 ? (
                                <>
                                    <h3 className="fw-bold text-center mb-2" style={{ fontSize: 19, color: "#111827" }}>
                                        ลบผู้ใช้ &ldquo;{pendingDelete.displayName || pendingDelete.email}&rdquo;?
                                    </h3>
                                    <p className="text-center mb-0" style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.6 }}>
                                        การลบผู้ใช้นี้จะ<strong style={{ color: "#dc2626" }}>ลบโปรเจกต์และแปลงทั้งหมด</strong>ของเขาไปด้วยอย่างถาวร
                                        และ<strong>ไม่สามารถกู้คืนได้</strong>
                                    </p>
                                </>
                            ) : (
                                <>
                                    <h3 className="fw-bold text-center mb-2" style={{ fontSize: 19, color: "#dc2626" }}>
                                        ยืนยันอีกครั้ง
                                    </h3>
                                    <p className="text-center mb-0" style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.6 }}>
                                        ยืนยันครั้งสุดท้าย ข้อมูลของ
                                        {" "}<strong style={{ color: "#111827" }}>{pendingDelete.displayName || pendingDelete.email}</strong>{" "}
                                        และโปรเจกต์ทั้งหมดจะถูกลบถาวรทันที
                                    </p>
                                </>
                            )}
                        </div>

                        <div style={{ display: "flex", gap: 10, padding: "0 26px 24px" }}>
                            <button
                                onClick={closeDeleteModal}
                                disabled={deleting}
                                className="btn"
                                style={{
                                    flex: 1, background: "#f1f5f9", color: "#334155", border: "none",
                                    borderRadius: 10, padding: "10px", fontWeight: 600, fontSize: "0.875rem",
                                }}
                            >
                                ยกเลิก
                            </button>
                            {confirmStep === 1 ? (
                                <button
                                    onClick={() => setConfirmStep(2)}
                                    className="btn"
                                    style={{
                                        flex: 1, background: "#dc2626", color: "#fff", border: "none",
                                        borderRadius: 10, padding: "10px", fontWeight: 600, fontSize: "0.875rem",
                                    }}
                                >
                                    ดำเนินการต่อ
                                </button>
                            ) : (
                                <button
                                    onClick={confirmDeleteUser}
                                    disabled={deleting}
                                    className="btn"
                                    style={{
                                        flex: 1, background: "#b91c1c", color: "#fff", border: "none",
                                        borderRadius: 10, padding: "10px", fontWeight: 700, fontSize: "0.875rem",
                                    }}
                                >
                                    {deleting
                                        ? <><span className="spinner-border spinner-border-sm me-2" style={{ width: 14, height: 14 }} />กำลังลบ…</>
                                        : <><i className="bi bi-trash me-1" />ลบถาวร</>}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
