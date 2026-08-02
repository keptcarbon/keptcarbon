"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Send,
  UsersRound,
} from "lucide-react";

type Status = "idle" | "sending" | "success" | "error";

const fieldClass =
  "w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

const labelClass = "mb-1.5 block text-sm font-medium text-foreground";

type FieldErrors = { name?: string; email?: string; subject?: string; message?: string };

export default function ContactForm() {
  const [recipient, setRecipient] = useState<"keptcarbon" | "engrids">("keptcarbon");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  // Subtle one-time fade-up when the card scrolls into view
  const cardRef = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setRevealed(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // Defer a frame so the hidden state paints before transitioning
          requestAnimationFrame(() => setRevealed(true));
          observer.disconnect();
        }
      },
      { threshold: 0.2, rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  function validate(): boolean {
    const next: FieldErrors = {};
    if (!name.trim()) next.name = "กรุณากรอกชื่อ-นามสกุล";
    if (!email.trim()) next.email = "กรุณากรอกอีเมล";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = "รูปแบบอีเมลไม่ถูกต้อง";
    if (!subject.trim()) next.subject = "กรุณากรอกหัวข้อติดต่อ";
    if (!message.trim()) next.message = "กรุณากรอกข้อความ";
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMsg("");
    if (!validate()) return;
    setStatus("sending");

    const data = { recipient, name: name.trim(), email: email.trim(), subject: subject.trim(), message: message.trim() };

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "ส่งไม่สำเร็จ");
      setStatus("success");
      setName("");
      setEmail("");
      setSubject("");
      setMessage("");
      setFieldErrors({});
      setTimeout(() => setStatus("idle"), 3000);
    } catch (err: any) {
      setErrorMsg(err.message);
      setStatus("error");
    }
  }

  return (
    <div
      ref={cardRef}
      className={`rounded-xl border border-border bg-card p-6 shadow-sm transition-transform duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform md:p-8 ${
        revealed ? "translate-y-0" : "translate-y-10"
      }`}
    >
      {/* Header */}
      <div className="mb-5 flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Send className="size-4.5" aria-hidden="true" />
        </span>
        <h3 className="m-0 text-base font-semibold text-foreground md:text-lg">
          ส่งข้อความถึงเรา
        </h3>
      </div>

      {/* Recipient selector */}
      <div className="mb-5 flex items-center gap-3 border-t border-border pt-5">
        <label
          htmlFor="contact-recipient"
          className="flex shrink-0 items-center gap-2 text-sm font-medium text-foreground"
        >
          <UsersRound className="size-4 text-muted-foreground" aria-hidden="true" />
          ส่งถึง
        </label>
        <select
          id="contact-recipient"
          className={`${fieldClass} flex-1 pr-10`}
          value={recipient}
          onChange={(e) => setRecipient(e.target.value as "keptcarbon" | "engrids")}
        >
          <option value="keptcarbon">โครงการวิจัย KeptCarbon</option>
          <option value="engrids">ผู้พัฒนาระบบ</option>
        </select>
      </div>

      <form onSubmit={handleSubmit} className="border-t border-border pt-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="cf-name" className={labelClass}>
              ชื่อ-นามสกุล <span className="text-destructive">*</span>
            </label>
            <input
              id="cf-name"
              type="text"
              name="name"
              placeholder="กรอกชื่อ-นามสกุล"
              required
              value={name}
              onChange={(e) => { setName(e.target.value); if (fieldErrors.name) setFieldErrors((p) => ({ ...p, name: undefined })); }}
              aria-invalid={!!fieldErrors.name}
              className={`${fieldClass} ${fieldErrors.name ? "border-destructive focus:border-destructive focus:ring-destructive/20" : ""}`}
            />
            {fieldErrors.name && <p className="mt-1 text-xs text-destructive">{fieldErrors.name}</p>}
          </div>
          <div>
            <label htmlFor="cf-email" className={labelClass}>
              อีเมล <span className="text-destructive">*</span>
            </label>
            <input
              id="cf-email"
              type="email"
              name="email"
              placeholder="example@email.com"
              required
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: undefined })); }}
              aria-invalid={!!fieldErrors.email}
              className={`${fieldClass} ${fieldErrors.email ? "border-destructive focus:border-destructive focus:ring-destructive/20" : ""}`}
            />
            {fieldErrors.email && <p className="mt-1 text-xs text-destructive">{fieldErrors.email}</p>}
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="cf-subject" className={labelClass}>
              หัวข้อติดต่อ <span className="text-destructive">*</span>
            </label>
            <input
              id="cf-subject"
              type="text"
              name="subject"
              placeholder="ระบุหัวข้อที่ต้องการติดต่อ"
              required
              value={subject}
              onChange={(e) => { setSubject(e.target.value); if (fieldErrors.subject) setFieldErrors((p) => ({ ...p, subject: undefined })); }}
              aria-invalid={!!fieldErrors.subject}
              className={`${fieldClass} ${fieldErrors.subject ? "border-destructive focus:border-destructive focus:ring-destructive/20" : ""}`}
            />
            {fieldErrors.subject && <p className="mt-1 text-xs text-destructive">{fieldErrors.subject}</p>}
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="cf-message" className={labelClass}>
              ข้อความถึงเรา <span className="text-destructive">*</span>
            </label>
            <textarea
              id="cf-message"
              name="message"
              rows={4}
              placeholder="เขียนข้อความของคุณที่นี่..."
              required
              value={message}
              onChange={(e) => { setMessage(e.target.value); if (fieldErrors.message) setFieldErrors((p) => ({ ...p, message: undefined })); }}
              aria-invalid={!!fieldErrors.message}
              className={`${fieldClass} resize-y ${fieldErrors.message ? "border-destructive focus:border-destructive focus:ring-destructive/20" : ""}`}
            />
            {fieldErrors.message && <p className="mt-1 text-xs text-destructive">{fieldErrors.message}</p>}
          </div>
        </div>

        {/* Feedback + submit */}
        <div className="mt-5">
          {status === "success" ? (
            <div className="flex items-center justify-center gap-2 rounded-lg border border-primary/30 bg-secondary px-4 py-3 text-sm font-medium text-primary">
              <CheckCircle2 className="size-4.5" aria-hidden="true" />
              ส่งข้อความสำเร็จแล้ว!
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {status === "error" && (
                <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm font-medium text-destructive">
                  <AlertCircle className="size-4.5 shrink-0" aria-hidden="true" />
                  {errorMsg}
                </div>
              )}
              <button
                type="submit"
                disabled={status === "sending"}
                className="mx-auto inline-flex h-11 w-1/2 items-center justify-center gap-2 rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {status === "sending" ? (
                  <>
                    <Loader2 className="size-4.5 animate-spin" aria-hidden="true" />
                    กำลังส่ง...
                  </>
                ) : (
                  <>
                    <Send className="size-4.5" aria-hidden="true" />
                    ส่งข้อความ
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
