"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { Alert, Card, Eyebrow } from "@/app/components";

type UserRecord = {
    id: string;
    email: string;
    username: string;
    fullname: string;
    phone: string;
    role: "user" | "farmer" | "editor" | "admin";
    createdAt: string;
};

const HERO_BG =
    "radial-gradient(1200px 500px at -10% -10%, rgba(16,185,129,0.20) 0%, rgba(16,185,129,0) 60%)," +
    "radial-gradient(900px 450px at 110% 0%, rgba(59,130,246,0.18) 0%, rgba(59,130,246,0) 58%)," +
    "radial-gradient(700px 360px at 30% 120%, rgba(245,158,11,0.12) 0%, rgba(245,158,11,0) 55%)," +
    "linear-gradient(135deg, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.86) 100%)";

const ROLE_META: Record<UserRecord["role"], { bg: string; color: string; label: string }> = {
    admin:  { bg: "rgba(239,68,68,0.10)",   color: "#991b1b", label: "Admin" },
    editor: { bg: "rgba(59,130,246,0.10)",  color: "#1e40af", label: "Editor" },
    farmer: { bg: "rgba(16,185,129,0.10)",  color: "#065f46", label: "Farmer" },
    user:   { bg: "rgba(107,114,128,0.10)", color: "#374151", label: "User" },
};

const TH_STYLE: React.CSSProperties = {
    fontWeight: 600, fontSize: 11,
    textTransform: "uppercase", letterSpacing: "0.5px", color: "#6b7280",
};

function maskEmail(email: string) {
    const [local, domain] = email.split("@");
    if (!domain) return "***";
    return `${local[0] ?? "*"}${"*".repeat(Math.min(local.length - 1, 4))}@${domain}`;
}

function maskName(name: string) {
    if (!name) return "ไม่ระบุชื่อ";
    return name.split(" ").map((p) => (p[0] ?? "") + "*".repeat(Math.min(p.length - 1, 3))).join(" ");
}

function maskPhone(phone: string) {
    if (!phone || phone.length < 4) return "-";
    return phone.slice(0, 3) + "*".repeat(phone.length - 6) + phone.slice(-3);
}

