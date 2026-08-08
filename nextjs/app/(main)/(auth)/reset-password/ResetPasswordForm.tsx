"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, CheckCircle2, AlertCircle, ArrowLeft, Lock } from "lucide-react";
import { strengthFor } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import {
  AuthTitle,
  AlertBanner,
  FieldLabel,
  IconField,
  PrimaryButton,
  PrimaryLinkButton,
  StatusPanel,
  LoadingPanel,
  FieldError,
} from "../ui";

const MIN_PASSWORD_LEN = 6;

type TokenState = "checking" | "valid" | "invalid";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const { openLogin } = useAuth();
  const passwordRef = useRef<HTMLInputElement>(null);
  const [tokenState, setTokenState] = useState<TokenState>("checking");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ password?: string; confirm?: string }>({});
  const [done, setDone] = useState(false);

  // Validate the token up-front so we can show a clear expired/invalid state
  // instead of letting the user type a password into a dead link.
  useEffect(() => {
    if (!token) {
      setTokenState("invalid");
      return;
    }
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`);
        const data = await res.json().catch(() => ({}));
        if (active) setTokenState(res.ok && data?.valid ? "valid" : "invalid");
      } catch {
        if (active) setTokenState("invalid");
      }
    })();
    return () => {
      active = false;
    };
  }, [token]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    if (password.length < MIN_PASSWORD_LEN) {
      setFieldErrors({ password: `รหัสผ่านต้องมีอย่างน้อย ${MIN_PASSWORD_LEN} ตัวอักษร` });
      passwordRef.current?.focus();
      return;
    }
    if (password !== confirm) {
      setFieldErrors({ confirm: "รหัสผ่านไม่ตรงกัน กรุณาตรวจสอบอีกครั้ง" });
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        setDone(true);
        setTimeout(() => {
          openLogin();
          router.push("/");
        }, 2500);
      } else {
        setError(data?.error || "เกิดข้อผิดพลาด กรุณาลองใหม่");
        if (res.status === 400) setTokenState("invalid");
        setBusy(false);
      }
    } catch {
      setError("เกิดข้อผิดพลาดในการเชื่อมต่อ");
      setBusy(false);
    }
  };

  if (tokenState === "checking") {
    return <LoadingPanel label="กำลังตรวจสอบลิงก์..." />;
  }

  if (tokenState === "invalid") {
    return (
      <StatusPanel
        icon={AlertCircle}
        tone="error"
        title="ลิงก์หมดอายุหรือไม่ถูกต้อง"
        description="ลิงก์รีเซ็ตรหัสผ่านนี้ใช้ไปแล้วหรือหมดอายุ กรุณาขอลิงก์ใหม่อีกครั้ง"
        action={<PrimaryLinkButton href="/forgot-password">ขอลิงก์รีเซ็ตใหม่</PrimaryLinkButton>}
      />
    );
  }

  if (done) {
    return (
      <StatusPanel
        icon={CheckCircle2}
        title="ตั้งรหัสผ่านใหม่เรียบร้อย"
        description="กำลังพาคุณกลับไปหน้าเข้าสู่ระบบ..."
        action={
          <a
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--kc-muted)] transition-colors hover:text-[var(--kc-ink)]"
          >
            <ArrowLeft className="size-4" /> ไปหน้าเข้าสู่ระบบ
          </a>
        }
      />
    );
  }

  // ── Valid token: password form ───────────────────────────────────
  const strength = strengthFor(password.length);

  return (
    <div>
      <AuthTitle title="ตั้งรหัสผ่านใหม่" subtitle="สร้างรหัสผ่านใหม่สำหรับบัญชีของคุณ" />

      {error && <AlertBanner type="error" msg={error} />}

      <form onSubmit={onSubmit} className="flex flex-col gap-1">
        <div className="flex flex-col gap-1.5">
          <FieldLabel required>รหัสผ่านใหม่</FieldLabel>
          <IconField
            ref={passwordRef}
            icon={Lock}
            type={show ? "text" : "password"}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError(null);
              if (fieldErrors.password) setFieldErrors(p => ({ ...p, password: undefined }));
            }}
            placeholder="≥ 6 ตัวอักษร"
            autoComplete="new-password"
            invalid={!!fieldErrors.password}
            trailing={
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="flex items-center justify-center border-0 bg-transparent text-[var(--kc-sage)] transition-colors hover:text-[var(--kc-ink)] cursor-pointer"
                aria-label={show ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                tabIndex={-1}
              >
                {show ? <EyeOff className="size-4.5" /> : <Eye className="size-4.5" />}
              </button>
            }
          />
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full transition-all duration-300"
              style={{ width: strength.width, backgroundColor: strength.color }}
            />
          </div>
          <FieldError msg={fieldErrors.password} />
        </div>

        <div className="flex flex-col gap-1.5">
          <FieldLabel required>ยืนยันรหัสผ่านใหม่</FieldLabel>
          <IconField
            icon={Lock}
            type={showConfirm ? "text" : "password"}
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              if (error) setError(null);
              if (fieldErrors.confirm) setFieldErrors(p => ({ ...p, confirm: undefined }));
            }}
            placeholder="กรอกซ้ำ"
            autoComplete="new-password"
            invalid={!!fieldErrors.confirm}
            trailing={
              <button
                type="button"
                onClick={() => setShowConfirm((s) => !s)}
                className="flex items-center justify-center border-0 bg-transparent text-[var(--kc-sage)] transition-colors hover:text-[var(--kc-ink)] cursor-pointer"
                aria-label={showConfirm ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                tabIndex={-1}
              >
                {showConfirm ? <EyeOff className="size-4.5" /> : <Eye className="size-4.5" />}
              </button>
            }
          />
          <FieldError msg={fieldErrors.confirm} />
        </div>

        <PrimaryButton busy={busy} disabled={busy}>
          {busy ? "กำลังบันทึก..." : "บันทึกรหัสผ่านใหม่"}
        </PrimaryButton>
      </form>
    </div>
  );
}
