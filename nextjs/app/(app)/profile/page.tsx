"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";

const INPUT_STYLE: React.CSSProperties = {
    borderRadius: 10,
    border: "1px solid #e6f0ea",
    fontSize: 14,
    padding: "10px 14px",
    background: "#ffffff",
    width: "100%",
    outline: "none",
    transition: "border-color 0.15s",
};

export default function ProfilePage() {
    const { user, ready, refresh } = useAuth();

    const [firstname, setFirstname] = useState("");
    const [lastname, setLastname] = useState("");
    const [phone, setPhone] = useState("");
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    useEffect(() => {
        if (user?.fullname) {
            const parts = user.fullname.split(" ");
            setFirstname(parts[0] || "");
            setLastname(parts.slice(1).join(" ") || "");
            setPhone(user.phone || "");
        }
    }, [user]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);
        try {
            const res = await fetch("/api/profile/update", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ firstname, lastname, phone }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "เกิดข้อผิดพลาดในการบันทึกข้อมูล");
            setMessage({ type: "success", text: "บันทึกข้อมูลโปรไฟล์เรียบร้อยแล้ว" });
            refresh();
        } catch (err: unknown) {
            setMessage({ type: "error", text: err instanceof Error ? err.message : "เกิดข้อผิดพลาด" });
        } finally {
            setLoading(false);
        }
    };

    if (!ready) return (
        <div className="d-flex align-items-center justify-content-center" style={{ minHeight: 300 }}>
            <div className="spinner-border text-success" role="status" />
        </div>
    );
    if (!user) return null;

    const saveDisabled = loading || !firstname || !lastname;

    return (
        <div className="kc-tw min-h-screen bg-muted/60 pt-[84px] pb-8">
        <div className="container py-5" style={{ maxWidth: 980 }}>

            {/* ── Page title ── */}
            <div className="mb-4">
                <h1 className="fw-bold mb-1" style={{ letterSpacing: "-0.02em", color: "#1a3d2b", fontSize: 26 }}>บัญชีผู้ใช้งาน</h1>
                <div style={{ fontSize: 14, color: "#5a7a65" }}>จัดการข้อมูลส่วนตัวและการเข้าสู่ระบบของคุณ</div>
            </div>

            {/* ── Two-column: identity rail + form ── */}
            <div className="d-flex flex-column flex-md-row align-items-start" style={{ gap: 20 }}>

                {/* Left: identity rail */}
                <div style={{ width: "100%", maxWidth: 300, flexShrink: 0, background: "#ffffff", border: "1px solid #e6f0ea", borderRadius: 16, boxShadow: "0 1px 2px rgba(16,40,28,0.04)", overflow: "hidden", alignSelf: "stretch" }} className="mx-auto mx-md-0">
                    <div style={{ padding: "28px 20px 22px", textAlign: "center", borderBottom: "1px solid #e6f0ea" }}>
                        {user.pictureUrl ? (
                            <img
                                src={user.pictureUrl}
                                alt={user.fullname}
                                referrerPolicy="no-referrer"
                                style={{ width: 88, height: 88, borderRadius: "50%", objectFit: "cover", boxShadow: "0 0 0 4px #ffffff, 0 0 0 6px #d7ede1", marginBottom: 14 }}
                            />
                        ) : (
                            <div style={{
                                width: 88, height: 88, borderRadius: "50%", margin: "0 auto 14px",
                                background: "#1e7a47",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                color: "white", fontSize: 38,
                                boxShadow: "0 0 0 4px #ffffff, 0 0 0 6px #d7ede1",
                            }}>
                                <i className="bi bi-person-fill"></i>
                            </div>
                        )}
                        <div className="fw-bold" style={{ letterSpacing: "-0.01em", color: "#1a3d2b", fontSize: 19, lineHeight: 1.3 }}>{user.fullname || "ผู้ใช้งาน"}</div>
                        <div style={{ fontSize: 13, color: "#5a7a65", wordBreak: "break-all" }}>{user.email || user.username}</div>
                    </div>
                    <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13 }}>
                            <span style={{ color: "#5a7a65", fontWeight: 600 }}>สิทธิ์การใช้งาน</span>
                            <span style={{ background: "#edfaf3", color: "#1e7a47", fontWeight: 700, fontSize: 12, padding: "4px 10px", borderRadius: 50 }}>
                                <i className="bi bi-shield-check me-1" />
                                {user.role === "admin" ? "ผู้ดูแลระบบ" : "ผู้ใช้งานทั่วไป"}
                            </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13 }}>
                            <span style={{ color: "#5a7a65", fontWeight: 600 }}>การเข้าสู่ระบบ</span>
                            {user.provider === "line" ? (
                                <span style={{ background: "#06C755", color: "#fff", fontWeight: 700, fontSize: 12, padding: "4px 10px", borderRadius: 50 }}>
                                    <i className="bi bi-line me-1" />LINE
                                </span>
                            ) : (
                                <span style={{ background: "#f1f6f3", color: "#1a3d2b", fontWeight: 700, fontSize: 12, padding: "4px 10px", borderRadius: 50 }}>
                                    <i className="bi bi-envelope me-1" />อีเมล
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right: form card */}
                <div style={{ flex: 1, width: "100%", background: "#ffffff", border: "1px solid #e6f0ea", borderRadius: 16, boxShadow: "0 1px 2px rgba(16,40,28,0.04)", padding: "28px 28px 24px" }}>
                    <div className="mb-4">
                        <div className="fw-bold" style={{ color: "#1a3d2b", fontSize: 16 }}>แก้ไขข้อมูลส่วนตัว</div>
                        <div style={{ fontSize: 13, color: "#5a7a65", marginTop: 2 }}>ข้อมูลนี้จะแสดงในระบบและใช้ติดต่อคุณ</div>
                    </div>

                    {message && (
                        <div className="rounded-3 mb-4 p-3 d-flex align-items-center gap-2" style={{
                            background: message.type === "success" ? "#edfaf3" : "#fef2f2",
                            border: `1px solid ${message.type === "success" ? "#e6f0ea" : "#fecaca"}`,
                            color: message.type === "success" ? "#1e7a47" : "#991b1b",
                            fontSize: 14, fontWeight: 500,
                        }}>
                            <i className={`bi ${message.type === "success" ? "bi-check-circle-fill" : "bi-exclamation-circle-fill"}`} />
                            {message.text}
                        </div>
                    )}

                    <form onSubmit={handleSubmit}>
                        <div className="row g-4 mb-4">
                            <div className="col-md-6">
                                <label className="fw-medium mb-2 d-block" style={{ fontSize: 13, color: "#1a3d2b" }}>
                                    ชื่อ <span style={{ color: "#ef4444" }}>*</span>
                                </label>
                                <input type="text" style={INPUT_STYLE} value={firstname} onChange={(e) => setFirstname(e.target.value)} placeholder="กรอกชื่อของคุณ" required />
                            </div>
                            <div className="col-md-6">
                                <label className="fw-medium mb-2 d-block" style={{ fontSize: 13, color: "#1a3d2b" }}>
                                    นามสกุล <span style={{ color: "#ef4444" }}>*</span>
                                </label>
                                <input type="text" style={INPUT_STYLE} value={lastname} onChange={(e) => setLastname(e.target.value)} placeholder="กรอกนามสกุลของคุณ" required />
                            </div>
                            <div className="col-md-6">
                                <label className="fw-medium mb-2 d-block" style={{ fontSize: 13, color: "#1a3d2b" }}>อีเมล / ชื่อผู้ใช้</label>
                                <input type="text" style={{ ...INPUT_STYLE, background: "#f3f4f6", color: "#9ca3af" }} value={user.email || user.username || ""} disabled />
                                <div className="mt-1" style={{ fontSize: 12, color: "#9ca3af" }}>ข้อมูลบัญชีไม่สามารถเปลี่ยนแปลงได้</div>
                            </div>
                            <div className="col-md-6">
                                <label className="fw-medium mb-2 d-block" style={{ fontSize: 13, color: "#1a3d2b" }}>เบอร์โทรศัพท์</label>
                                <input type="tel" style={INPUT_STYLE} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08X-XXX-XXXX" />
                            </div>
                        </div>

                        <div className="d-flex justify-content-end pt-4" style={{ borderTop: "1px solid #f1f5f9" }}>
                            <button
                                type="submit"
                                className="btn"
                                disabled={saveDisabled}
                                style={{
                                    background: saveDisabled ? "#e6f0ea" : "#1e7a47",
                                    color: saveDisabled ? "#94a3b8" : "white",
                                    border: "none",
                                    borderRadius: 10,
                                    padding: "10px 24px",
                                    fontWeight: 600,
                                    fontSize: "0.875rem",
                                    boxShadow: "none",
                                    transition: "all 0.15s ease",
                                }}
                            >
                                {loading
                                    ? <><span className="spinner-border spinner-border-sm me-2" style={{ width: 14, height: 14 }} />กำลังบันทึก…</>
                                    : <><i className="bi bi-check2 me-2" />บันทึกข้อมูล</>}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
        </div>
    );
}
