"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { Card, Eyebrow } from "@/app/components";

const HERO_BG =
    "radial-gradient(1200px 500px at -10% -10%, rgba(16,185,129,0.20) 0%, rgba(16,185,129,0) 60%)," +
    "radial-gradient(900px 450px at 110% 0%, rgba(59,130,246,0.18) 0%, rgba(59,130,246,0) 58%)," +
    "radial-gradient(700px 360px at 30% 120%, rgba(245,158,11,0.12) 0%, rgba(245,158,11,0) 55%)," +
    "linear-gradient(135deg, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.86) 100%)";

const INPUT_STYLE: React.CSSProperties = {
    borderRadius: 10,
    border: "1.5px solid #e5e7eb",
    fontSize: 14,
    padding: "10px 14px",
    background: "#fafafa",
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

    const initial = (user.fullname?.[0] ?? "U").toUpperCase();
    const saveDisabled = loading || !firstname || !lastname;

    return (
        <div className="container py-5" style={{ marginTop: "120px", maxWidth: 820 }}>

            {/* ── Hero card ── */}
            <Card className="border-0 shadow-sm mb-4 overflow-hidden">
                <div className="p-4 p-md-5" style={{ background: HERO_BG, borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                    <div className="d-flex flex-wrap align-items-center gap-4">
                        {user.pictureUrl ? (
                            <img
                                src={user.pictureUrl}
                                alt={user.fullname}
                                style={{ width: 80, height: 80, borderRadius: "50%", objectFit: "cover", flexShrink: 0, boxShadow: "0 4px 16px rgba(0,0,0,0.12)" }}
                            />
                        ) : (
                            <div style={{
                                width: 80, height: 80, borderRadius: "50%", flexShrink: 0,
                                background: "linear-gradient(135deg, #065f46 0%, #059669 100%)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                color: "white", fontSize: 32, fontWeight: 700,
                                boxShadow: "0 4px 16px rgba(5,150,105,0.30)",
                            }}>
                                {initial}
                            </div>
                        )}
                        <div style={{ flex: 1 }}>
                            <Eyebrow icon="bi-person-circle" className="mb-2">บัญชีผู้ใช้งาน</Eyebrow>
                            <h1 className="fw-bold mb-1" style={{ letterSpacing: "-0.02em" }}>{user.fullname || "ผู้ใช้งาน"}</h1>
                            <div className="text-muted mb-2" style={{ fontSize: 14 }}>{user.email || user.username}</div>
                            <div className="d-flex flex-wrap gap-2">
                                <span className="badge rounded-pill" style={{ background: "rgba(5,150,105,0.12)", color: "#065f46", fontWeight: 600, fontSize: 12, padding: "5px 12px" }}>
                                    <i className="bi bi-shield-check me-1" />
                                    {user.role === "admin" ? "ผู้ดูแลระบบ" : "ผู้ใช้งานทั่วไป"}
                                </span>
                                {user.provider === "line" && (
                                    <span className="badge rounded-pill" style={{ background: "#06C755", color: "white", fontWeight: 600, fontSize: 12, padding: "5px 12px" }}>
                                        <i className="bi bi-line me-1" />LINE Login
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </Card>

            {/* ── Form card ── */}
            <Card className="border-0 shadow-sm">
                <div className="p-4 p-md-5">
                    <div className="d-flex align-items-center gap-2 mb-4">
                        <i className="bi bi-pencil-square text-success" />
                        <span className="fw-bold">แก้ไขข้อมูลส่วนตัว</span>
                    </div>

                    {message && (
                        <div className="rounded-3 mb-4 p-3 d-flex align-items-center gap-2" style={{
                            background: message.type === "success" ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)",
                            border: `1px solid ${message.type === "success" ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)"}`,
                            color: message.type === "success" ? "#065f46" : "#991b1b",
                            fontSize: 14, fontWeight: 500,
                        }}>
                            <i className={`bi ${message.type === "success" ? "bi-check-circle-fill" : "bi-exclamation-circle-fill"}`} />
                            {message.text}
                        </div>
                    )}

                    <form onSubmit={handleSubmit}>
                        <div className="row g-4 mb-4">
                            <div className="col-md-6">
                                <label className="fw-medium mb-2 d-block" style={{ fontSize: 13, color: "#374151" }}>
                                    ชื่อ <span style={{ color: "#ef4444" }}>*</span>
                                </label>
                                <input type="text" style={INPUT_STYLE} value={firstname} onChange={(e) => setFirstname(e.target.value)} placeholder="กรอกชื่อของคุณ" required />
                            </div>
                            <div className="col-md-6">
                                <label className="fw-medium mb-2 d-block" style={{ fontSize: 13, color: "#374151" }}>
                                    นามสกุล <span style={{ color: "#ef4444" }}>*</span>
                                </label>
                                <input type="text" style={INPUT_STYLE} value={lastname} onChange={(e) => setLastname(e.target.value)} placeholder="กรอกนามสกุลของคุณ" required />
                            </div>
                            <div className="col-md-6">
                                <label className="fw-medium mb-2 d-block" style={{ fontSize: 13, color: "#374151" }}>อีเมล / ชื่อผู้ใช้</label>
                                <input type="text" style={{ ...INPUT_STYLE, background: "#f3f4f6", color: "#9ca3af" }} value={user.email || user.username || ""} disabled />
                                <div className="mt-1" style={{ fontSize: 12, color: "#9ca3af" }}>ข้อมูลบัญชีไม่สามารถเปลี่ยนแปลงได้</div>
                            </div>
                            <div className="col-md-6">
                                <label className="fw-medium mb-2 d-block" style={{ fontSize: 13, color: "#374151" }}>เบอร์โทรศัพท์</label>
                                <input type="tel" style={INPUT_STYLE} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08X-XXX-XXXX" />
                            </div>
                        </div>

                        <div className="d-flex justify-content-end pt-4" style={{ borderTop: "1px solid #f1f5f9" }}>
                            <button
                                type="submit"
                                className="btn"
                                disabled={saveDisabled}
                                style={{
                                    background: saveDisabled ? "#d1fae5" : "linear-gradient(135deg, #065f46 0%, #059669 100%)",
                                    color: saveDisabled ? "#6b7280" : "white",
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
            </Card>
        </div>
    );
}
