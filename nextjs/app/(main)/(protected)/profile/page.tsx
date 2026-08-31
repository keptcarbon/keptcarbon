"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { formatThaiPhone, strengthFor } from "@/lib/utils";

const ROLE_LABEL: Record<string, string> = {
    user: "ผู้ใช้งานทั่วไป",
    officer: "เจ้าหน้าที่รัฐ",
    rd: "R&D",
    admin: "ผู้ดูแลระบบ",
};

const PROVIDER_BADGE: Record<string, { bg: string; color: string; icon: string; label: string }> = {
    line: { bg: "#06C755", color: "#fff", icon: "bi-line", label: "LINE" },
    google: { bg: "rgba(66,133,244,0.10)", color: "#1a73e8", icon: "bi-google", label: "Google" },
    facebook: { bg: "rgba(24,119,242,0.10)", color: "#1877f2", icon: "bi-facebook", label: "Facebook" },
    local: { bg: "#f1f6f3", color: "#1a3d2b", icon: "bi-envelope", label: "อีเมล" },
};

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

    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmNewPassword, setConfirmNewPassword] = useState("");
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
    const [pwdErrors, setPwdErrors] = useState<{ currentPassword?: string; password?: string; confirmPassword?: string }>({});
    const [pwdLoading, setPwdLoading] = useState(false);
    // pictureUrl that failed to load — fall back to the initial avatar.
    // Tracked by URL so a changed picture recovers on its own.
    const [brokenAvatarUrl, setBrokenAvatarUrl] = useState<string | null>(null);
    const [pwdMessage, setPwdMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const pwdStrength = strengthFor(newPassword.length);

    useEffect(() => {
        if (user) {
            setFirstname(user.firstName || "");
            setLastname(user.lastName || "");
            setPhone(formatThaiPhone(user.phone || ""));
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
                body: JSON.stringify({ firstName: firstname, lastName: lastname, phone }),
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

    // Mirrors the register form's password validation (≥ 6 chars, confirm must match).
    const handlePasswordSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setPwdMessage(null);
        const nextErrors: { currentPassword?: string; password?: string; confirmPassword?: string } = {};
        if (!currentPassword) nextErrors.currentPassword = "กรุณากรอกรหัสผ่านปัจจุบัน";
        if (!newPassword) nextErrors.password = "กรุณากรอกรหัสผ่าน";
        else if (newPassword.length < 6) nextErrors.password = "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร";
        else if (currentPassword && newPassword === currentPassword) nextErrors.password = "รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านปัจจุบัน";
        if (!confirmNewPassword) nextErrors.confirmPassword = "กรุณายืนยันรหัสผ่าน";
        else if (newPassword !== confirmNewPassword) nextErrors.confirmPassword = "รหัสผ่านไม่ตรงกัน กรุณาตรวจสอบอีกครั้ง";
        setPwdErrors(nextErrors);
        if (Object.keys(nextErrors).length > 0) return;

        setPwdLoading(true);
        try {
            const res = await fetch("/api/profile/change-password", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ currentPassword, password: newPassword, confirmPassword: confirmNewPassword }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน");
            setPwdMessage({ type: "success", text: "เปลี่ยนรหัสผ่านเรียบร้อยแล้ว" });
            setCurrentPassword("");
            setNewPassword("");
            setConfirmNewPassword("");
        } catch (err: unknown) {
            setPwdMessage({ type: "error", text: err instanceof Error ? err.message : "เกิดข้อผิดพลาด" });
        } finally {
            setPwdLoading(false);
        }
    };

    if (!ready) return (
        <div className="d-flex align-items-center justify-content-center" style={{ minHeight: 300 }}>
            <div className="spinner-border text-success" role="status" />
        </div>
    );
    if (!user) return null;

    const saveDisabled = loading || !firstname;

    return (
        <div className="kc-tw min-h-screen bg-muted/60 pt-[84px] pb-8">
            <div className="container py-5" style={{ maxWidth: 980 }}>

                {/* ── Page title ── */}
                <div className="mb-4">
                    <h1 className="fw-bold mb-1" style={{ letterSpacing: "-0.02em", color: "#1a3d2b", fontSize: 26 }}>บัญชีผู้ใช้งาน</h1>
                    <div style={{ fontSize: 16, color: "#5a7a65" }}>จัดการข้อมูลส่วนตัวและการเข้าสู่ระบบของคุณ</div>
                </div>

                {/* ── Two-column: identity rail + form ── */}
                <div className="d-flex flex-column flex-md-row align-items-start" style={{ gap: 20 }}>

                    {/* Left: identity rail */}
                    <div style={{ width: "100%", flexShrink: 0, background: "#ffffff", border: "1px solid #e6f0ea", borderRadius: 16, boxShadow: "0 1px 2px rgba(16,40,28,0.04)", overflow: "hidden", alignSelf: "stretch" }} className="mx-auto mx-md-0 md:max-w-[300px]">
                        <div style={{ padding: "28px 20px 22px", textAlign: "center", borderBottom: "1px solid #e6f0ea" }}>
                            {user.pictureUrl && brokenAvatarUrl !== user.pictureUrl ? (
                                <img
                                    src={user.pictureUrl}
                                    alt={user.displayName}
                                    referrerPolicy="no-referrer"
                                    onError={() => setBrokenAvatarUrl(user.pictureUrl ?? null)}
                                    style={{ width: 88, height: 88, borderRadius: "50%", objectFit: "cover", boxShadow: "0 0 0 4px #ffffff, 0 0 0 6px #d7ede1", marginBottom: 14 }}
                                />
                            ) : (
                                <div style={{
                                    width: 88, height: 88, borderRadius: "50%", margin: "0 auto 14px",
                                    background: "#1e7a47",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    color: "white", fontSize: 38, fontWeight: 700,
                                    boxShadow: "0 0 0 4px #ffffff, 0 0 0 6px #d7ede1",
                                }}>
                                    {(user.displayName?.[0] || user.email?.[0] || user.username?.[0] || "?").toUpperCase()}
                                </div>
                            )}
                            <div className="fw-bold" style={{ letterSpacing: "-0.01em", color: "#1a3d2b", fontSize: 19, lineHeight: 1.3 }}>{user.displayName || "ผู้ใช้งาน"}</div>
                            <div style={{ fontSize: 13, color: "#5a7a65", wordBreak: "break-all" }}>{user.email || user.username}</div>
                        </div>
                        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 14 }}>
                                <span style={{ color: "#5a7a65", fontWeight: 600 }}>การเข้าสู่ระบบ</span>
                                {(() => {
                                    const pb = PROVIDER_BADGE[user.provider ?? "local"] ?? PROVIDER_BADGE.local;
                                    return (
                                        <span style={{ background: pb.bg, color: pb.color, fontWeight: 700, fontSize: 12, padding: "4px 10px", borderRadius: 50 }}>
                                            <i className={`bi ${pb.icon} me-1`} />{pb.label}
                                        </span>
                                    );
                                })()}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 14 }}>
                                <span style={{ color: "#5a7a65", fontWeight: 600 }}>สิทธิ์การใช้งาน</span>
                                <span style={{ background: "#edfaf3", color: "#1e7a47", fontWeight: 700, fontSize: 12, padding: "4px 10px", borderRadius: 50 }}>
                                    <i className="bi bi-shield-check me-1" />
                                    {ROLE_LABEL[user.role] ?? ROLE_LABEL.user}
                                </span>
                            </div>
                            <div style={{ fontSize: 13, color: "#5a7a65" }}>
                                ขอเปลี่ยนสิทธิ์การใช้งาน{" "}
                                <Link href="/about-project#contact" style={{ color: "#1e7a47", fontWeight: 600 }}>
                                    ส่งข้อความถึงเรา
                                </Link>
                            </div>
                        </div>
                    </div>

                    {/* Right: form card */}
                    <div style={{ flex: 1, width: "100%", background: "#ffffff", border: "1px solid #e6f0ea", borderRadius: 16, boxShadow: "0 1px 2px rgba(16,40,28,0.04)", padding: "28px 28px 24px" }}>
                        <div className="mb-4">
                            <div className="fw-bold" style={{ color: "#1a3d2b", fontSize: 18 }}>แก้ไขข้อมูลส่วนตัว</div>
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
                                <div className="col-md-4">
                                    <label className="fw-medium mb-2 d-block" style={{ fontSize: 14, color: "#1a3d2b" }}>
                                        ชื่อ <span style={{ color: "#ef4444" }}>*</span>
                                    </label>
                                    <input type="text" style={INPUT_STYLE} value={firstname} onChange={(e) => setFirstname(e.target.value)} placeholder="กรอกชื่อ" required />
                                </div>
                                <div className="col-md-4">
                                    <label className="fw-medium mb-2 d-block" style={{ fontSize: 14, color: "#1a3d2b" }}>
                                        นามสกุล
                                    </label>
                                    <input type="text" style={INPUT_STYLE} value={lastname} onChange={(e) => setLastname(e.target.value)} placeholder="กรอกนามสกุล" />
                                </div>
                                <div className="col-md-4">
                                    <label className="fw-medium mb-2 d-block" style={{ fontSize: 14, color: "#1a3d2b" }}>เบอร์โทรศัพท์</label>
                                    <input type="tel" inputMode="numeric" maxLength={12} style={INPUT_STYLE} value={phone} onChange={(e) => setPhone(formatThaiPhone(e.target.value))} placeholder="090-xxxx-xxxx" />
                                </div>
                            </div>

                            <div className="d-flex justify-content-center pt-4" style={{ borderTop: "1px solid #f1f5f9" }}>
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
                                        width: "50%",
                                    }}
                                >
                                    {loading
                                        ? <><span className="spinner-border spinner-border-sm me-2" style={{ width: 14, height: 14 }} />กำลังบันทึก…</>
                                        : <><i className="bi bi-check2 me-2" />บันทึกข้อมูล</>}
                                </button>
                            </div>
                        </form>

                        {user.provider === "local" && (
                            <div className="mt-4 pt-4" style={{ borderTop: "1px solid #f1f5f9" }}>
                                <div className="mb-4">
                                    <div className="fw-bold" style={{ color: "#1a3d2b", fontSize: 18 }}>เปลี่ยนรหัสผ่าน</div>
                                </div>

                                {pwdMessage && (
                                    <div className="rounded-3 mb-4 p-3 d-flex align-items-center gap-2" style={{
                                        background: pwdMessage.type === "success" ? "#edfaf3" : "#fef2f2",
                                        border: `1px solid ${pwdMessage.type === "success" ? "#e6f0ea" : "#fecaca"}`,
                                        color: pwdMessage.type === "success" ? "#1e7a47" : "#991b1b",
                                        fontSize: 14, fontWeight: 500,
                                    }}>
                                        <i className={`bi ${pwdMessage.type === "success" ? "bi-check-circle-fill" : "bi-exclamation-circle-fill"}`} />
                                        {pwdMessage.text}
                                    </div>
                                )}

                                <form onSubmit={handlePasswordSubmit}>
                                    <div className="row g-4 mb-4">
                                        <div className="col-md-4">
                                            <label className="fw-medium mb-2 d-block" style={{ fontSize: 14, color: "#1a3d2b" }}>
                                                รหัสผ่านปัจจุบัน <span style={{ color: "#ef4444" }}>*</span>
                                            </label>
                                            <div style={{ position: "relative" }}>
                                                <input
                                                    type={showCurrentPassword ? "text" : "password"}
                                                    style={{ ...INPUT_STYLE, paddingRight: 40 }}
                                                    value={currentPassword}
                                                    onChange={(e) => { setCurrentPassword(e.target.value); if (pwdErrors.currentPassword) setPwdErrors((p) => ({ ...p, currentPassword: undefined })); }}
                                                    placeholder="กรอกรหัสผ่านปัจจุบัน"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowCurrentPassword((v) => !v)}
                                                    tabIndex={-1}
                                                    style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", border: "none", background: "transparent", color: "#9ca3af", cursor: "pointer", padding: 0, lineHeight: 1 }}
                                                >
                                                    <i className={`bi ${showCurrentPassword ? "bi-eye-slash" : "bi-eye"}`} />
                                                </button>
                                            </div>
                                            {pwdErrors.currentPassword && <div className="mt-1" style={{ fontSize: 12, color: "#ef4444" }}>{pwdErrors.currentPassword}</div>}
                                        </div>
                                        <div className="col-md-4">
                                            <label className="fw-medium mb-2 d-block" style={{ fontSize: 14, color: "#1a3d2b" }}>
                                                รหัสผ่านใหม่ <span style={{ color: "#ef4444" }}>*</span>
                                            </label>
                                            <div style={{ position: "relative" }}>
                                                <input
                                                    type={showNewPassword ? "text" : "password"}
                                                    style={{ ...INPUT_STYLE, paddingRight: 40 }}
                                                    value={newPassword}
                                                    onChange={(e) => { setNewPassword(e.target.value); if (pwdErrors.password) setPwdErrors((p) => ({ ...p, password: undefined })); }}
                                                    placeholder="≥ 6 ตัวอักษร"
                                                    minLength={6}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowNewPassword((v) => !v)}
                                                    tabIndex={-1}
                                                    style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", border: "none", background: "transparent", color: "#9ca3af", cursor: "pointer", padding: 0, lineHeight: 1 }}
                                                >
                                                    <i className={`bi ${showNewPassword ? "bi-eye-slash" : "bi-eye"}`} />
                                                </button>
                                            </div>
                                            <div className="mt-1" style={{ height: 4, width: "100%", overflow: "hidden", borderRadius: 999, background: "#f1f5f9" }}>
                                                <div style={{ height: "100%", width: pwdStrength.width, backgroundColor: pwdStrength.color, transition: "all 0.3s" }} />
                                            </div>
                                            {pwdErrors.password && <div className="mt-1" style={{ fontSize: 12, color: "#ef4444" }}>{pwdErrors.password}</div>}
                                        </div>
                                        <div className="col-md-4">
                                            <label className="fw-medium mb-2 d-block" style={{ fontSize: 14, color: "#1a3d2b" }}>
                                                ยืนยันรหัสผ่านใหม่ <span style={{ color: "#ef4444" }}>*</span>
                                            </label>
                                            <div style={{ position: "relative" }}>
                                                <input
                                                    type={showConfirmNewPassword ? "text" : "password"}
                                                    style={{ ...INPUT_STYLE, paddingRight: 40 }}
                                                    value={confirmNewPassword}
                                                    onChange={(e) => { setConfirmNewPassword(e.target.value); if (pwdErrors.confirmPassword) setPwdErrors((p) => ({ ...p, confirmPassword: undefined })); }}
                                                    placeholder="กรอกซ้ำ"
                                                    minLength={6}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowConfirmNewPassword((v) => !v)}
                                                    tabIndex={-1}
                                                    style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", border: "none", background: "transparent", color: "#9ca3af", cursor: "pointer", padding: 0, lineHeight: 1 }}
                                                >
                                                    <i className={`bi ${showConfirmNewPassword ? "bi-eye-slash" : "bi-eye"}`} />
                                                </button>
                                            </div>
                                            {pwdErrors.confirmPassword && <div className="mt-1" style={{ fontSize: 12, color: "#ef4444" }}>{pwdErrors.confirmPassword}</div>}
                                        </div>
                                    </div>

                                    <div className="d-flex justify-content-center pt-4" style={{ borderTop: "1px solid #f1f5f9" }}>
                                        <button
                                            type="submit"
                                            className="btn"
                                            disabled={pwdLoading}
                                            style={{
                                                background: pwdLoading ? "#e6f0ea" : "#1e7a47",
                                                color: pwdLoading ? "#94a3b8" : "white",
                                                border: "none",
                                                borderRadius: 10,
                                                padding: "10px 24px",
                                                fontWeight: 600,
                                                fontSize: "0.875rem",
                                                boxShadow: "none",
                                                transition: "all 0.15s ease",
                                                width: "50%",
                                            }}
                                        >
                                            {pwdLoading
                                                ? <><span className="spinner-border spinner-border-sm me-2" style={{ width: 14, height: 14 }} />กำลังบันทึก…</>
                                                : <><i className="bi bi-shield-lock me-2" />เปลี่ยนรหัสผ่าน</>}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