export default function UserManagementPage() {
    const { ready, user } = useAuth();
    const router = useRouter();
    const [users, setUsers] = useState<UserRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [privacyOn, setPrivacyOn] = useState(false);

    useEffect(() => {
        if (ready) {
            if (!user || user.role !== "admin") {
                router.replace("/");
            } else {
                fetchUsers();
            }
        }
    }, [ready, user, router]);

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

    async function handleDeleteUser(userId: string) {
        if (!confirm("คุณแน่ใจหรือไม่ว่าต้องการลบผู้ใช้นี้? การดำเนินการนี้ไม่สามารถย้อนกลับได้")) return;
        try {
            const res = await fetch("/api/admin/users", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: userId }),
            });
            if (res.ok) {
                setUsers((prev) => prev.filter((u) => u.id !== userId));
                setSuccess("ลบผู้ใช้สำเร็จ");
                setTimeout(() => setSuccess(null), 3000);
            } else {
                const data = await res.json();
                setError(data.error || "ไม่สามารถลบผู้ใช้ได้");
            }
        } catch {
            setError("เกิดข้อผิดพลาดในการเชื่อมต่อ");
        }
    }

    if (!ready || loading) {
        return (
            <div className="d-flex align-items-center justify-content-center" style={{ minHeight: 300 }}>
                <div className="spinner-border text-success" role="status" />
            </div>
        );
    }

    return (
        <div className="container py-5" style={{ marginTop: "60px" }}>

            {/* ── Hero card ── */}
            <Card className="border-0 shadow-sm mb-4 overflow-hidden">
                <div className="p-4 p-md-5" style={{ background: HERO_BG, borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                    <div className="d-flex flex-wrap align-items-start justify-content-between gap-3">
                        <div style={{ maxWidth: 640 }}>
                            <Eyebrow icon="bi-shield-check" className="mb-2">แผงควบคุมผู้ดูแลระบบ</Eyebrow>
                            <h1 className="fw-bold mb-2" style={{ letterSpacing: "-0.02em" }}>จัดการผู้ใช้</h1>
                            <div className="text-muted">
                                บัญชีผู้ใช้ทั้งหมด <span className="fw-semibold" style={{ color: "#111827" }}>{users.length}</span> บัญชี
                                {" · "}กำหนดสิทธิ์และจัดการบัญชีผู้ใช้ในระบบ
                            </div>
                        </div>
                        <button
                            className="btn"
                            onClick={() => setPrivacyOn((v) => !v)}
                            style={{
                                background: privacyOn
                                    ? "linear-gradient(135deg, #374151 0%, #4b5563 100%)"
                                    : "linear-gradient(135deg, #0f172a 0%, #334155 100%)",
                                color: "white",
                                border: "none",
                                borderRadius: 10,
                                padding: "9px 18px",
                                fontWeight: 600,
                                fontSize: "0.85rem",
                                boxShadow: "none",
                                transition: "all 0.15s ease",
                                whiteSpace: "nowrap",
                            }}
                        >
                            <i className={`bi ${privacyOn ? "bi-eye" : "bi-eye-slash"} me-2`} />
                            {privacyOn ? "แสดงข้อมูลจริง" : "ซ่อนข้อมูลส่วนตัว"}
                        </button>
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
                    <div className="d-flex align-items-start justify-content-between gap-3 w-100">
                        <div>{success}</div>
                        <button className="btn btn-sm btn-light border" onClick={() => setSuccess(null)}>ปิด</button>
                    </div>
                </Alert>
            )}

            {/* ── Users table ── */}
            <Card className="border-0 shadow-sm overflow-hidden">
                <div className="table-responsive">
                    <table className="table table-hover align-middle mb-0" style={{ fontSize: 13 }}>
                        <thead className="table-light">
                            <tr>
                                <th className="px-4 py-3" style={TH_STYLE}>ผู้ใช้งาน</th>
                                <th className="py-3" style={TH_STYLE}>บทบาท</th>
                                <th className="py-3" style={TH_STYLE}>เบอร์โทรศัพท์</th>
                                <th className="py-3" style={TH_STYLE}>วันที่เข้าร่วม</th>
                                <th className="px-4 py-3 text-end" style={TH_STYLE}>จัดการ</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map((u) => {
                                const displayName  = privacyOn ? maskName(u.fullname)  : (u.fullname || "ไม่ระบุชื่อ");
                                const displayEmail = privacyOn ? maskEmail(u.email)    : u.email;
                                const displayPhone = privacyOn ? maskPhone(u.phone)    : (u.phone || "-");
                                const initial      = (u.fullname?.[0] || u.email[0]).toUpperCase();
                                const rm           = ROLE_META[u.role];
                                const isSelf       = u.id === user?.id;

                                return (
                                    <tr key={u.id}>
                                        <td className="px-4 py-3">
                                            <div className="d-flex align-items-center gap-3">
                                                <div style={{
                                                    width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
                                                    background: "linear-gradient(135deg, #065f46 0%, #059669 100%)",
                                                    display: "flex", alignItems: "center", justifyContent: "center",
                                                    color: "white", fontSize: 14, fontWeight: 700,
                                                }}>
                                                    {initial}
                                                </div>
                                                <div>
                                                    <div className="fw-medium">{displayName}</div>
                                                    <div className="text-muted" style={{ fontSize: 12 }}>{displayEmail}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="py-3">
                                            <div className="d-flex align-items-center gap-2">
                                                <span className="badge rounded-pill" style={{ background: rm.bg, color: rm.color, fontWeight: 600, fontSize: 11, padding: "4px 10px" }}>
                                                    {rm.label}
                                                </span>
                                                {!isSelf && (
                                                    <select
                                                        className="form-select form-select-sm"
                                                        style={{ width: "auto", borderRadius: 8, border: "1.5px solid #e5e7eb", fontSize: 12, padding: "3px 8px" }}
                                                        value={u.role}
                                                        onChange={(e) => handleRoleChange(u.id, e.target.value)}
                                                    >
                                                        <option value="user">User</option>
                                                        <option value="farmer">Farmer</option>
                                                        <option value="editor">Editor</option>
                                                        <option value="admin">Admin</option>
                                                    </select>
                                                )}
                                            </div>
                                        </td>
                                        <td className="py-3 text-muted">{displayPhone}</td>
                                        <td className="py-3 text-muted" style={{ fontSize: 12 }}>
                                            {new Date(u.createdAt).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" })}
                                        </td>
                                        <td className="px-4 py-3 text-end">
                                            {!isSelf && (
                                                <button
                                                    className="btn"
                                                    onClick={() => handleDeleteUser(u.id)}
                                                    style={{
                                                        background: "rgba(239,68,68,0.08)",
                                                        color: "#991b1b",
                                                        border: "1.5px solid rgba(239,68,68,0.18)",
                                                        borderRadius: 8,
                                                        padding: "5px 12px",
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
                            {users.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="text-center py-5 text-muted">ไม่พบข้อมูลผู้ใช้ในระบบ</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
}
