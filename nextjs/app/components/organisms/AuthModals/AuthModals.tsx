"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Auth } from "@/lib/auth";
import { useAuth } from "@/lib/auth-context";
import { ModalShell } from "@/app/components/molecules";

function strengthFor(len: number): { width: string; color: string } {
  if (len === 0) return { width: "0%", color: "transparent" };
  if (len < 4) return { width: "25%", color: "var(--kc-danger)" };
  if (len < 6) return { width: "50%", color: "var(--kc-warning)" };
  if (len < 10) return { width: "75%", color: "var(--kc-warning)" };
  return { width: "100%", color: "var(--kc-success)" };
}

type AlertState = { type: "success" | "error"; msg: string } | null;

function AlertBox({ alert }: { alert: AlertState }) {
  if (!alert) return null;
  return (
    <div className={`modal-auth-alert ${alert.type} show`}>
      <i className={`bi bi-${alert.type === "success" ? "check-circle" : "exclamation-circle"}`} />{" "}
      {alert.msg}
    </div>
  );
}

export function LoginModal() {
  const { modal, closeModal, openRegister, refresh } = useAuth();
  const router = useRouter();
  const emailRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [alert, setAlert] = useState<AlertState>(null);

  useEffect(() => {
    if (modal === "login") {
      setEmail("");
      setPassword("");
      setAlert(null);
      setBusy(false);
      setTimeout(() => emailRef.current?.focus(), 50);
    }
  }, [modal]);

  if (modal !== "login") return null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: email.trim(), password }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setAlert({ type: "success", msg: "✓ เข้าสู่ระบบสำเร็จ! กำลังนำไปยังหน้าหลัก..." });
        await refresh();
        setTimeout(() => {
          closeModal();
          router.push("/");
        }, 800);
      } else {
        setAlert({ type: "error", msg: "✗ " + (data.error || "เข้าสู่ระบบไม่สำเร็จ") });
        setBusy(false);
      }
    } catch (err) {
      setAlert({ type: "error", msg: "✗ เกิดข้อผิดพลาดในการเชื่อมต่อ" });
      setBusy(false);
    }
  };

  return (
    <ModalShell width={440} onClose={closeModal}>
      <div className="modal-auth-logo">
        <img
          src="/assets/img/keptcarbon-logo.png"
          alt="Kept Carbon Logo"
          style={{ maxWidth: 180, height: "auto" }}
        />
      </div>
      <div className="modal-auth-heading text-center">เข้าสู่ระบบ</div>
      <div className="modal-auth-sub text-center">
        ยินดีต้อนรับกลับ! กรุณากรอกข้อมูลเพื่อดำเนินการต่อ
      </div>

      <AlertBox alert={alert} />

      <form onSubmit={onSubmit} autoComplete="on">
        <div className="modal-auth-form-group">
          <label>อีเมล / ชื่อผู้ใช้</label>
          <div className="modal-inp-wrap">
            <i className="bi bi-person" />
            <input
              ref={emailRef}
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="กรอกอีเมล หรือ ชื่อผู้ใช้"
              required
              autoComplete="username"
            />
          </div>
        </div>
        <div className="modal-auth-form-group">
          <label>รหัสผ่าน</label>
          <div className="modal-inp-wrap">
            <i className="bi bi-lock" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="กรอกรหัสผ่าน"
              required
              autoComplete="current-password"
            />
          </div>
        </div>
        <button type="submit" className="modal-btn-submit" disabled={busy}>
          {busy ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
        </button>
      </form>

      <div className="modal-divider">หรือ</div>

      <a href="/api/auth/line" className="modal-btn-line">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.271.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
        </svg>
        เข้าสู่ระบบด้วย LINE
      </a>

      <div className="modal-auth-links" style={{ marginTop: 16 }}>
        ยังไม่มีบัญชี?{" "}
        <a
          onClick={(e) => {
            e.preventDefault();
            openRegister();
          }}
          href="#"
        >
          สมัครสมาชิกใหม่
        </a>
      </div>
    </ModalShell>
  );
}

