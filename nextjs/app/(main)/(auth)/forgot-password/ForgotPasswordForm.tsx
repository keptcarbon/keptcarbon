"use client";

import { useRef, useState } from "react";
import { Mail, ArrowLeft, CheckCircle2 } from "lucide-react";
import {
  AuthTitle,
  AlertBanner,
  FieldLabel,
  IconField,
  FieldError,
  PrimaryButton,
  StatusPanel,
} from "../ui";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ForgotPasswordForm() {
  const emailRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    const value = email.trim();
    if (!value) {
      setFieldError("กรุณากรอกอีเมล");
      emailRef.current?.focus();
      return;
    }
    if (!EMAIL_RE.test(value)) {
      setFieldError("รูปแบบอีเมลไม่ถูกต้อง");
      emailRef.current?.focus();
      return;
    }
    setFieldError(null);

    setBusy(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value }),
      });
      // Enumeration-safe: the server returns 200 whether or not the email
      // exists, so a 2xx here just means "request accepted".
      if (res.ok) {
        setSent(true);
      } else {
        const data = await res.json().catch(() => ({}));
        setServerError(data?.error || "เกิดข้อผิดพลาด กรุณาลองใหม่");
        setBusy(false);
      }
    } catch {
      setServerError("เกิดข้อผิดพลาดในการเชื่อมต่อ");
      setBusy(false);
    }
  };

  // Success — deliberately generic (does not confirm the email exists).
  if (sent) {
    return (
      <StatusPanel
        icon={CheckCircle2}
        title="ตรวจสอบอีเมลของคุณ"
        description="หากอีเมลนี้มีอยู่ในระบบ เราได้ส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปให้แล้ว ลิงก์จะหมดอายุใน 15 นาที"
        action={
          <a
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--kc-muted)] transition-colors hover:text-[var(--kc-ink)]"
          >
            <ArrowLeft className="size-4" /> กลับสู่หน้าหลัก
          </a>
        }
      />
    );
  }

  return (
    <div>
      <AuthTitle title="ลืมรหัสผ่าน" subtitle="กรอกอีเมลที่ใช้สมัคร เราจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปให้" />

      {serverError && <AlertBanner type="error" msg={serverError} />}

      <form onSubmit={onSubmit} className="flex flex-col gap-1">
        <div className="flex flex-col gap-1.5">
          <FieldLabel required>อีเมล</FieldLabel>
          <IconField
            ref={emailRef}
            icon={Mail}
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (fieldError) setFieldError(null);
            }}
            placeholder="กรอกอีเมลของคุณ"
            autoComplete="email"
            invalid={!!fieldError}
          />
          <FieldError msg={fieldError} />
        </div>

        <PrimaryButton busy={busy} disabled={busy}>
          {busy ? "กำลังส่ง..." : "ส่งลิงก์รีเซ็ตรหัสผ่าน"}
        </PrimaryButton>
      </form>

      <div className="mt-4 text-center text-base font-medium text-[var(--kc-muted)]">
        จำรหัสผ่านได้แล้ว?{" "}
        <a href="/" className="text-[var(--kc-green)] no-underline hover:underline">
          เข้าสู่ระบบ
        </a>
      </div>
    </div>
  );
}
