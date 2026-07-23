"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { ModalShell } from "@/app/components/molecules";
import { Mail, Lock, Eye, EyeOff, User as UserIcon, Phone, CheckCircle2, AlertCircle } from "lucide-react";

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
  const isSuccess = alert.type === "success";
  return (
    <div className={`mb-6 flex items-start gap-3 rounded-xl p-4 text-sm font-medium ${isSuccess ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
      {isSuccess ? <CheckCircle2 className="mt-0.5 size-5 shrink-0" /> : <AlertCircle className="mt-0.5 size-5 shrink-0" />}
      <span>{alert.msg}</span>
    </div>
  );
}

export function LoginModal() {
  const { modal, closeModal, openRegister, refresh } = useAuth();
  const router = useRouter();
  const emailRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [alert, setAlert] = useState<AlertState>(null);

  useEffect(() => {
    if (modal === "login") {
      setEmail("");
      setPassword("");
      setShowPassword(false);
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
        setAlert({ type: "error", msg: data.error || "เข้าสู่ระบบไม่สำเร็จ" });
        setBusy(false);
      }
    } catch (err) {
      setAlert({ type: "error", msg: "เกิดข้อผิดพลาดในการเชื่อมต่อ" });
      setBusy(false);
    }
  };

  return (
    <ModalShell width={440} onClose={closeModal}>
      <div className="mb-8 flex flex-col items-center">
        <Image
          src="/assets/img/keptcarbon-logo.png"
          alt="KeptCarbon"
          width={48}
          height={48}
          className="mb-4 h-12 w-auto"
        />
        <h2 className="mb-2 text-2xl font-bold tracking-tight text-[var(--kc-ink)]">เข้าสู่ระบบ</h2>
        <p className="text-sm text-[var(--kc-muted)]">ยินดีต้อนรับ! กรุณากรอกข้อมูลเพื่อดำเนินการต่อ</p>
      </div>

      <AlertBox alert={alert} />

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-[var(--kc-ink)]">อีเมล / ชื่อผู้ใช้</label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-[var(--kc-sage)]" />
            <input
              ref={emailRef}
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="กรอกอีเมล หรือ ชื่อผู้ใช้"
              required
              autoComplete="username"
              className="w-full rounded-xl border border-[var(--kc-border-input)] bg-white py-2.5 pl-10 pr-4 text-sm text-[var(--kc-ink)] outline-none transition-colors placeholder:text-slate-400 focus:border-[var(--kc-green)] focus:ring-1 focus:ring-[var(--kc-green)]"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-[var(--kc-ink)]">รหัสผ่าน</label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-[var(--kc-sage)]" />
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="กรอกรหัสผ่าน"
              required
              autoComplete="current-password"
              className="w-full rounded-xl border border-[var(--kc-border-input)] bg-white py-2.5 pl-10 pr-10 text-sm text-[var(--kc-ink)] outline-none transition-colors placeholder:text-slate-400 focus:border-[var(--kc-green)] focus:ring-1 focus:ring-[var(--kc-green)]"
            />
            <button
              type="button"
              className="absolute right-3.5 top-1/2 flex -translate-y-1/2 items-center justify-center border-0 bg-transparent text-[var(--kc-sage)] transition-colors hover:text-[var(--kc-ink)] cursor-pointer"
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="size-4.5" /> : <Eye className="size-4.5" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={busy}
          className="mt-2 w-full rounded-xl border-0 bg-[var(--kc-green)] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--kc-green-dark)] disabled:opacity-70 cursor-pointer"
        >
          {busy ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
        </button>
      </form>

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-[var(--kc-border-input)]"></div>
        <span className="text-xs font-medium uppercase text-[var(--kc-sage)]">หรือ</span>
        <div className="h-px flex-1 bg-[var(--kc-border-input)]"></div>
      </div>

      <div className="flex flex-col gap-2.5">
        <a
          href="/api/auth/line"
          className="flex w-full items-center justify-center gap-3 rounded-xl border-0 bg-[#06C755] py-2.5 text-sm font-semibold text-white no-underline transition-colors hover:bg-[#05b34c]"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.271.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
          </svg>
          เข้าสู่ระบบด้วย LINE
        </a>

        <a
          href="/api/auth/google"
          className="flex w-full items-center justify-center gap-3 rounded-xl border border-[var(--kc-border-input)] bg-white py-2.5 text-sm font-semibold text-[var(--kc-ink)] no-underline transition-colors hover:bg-slate-50"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          เข้าสู่ระบบด้วย Google
        </a>

        <a
          href="/api/auth/facebook"
          className="flex w-full items-center justify-center gap-3 rounded-xl border-0 bg-[#1877F2] py-2.5 text-sm font-semibold text-white no-underline transition-colors hover:bg-[#166fe5]"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22 12c0-5.5-4.5-10-10-10S2 6.5 2 12c0 5 3.7 9.2 8.5 9.9v-7h-2.5v-2.9h2.5V9.5c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2 .1 2.2.1v2.5h-1.5c-1.2 0-1.5.6-1.5 1.5v2h3l-.4 2.9h-2.5V22c4.8-.7 8.5-4.9 8.5-9.9z" />
          </svg>
          เข้าสู่ระบบด้วย Facebook
        </a>
      </div>

      <div className="mt-8 text-center text-sm font-medium text-[var(--kc-muted)]">
        ยังไม่มีบัญชี?{" "}
        <a
          onClick={(e) => {
            e.preventDefault();
            openRegister();
          }}
          href="#"
          className="text-[var(--kc-green)] no-underline hover:underline"
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
  const [showPassword, setShowPassword] = useState(false);
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [alert, setAlert] = useState<AlertState>(null);

  useEffect(() => {
    if (modal === "register") {
      setFullname("");
      setEmail("");
      setPhone("");
      setPassword("");
      setShowPassword(false);
      setConfirmPwd("");
      setShowConfirmPwd(false);
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
      setAlert({ type: "error", msg: "รหัสผ่านไม่ตรงกัน กรุณาตรวจสอบอีกครั้ง" });
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
        setAlert({ type: "error", msg: data.error || "สมัครสมาชิกไม่สำเร็จ" });
        setBusy(false);
      }
    } catch (err) {
      setAlert({ type: "error", msg: "เกิดข้อผิดพลาดในการเชื่อมต่อ" });
      setBusy(false);
    }
  };

  return (
    <ModalShell width={500} onClose={closeModal}>
      <div className="mb-8 flex flex-col items-center">
        <Image
          src="/assets/img/keptcarbon-logo.png"
          alt="KeptCarbon"
          width={48}
          height={48}
          className="mb-4 h-12 w-auto"
        />
        <h2 className="mb-2 text-2xl font-bold tracking-tight text-[var(--kc-ink)]">สมัครสมาชิก</h2>
        <p className="text-sm text-[var(--kc-muted)]">สร้างบัญชีเพื่อเริ่มจัดการสวนยางพาราของคุณ</p>
      </div>

      <AlertBox alert={alert} />

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-[var(--kc-ink)]">ชื่อ-นามสกุล</label>
          <div className="relative">
            <UserIcon className="absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-[var(--kc-sage)]" />
            <input
              ref={fullnameRef}
              type="text"
              value={fullname}
              onChange={(e) => setFullname(e.target.value)}
              placeholder="กรอกชื่อ-นามสกุล"
              required
              autoComplete="name"
              className="w-full rounded-xl border border-[var(--kc-border-input)] bg-white py-2.5 pl-10 pr-4 text-sm text-[var(--kc-ink)] outline-none transition-colors placeholder:text-slate-400 focus:border-[var(--kc-green)] focus:ring-1 focus:ring-[var(--kc-green)]"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[var(--kc-ink)]">อีเมล</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-[var(--kc-sage)]" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                required
                autoComplete="email"
                className="w-full rounded-xl border border-[var(--kc-border-input)] bg-white py-2.5 pl-10 pr-4 text-sm text-[var(--kc-ink)] outline-none transition-colors placeholder:text-slate-400 focus:border-[var(--kc-green)] focus:ring-1 focus:ring-[var(--kc-green)]"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[var(--kc-ink)]">เบอร์โทร (ไม่บังคับ)</label>
            <div className="relative">
              <Phone className="absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-[var(--kc-sage)]" />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="08X-XXX-XXXX"
                className="w-full rounded-xl border border-[var(--kc-border-input)] bg-white py-2.5 pl-10 pr-4 text-sm text-[var(--kc-ink)] outline-none transition-colors placeholder:text-slate-400 focus:border-[var(--kc-green)] focus:ring-1 focus:ring-[var(--kc-green)]"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[var(--kc-ink)]">รหัสผ่าน</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-[var(--kc-sage)]" />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="≥ 6 ตัวอักษร"
                required
                minLength={6}
                className="w-full rounded-xl border border-[var(--kc-border-input)] bg-white py-2.5 pl-10 pr-10 text-sm text-[var(--kc-ink)] outline-none transition-colors placeholder:text-slate-400 focus:border-[var(--kc-green)] focus:ring-1 focus:ring-[var(--kc-green)]"
              />
              <button
                type="button"
                className="absolute right-3.5 top-1/2 flex -translate-y-1/2 items-center justify-center border-0 bg-transparent text-[var(--kc-sage)] transition-colors hover:text-[var(--kc-ink)] cursor-pointer"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="size-4.5" /> : <Eye className="size-4.5" />}
              </button>
            </div>
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full transition-all duration-300"
                style={{ width: strength.width, backgroundColor: strength.color }}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[var(--kc-ink)]">ยืนยันรหัสผ่าน</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-[var(--kc-sage)]" />
              <input
                type={showConfirmPwd ? "text" : "password"}
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                placeholder="กรอกซ้ำ"
                required
                minLength={6}
                className="w-full rounded-xl border border-[var(--kc-border-input)] bg-white py-2.5 pl-10 pr-10 text-sm text-[var(--kc-ink)] outline-none transition-colors placeholder:text-slate-400 focus:border-[var(--kc-green)] focus:ring-1 focus:ring-[var(--kc-green)]"
              />
              <button
                type="button"
                className="absolute right-3.5 top-1/2 flex -translate-y-1/2 items-center justify-center border-0 bg-transparent text-[var(--kc-sage)] transition-colors hover:text-[var(--kc-ink)] cursor-pointer"
                onClick={() => setShowConfirmPwd(!showConfirmPwd)}
                tabIndex={-1}
              >
                {showConfirmPwd ? <EyeOff className="size-4.5" /> : <Eye className="size-4.5" />}
              </button>
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={busy}
          className="mt-2 w-full rounded-xl border-0 bg-[var(--kc-green)] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--kc-green-dark)] disabled:opacity-70 cursor-pointer"
        >
          {busy ? "กำลังสมัครสมาชิก..." : "สมัครสมาชิก"}
        </button>

        <p className="mt-1 text-center text-xs text-[var(--kc-muted)]">
          เมื่อสมัครสมาชิก คุณยอมรับ{" "}
          <a href="#" className="font-medium text-[var(--kc-green)] no-underline hover:underline">
            เงื่อนไขการใช้งาน
          </a>{" "}
          ของเรา
        </p>
      </form>

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-[var(--kc-border-input)]"></div>
        <span className="text-xs font-medium uppercase text-[var(--kc-sage)]">หรือ</span>
        <div className="h-px flex-1 bg-[var(--kc-border-input)]"></div>
      </div>

      <div className="flex flex-col gap-2.5">
        <a
          href="/api/auth/line"
          className="flex w-full items-center justify-center gap-3 rounded-xl border-0 bg-[#06C755] py-2.5 text-sm font-semibold text-white no-underline transition-colors hover:bg-[#05b34c]"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.271.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
          </svg>
          สมัครสมาชิกด้วย LINE
        </a>

        <a
          href="/api/auth/google"
          className="flex w-full items-center justify-center gap-3 rounded-xl border border-[var(--kc-border-input)] bg-white py-2.5 text-sm font-semibold text-[var(--kc-ink)] no-underline transition-colors hover:bg-slate-50"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          สมัครสมาชิกด้วย Google
        </a>

        <a
          href="/api/auth/facebook"
          className="flex w-full items-center justify-center gap-3 rounded-xl border-0 bg-[#1877F2] py-2.5 text-sm font-semibold text-white no-underline transition-colors hover:bg-[#166fe5]"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22 12c0-5.5-4.5-10-10-10S2 6.5 2 12c0 5 3.7 9.2 8.5 9.9v-7h-2.5v-2.9h2.5V9.5c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2 .1 2.2.1v2.5h-1.5c-1.2 0-1.5.6-1.5 1.5v2h3l-.4 2.9h-2.5V22c4.8-.7 8.5-4.9 8.5-9.9z" />
          </svg>
          สมัครสมาชิกด้วย Facebook
        </a>
      </div>

      <div className="mt-8 text-center text-sm font-medium text-[var(--kc-muted)]">
        มีบัญชีอยู่แล้ว?{" "}
        <a
          onClick={(e) => {
            e.preventDefault();
            openLogin();
          }}
          href="#"
          className="text-[var(--kc-green)] no-underline hover:underline"
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