export function RegisterModal() {
  const { modal, closeModal, openLogin, refresh } = useAuth();
  const router = useRouter();
  const fullnameRef = useRef<HTMLInputElement>(null);
  const [fullname, setFullname] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [busy, setBusy] = useState(false);
  const [alert, setAlert] = useState<AlertState>(null);

  useEffect(() => {
    if (modal === "register") {
      setFullname("");
      setEmail("");
      setPhone("");
      setPassword("");
      setConfirmPwd("");
      setAlert(null);
      setBusy(false);
      setTimeout(() => fullnameRef.current?.focus(), 50);
    }
  }, [modal]);

  if (modal !== "register") return null;

  const strength = strengthFor(password.length);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPwd) {
      setAlert({ type: "error", msg: "✗ รหัสผ่านไม่ตรงกัน กรุณาตรวจสอบอีกครั้ง" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, fullname, phone }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        await refresh();
        setAlert({ type: "success", msg: "✓ สมัครสมาชิกสำเร็จ! กำลังนำไปยังหน้าหลัก..." });
        setTimeout(() => {
          closeModal();
          router.push("/");
        }, 900);
      } else {
        setAlert({ type: "error", msg: "✗ " + (data.error || "สมัครสมาชิกไม่สำเร็จ") });
        setBusy(false);
      }
    } catch (err) {
      setAlert({ type: "error", msg: "✗ เกิดข้อผิดพลาดในการเชื่อมต่อ" });
      setBusy(false);
    }
  };

  return (
    <ModalShell width={500} onClose={closeModal}>
      <div className="modal-auth-logo">
        <img
          src="/assets/img/keptcarbon-logo.png"
          alt="Kept Carbon Logo"
          style={{ maxWidth: 180, height: "auto", marginBottom: 12 }}
        />
      </div>
      <div className="modal-auth-heading text-center">สมัครสมาชิก</div>
      <div className="modal-auth-sub text-center">
        สร้างบัญชีเพื่อเริ่มจัดการสวนยางพาราของคุณ
      </div>

      <AlertBox alert={alert} />

      <form onSubmit={onSubmit} autoComplete="on">
        <div className="modal-auth-form-group">
          <label>ชื่อ-นามสกุล</label>
          <div className="modal-inp-wrap">
            <i className="bi bi-person" />
            <input
              ref={fullnameRef}
              type="text"
              value={fullname}
              onChange={(e) => setFullname(e.target.value)}
              placeholder="กรอกชื่อ-นามสกุล"
              required
              autoComplete="name"
            />
          </div>
        </div>

        <div className="row g-2">
          <div className="col-6 modal-auth-form-group">
            <label>อีเมล</label>
            <div className="modal-inp-wrap">
              <i className="bi bi-envelope" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                required
                autoComplete="email"
              />
            </div>
          </div>
          <div className="col-6 modal-auth-form-group">
            <label>เบอร์โทร (ไม่บังคับ)</label>
            <div className="modal-inp-wrap">
              <i className="bi bi-telephone" />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="08X-XXX-XXXX"
              />
            </div>
          </div>
        </div>

        <div className="row g-2">
          <div className="col-6 modal-auth-form-group">
            <label>รหัสผ่าน</label>
            <div className="modal-inp-wrap">
              <i className="bi bi-lock" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="≥ 6 ตัวอักษร"
                required
                minLength={6}
              />
            </div>
            <div className="modal-pwd-strength">
              <div
                className="modal-pwd-bar"
                style={{ width: strength.width, background: strength.color }}
              />
            </div>
          </div>
          <div className="col-6 modal-auth-form-group">
            <label>ยืนยันรหัสผ่าน</label>
            <div className="modal-inp-wrap">
              <i className="bi bi-lock-fill" />
              <input
                type="password"
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                placeholder="กรอกซ้ำ"
                required
                minLength={6}
              />
            </div>
          </div>
        </div>

        <button type="submit" className="modal-btn-submit" disabled={busy}>
          {busy ? "กำลังสมัครสมาชิก..." : "สมัครสมาชิก"}
        </button>

        <div style={{ fontSize: "var(--kc-font-size-xs)", color: "var(--kc-muted)", textAlign: "center", marginTop: 12 }}>
          เมื่อสมัครสมาชิก คุณยอมรับ{" "}
          <a href="#" style={{ color: "var(--kc-green)" }}>
            เงื่อนไขการใช้งาน
          </a>{" "}
          ของเรา
        </div>
      </form>

      <div className="modal-divider">หรือ</div>

      <a href="/api/auth/line" className="modal-btn-line">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.271.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
        </svg>
        สมัครสมาชิกด้วย LINE
      </a>

      <div className="modal-auth-links" style={{ marginTop: 16 }}>
        มีบัญชีอยู่แล้ว?{" "}
        <a
          onClick={(e) => {
            e.preventDefault();
            openLogin();
          }}
          href="#"
        >
          เข้าสู่ระบบ
        </a>
      </div>
    </ModalShell>
  );
}

export default function AuthModals() {
  return (
    <>
      <LoginModal />
      <RegisterModal />
    </>
  );
}
