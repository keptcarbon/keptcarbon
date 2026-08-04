"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { consumePostAuthRedirect } from "@/lib/post-auth-redirect";
import { formatThaiPhone, strengthFor } from "@/lib/utils";
import { ModalShell } from "@/app/components/molecules";
import { Mail, Lock, Eye, EyeOff, User as UserIcon, Phone, CheckCircle2, AlertCircle } from "lucide-react";

type AlertState = { type: "success" | "error"; msg: string } | null;

// Name rule (First & Last): 1–50 chars; letters (incl. Thai/Unicode), spaces, hyphens, apostrophes.
const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M}\s'-]{0,49}$/u;

// Returns an error message for an invalid name, or null when valid. `label` is the field name (ชื่อ / นามสกุล).
function nameError(raw: string, label: string): string | null {
  const v = raw.trim();
  if (!v) return `กรุณากรอก${label}`;
  if (v.length > 50) return `${label}ต้องมีความยาวไม่เกิน 50 ตัวอักษร`;
  if (!NAME_RE.test(v)) return `${label}ใช้ได้เฉพาะตัวอักษร เว้นวรรค ขีดกลาง (-) และเครื่องหมาย '`;
  return null;
}

function AlertBox({ alert }: { alert: AlertState }) {
  if (!alert) return null;
  const isSuccess = alert.type === "success";
  return (
    <div className={`mb-6 flex items-start gap-3 rounded-xl p-4 text-base font-medium ${isSuccess ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
      {isSuccess ? <CheckCircle2 className="mt-0.5 size-5 shrink-0" /> : <AlertCircle className="mt-0.5 size-5 shrink-0" />}
      <span>{alert.msg}</span>
    </div>
  );
}

// Border/focus classes for an input, switching to red when the field has an error.
function errBorder(hasError: boolean): string {
  return hasError
    ? "border-red-400 focus:border-red-400 focus:ring-1 focus:ring-red-400"
    : "border-[var(--kc-border-input)] focus:border-[var(--kc-green)] focus:ring-1 focus:ring-[var(--kc-green)]";
}

// Red asterisk marking a required field.
function RequiredStar() {
  return <span className="text-red-500"> *</span>;
}

// Inline, per-field validation message rendered directly below its input.
function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <p className="flex items-center gap-1 text-sm font-medium text-red-500">
      <AlertCircle className="size-3.5 shrink-0" />
      <span>{msg}</span>
    </p>
  );
}

export function LoginModal() {
  const { modal, closeModal, openRegister, refresh } = useAuth();
  const router = useRouter();
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [alert, setAlert] = useState<AlertState>(null);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  useEffect(() => {
    if (modal === "login") {
      setEmail("");
      setPassword("");
      setShowPassword(false);
      setAlert(null);
      setErrors({});
      setBusy(false);
      setTimeout(() => emailRef.current?.focus(), 50);
    }
  }, [modal]);

  if (modal !== "login") return null;

  // Client-side validation — mirrors the backend presence check so an empty
  // submit never leaves the browser (even if `required` is stripped via DevTools).
  const validate = (): boolean => {
    const next: { email?: string; password?: string } = {};
    if (!email.trim()) next.email = "กรุณากรอกอีเมลหรือชื่อผู้ใช้";
    if (!password) next.password = "กรุณากรอกรหัสผ่าน";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAlert(null);
    if (!validate()) return;
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
          // Return to where the guest started (e.g. map-draw guest-limit flow),
          // falling back to the home page.
          router.push(consumePostAuthRedirect() ?? "/");
        }, 800);
      } else {
        setAlert({ type: "error", msg: data.error || "เข้าสู่ระบบไม่สำเร็จ" });
        setBusy(false);
        // UX on failed login: keep the email as-is, clear only the password,
        // and move focus back to the password field for an immediate retry.
        setPassword("");
        setTimeout(() => passwordRef.current?.focus(), 0);
      }
    } catch (err) {
      setAlert({ type: "error", msg: "เกิดข้อผิดพลาดในการเชื่อมต่อ" });
      setBusy(false);
    }
  };

  return (
    <ModalShell width={460} padding="p-6 sm:p-[26px]" onClose={closeModal}>
      <div className="mb-4 flex flex-col items-center">
        <Image
          src="/assets/img/keptcarbon-logo.png"
          alt="KeptCarbon"
          width={48}
          height={48}
          className="mb-4 h-12 w-auto"
        />
        <h2 className="mb-0 text-2xl font-bold tracking-tight text-[var(--kc-ink)]">เข้าสู่ระบบ</h2>
      </div>

      <AlertBox alert={alert} />

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-base font-medium text-[var(--kc-ink)]">อีเมล / ชื่อผู้ใช้<RequiredStar /></label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-[var(--kc-sage)]" />
            <input
              ref={emailRef}
              type="text"
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (errors.email) setErrors((p) => ({ ...p, email: undefined })); }}
              placeholder="กรอกอีเมล หรือ ชื่อผู้ใช้"
              required
              autoComplete="username"
              aria-invalid={!!errors.email}
              className={`w-full rounded-xl border bg-white py-2.5 pl-10 pr-4 text-base text-[var(--kc-ink)] outline-none transition-colors placeholder:text-slate-400 ${errBorder(!!errors.email)}`}
            />
          </div>
          <FieldError msg={errors.email} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-base font-medium text-[var(--kc-ink)]">รหัสผ่าน<RequiredStar /></label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-[var(--kc-sage)]" />
            <input
              ref={passwordRef}
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => { setPassword(e.target.value); if (errors.password) setErrors((p) => ({ ...p, password: undefined })); }}
              placeholder="กรอกรหัสผ่าน"
              required
              autoComplete="current-password"
              aria-invalid={!!errors.password}
              className={`w-full rounded-xl border bg-white py-2.5 pl-10 pr-10 text-base text-[var(--kc-ink)] outline-none transition-colors placeholder:text-slate-400 ${errBorder(!!errors.password)}`}
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
          <FieldError msg={errors.password} />
          {process.env.NEXT_PUBLIC_ENABLE_PASSWORD_RESET === "true" && (
            <div className="flex justify-end">
              <a
                href="/forgot-password"
                onClick={(e) => {
                  e.preventDefault();
                  closeModal();
                  router.push("/forgot-password");
                }}
                className="text-sm font-medium text-[var(--kc-green)] pt-3 underline hover:underline"
                tabIndex={-1}
              >
                ลืมรหัสผ่าน?
              </a>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={busy}
          className="mt-2 w-full rounded-xl border-0 bg-[var(--kc-green)] py-2.5 text-base font-semibold text-white transition-colors hover:bg-[var(--kc-green-dark)] disabled:opacity-70 cursor-pointer"
        >
          {busy ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
        </button>
      </form>

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-[var(--kc-border-input)]"></div>
        <span className="text-sm font-medium uppercase text-[var(--kc-sage)]">หรือ</span>
        <div className="h-px flex-1 bg-[var(--kc-border-input)]"></div>
      </div>

      <div className="flex flex-col gap-2.5">
        <a
          href="/api/auth/line"
          className="flex w-full items-center justify-center gap-3 rounded-xl border-0 bg-[#06C755] py-2.5 text-base font-semibold text-white no-underline transition-colors hover:bg-[#05b34c]"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.271.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
          </svg>
          เข้าสู่ระบบด้วย LINE
        </a>

        <a
          href="/api/auth/google"
          className="flex w-full items-center justify-center gap-3 rounded-xl border border-[var(--kc-border-input)] bg-white py-2.5 text-base font-semibold text-[var(--kc-ink)] no-underline transition-colors hover:bg-slate-50"
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
          className="flex w-full items-center justify-center gap-3 rounded-xl border-0 bg-[#1877F2] py-2.5 text-base font-semibold text-white no-underline transition-colors hover:bg-[#166fe5]"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22 12c0-5.5-4.5-10-10-10S2 6.5 2 12c0 5 3.7 9.2 8.5 9.9v-7h-2.5v-2.9h2.5V9.5c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2 .1 2.2.1v2.5h-1.5c-1.2 0-1.5.6-1.5 1.5v2h3l-.4 2.9h-2.5V22c4.8-.7 8.5-4.9 8.5-9.9z" />
          </svg>
          เข้าสู่ระบบด้วย Facebook
        </a>
      </div>

      <div className="mt-4 text-center text-base font-medium text-[var(--kc-muted)]">
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
  const firstNameRef = useRef<HTMLInputElement>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [alert, setAlert] = useState<AlertState>(null);
  const [errors, setErrors] = useState<{ firstName?: string; lastName?: string; email?: string; password?: string; confirmPwd?: string }>({});

  useEffect(() => {
    if (modal === "register") {
      setFirstName("");
      setLastName("");
      setEmail("");
      setPhone("");
      setPassword("");
      setShowPassword(false);
      setConfirmPwd("");
      setShowConfirmPwd(false);
      setAlert(null);
      setErrors({});
      setBusy(false);
      setTimeout(() => firstNameRef.current?.focus(), 50);
    }
  }, [modal]);

  if (modal !== "register") return null;

  const strength = strengthFor(password.length);

  // Client-side validation — mirrors the backend rules (firstName, email,
  // password required; password ≥ 6; confirm must match) so an invalid submit
  // never leaves the browser, even if `required` is stripped via DevTools.
  const validate = (): boolean => {
    const next: { firstName?: string; lastName?: string; email?: string; password?: string; confirmPwd?: string } = {};
    const fnErr = nameError(firstName, "ชื่อ");
    if (fnErr) next.firstName = fnErr;
    // Last name is optional — only validate the format when something was entered.
    const lnErr = lastName.trim() ? nameError(lastName, "นามสกุล") : null;
    if (lnErr) next.lastName = lnErr;
    if (!email.trim()) next.email = "กรุณากรอกอีเมล";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = "รูปแบบอีเมลไม่ถูกต้อง";
    if (!password) next.password = "กรุณากรอกรหัสผ่าน";
    else if (password.length < 6) next.password = "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร";
    if (!confirmPwd) next.confirmPwd = "กรุณายืนยันรหัสผ่าน";
    else if (password !== confirmPwd) next.confirmPwd = "รหัสผ่านไม่ตรงกัน กรุณาตรวจสอบอีกครั้ง";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAlert(null);
    if (!validate()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, firstName: firstName.trim(), lastName: lastName.trim(), phone }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        await refresh();
        setAlert({ type: "success", msg: "✓ สมัครสมาชิกสำเร็จ! กำลังนำไปยังหน้าหลัก..." });
        setTimeout(() => {
          closeModal();
          // Return to where the guest started (e.g. map-draw guest-limit flow),
          // falling back to the home page.
          router.push(consumePostAuthRedirect() ?? "/");
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
    <ModalShell width={520} padding="p-6 sm:p-[26px]" onClose={closeModal}>
      <div className="mb-4 flex flex-col items-center">
        <Image
          src="/assets/img/keptcarbon-logo.png"
          alt="KeptCarbon"
          width={48}
          height={48}
          className="mb-4 h-12 w-auto"
        />
        <h2 className="mb-0 text-2xl font-bold tracking-tight text-[var(--kc-ink)]">สมัครสมาชิก</h2>
      </div>

      <AlertBox alert={alert} />

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-base font-medium text-[var(--kc-ink)]">ชื่อ<RequiredStar /></label>
            <div className="relative">
              <UserIcon className="absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-[var(--kc-sage)]" />
              <input
                ref={firstNameRef}
                type="text"
                value={firstName}
                onChange={(e) => { setFirstName(e.target.value); if (errors.firstName) setErrors((p) => ({ ...p, firstName: undefined })); }}
                placeholder="กรอกชื่อ"
                required
                maxLength={50}
                autoComplete="given-name"
                aria-invalid={!!errors.firstName}
                className={`w-full rounded-xl border bg-white py-2.5 pl-10 pr-4 text-base text-[var(--kc-ink)] outline-none transition-colors placeholder:text-slate-400 ${errBorder(!!errors.firstName)}`}
              />
            </div>
            <FieldError msg={errors.firstName} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-base font-medium text-[var(--kc-ink)]">นามสกุล</label>
            <div className="relative">
              <UserIcon className="absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-[var(--kc-sage)]" />
              <input
                type="text"
                value={lastName}
                onChange={(e) => { setLastName(e.target.value); if (errors.lastName) setErrors((p) => ({ ...p, lastName: undefined })); }}
                placeholder="กรอกนามสกุล"
                maxLength={50}
                autoComplete="family-name"
                aria-invalid={!!errors.lastName}
                className={`w-full rounded-xl border bg-white py-2.5 pl-10 pr-4 text-base text-[var(--kc-ink)] outline-none transition-colors placeholder:text-slate-400 ${errBorder(!!errors.lastName)}`}
              />
            </div>
            <FieldError msg={errors.lastName} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-base font-medium text-[var(--kc-ink)]">อีเมล<RequiredStar /></label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-[var(--kc-sage)]" />
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (errors.email) setErrors((p) => ({ ...p, email: undefined })); }}
                placeholder="email@example.com"
                required
                autoComplete="email"
                aria-invalid={!!errors.email}
                className={`w-full rounded-xl border bg-white py-2.5 pl-10 pr-4 text-base text-[var(--kc-ink)] outline-none transition-colors placeholder:text-slate-400 ${errBorder(!!errors.email)}`}
              />
            </div>
            <FieldError msg={errors.email} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-base font-medium text-[var(--kc-ink)]">เบอร์โทร</label>
            <div className="relative">
              <Phone className="absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-[var(--kc-sage)]" />
              <input
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={(e) => setPhone(formatThaiPhone(e.target.value))}
                placeholder="090-xxxx-xxxx"
                maxLength={12}
                className="w-full rounded-xl border border-[var(--kc-border-input)] bg-white py-2.5 pl-10 pr-4 text-base text-[var(--kc-ink)] outline-none transition-colors placeholder:text-slate-400 focus:border-[var(--kc-green)] focus:ring-1 focus:ring-[var(--kc-green)]"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-base font-medium text-[var(--kc-ink)]">รหัสผ่าน<RequiredStar /></label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-[var(--kc-sage)]" />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => { setPassword(e.target.value); if (errors.password) setErrors((p) => ({ ...p, password: undefined })); }}
                placeholder="≥ 6 ตัวอักษร"
                required
                minLength={6}
                aria-invalid={!!errors.password}
                className={`w-full rounded-xl border bg-white py-2.5 pl-10 pr-10 text-base text-[var(--kc-ink)] outline-none transition-colors placeholder:text-slate-400 ${errBorder(!!errors.password)}`}
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
            <FieldError msg={errors.password} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-base font-medium text-[var(--kc-ink)]">ยืนยันรหัสผ่าน<RequiredStar /></label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-[var(--kc-sage)]" />
              <input
                type={showConfirmPwd ? "text" : "password"}
                value={confirmPwd}
                onChange={(e) => { setConfirmPwd(e.target.value); if (errors.confirmPwd) setErrors((p) => ({ ...p, confirmPwd: undefined })); }}
                placeholder="กรอกซ้ำ"
                required
                minLength={6}
                aria-invalid={!!errors.confirmPwd}
                className={`w-full rounded-xl border bg-white py-2.5 pl-10 pr-10 text-base text-[var(--kc-ink)] outline-none transition-colors placeholder:text-slate-400 ${errBorder(!!errors.confirmPwd)}`}
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
            <FieldError msg={errors.confirmPwd} />
          </div>
        </div>

        <button
          type="submit"
          disabled={busy}
          className="mt-2 w-full rounded-xl border-0 bg-[var(--kc-green)] py-2.5 text-base font-semibold text-white transition-colors hover:bg-[var(--kc-green-dark)] disabled:opacity-70 cursor-pointer"
        >
          {busy ? "กำลังสมัครสมาชิก..." : "สมัครสมาชิก"}
        </button>

        <p className="mt-1 mb-2 text-center text-sm text-[var(--kc-muted)]">
          เมื่อสมัครสมาชิก คุณยอมรับ{" "}
          <a href="#" className="font-medium text-[var(--kc-green)] no-underline hover:underline">
            เงื่อนไขการใช้งาน
          </a>{" "}
          ของเรา
        </p>
      </form>

      <div className="mt-1.5 mb-3 flex items-center gap-3">
        <div className="h-px flex-1 bg-[var(--kc-border-input)]"></div>
        <span className="text-sm font-medium uppercase text-[var(--kc-sage)]">หรือ</span>
        <div className="h-px flex-1 bg-[var(--kc-border-input)]"></div>
      </div>

      <div className="flex flex-col gap-2.5">
        <a
          href="/api/auth/line"
          className="flex w-full items-center justify-center gap-3 rounded-xl border-0 bg-[#06C755] py-2.5 text-base font-semibold text-white no-underline transition-colors hover:bg-[#05b34c]"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.271.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
          </svg>
          สมัครสมาชิกด้วย LINE
        </a>

        <a
          href="/api/auth/google"
          className="flex w-full items-center justify-center gap-3 rounded-xl border border-[var(--kc-border-input)] bg-white py-2.5 text-base font-semibold text-[var(--kc-ink)] no-underline transition-colors hover:bg-slate-50"
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
          className="flex w-full items-center justify-center gap-3 rounded-xl border-0 bg-[#1877F2] py-2.5 text-base font-semibold text-white no-underline transition-colors hover:bg-[#166fe5]"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22 12c0-5.5-4.5-10-10-10S2 6.5 2 12c0 5 3.7 9.2 8.5 9.9v-7h-2.5v-2.9h2.5V9.5c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2 .1 2.2.1v2.5h-1.5c-1.2 0-1.5.6-1.5 1.5v2h3l-.4 2.9h-2.5V22c4.8-.7 8.5-4.9 8.5-9.9z" />
          </svg>
          สมัครสมาชิกด้วย Facebook
        </a>
      </div>

      <div className="mt-3 mb-0 text-center text-base font-medium text-[var(--kc-muted)]">
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
