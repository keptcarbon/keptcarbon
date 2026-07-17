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

export default function ContactForm() {
  const [recipient, setRecipient] = useState<"keptcarbon" | "engrids">("keptcarbon");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");

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

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("sending");
    setErrorMsg("");

    const form = e.currentTarget;
    const data = {
      recipient,
      name: (form.elements.namedItem("name") as HTMLInputElement).value,
      email: (form.elements.namedItem("email") as HTMLInputElement).value,
      subject: (form.elements.namedItem("subject") as HTMLInputElement).value,
      message: (form.elements.namedItem("message") as HTMLTextAreaElement).value,
    };

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "ส่งไม่สำเร็จ");
      setStatus("success");
      form.reset();
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
          <option value="engrids">ผู้พัฒนาระบบ EnGRIDs</option>
        </select>
      </div>

      <form onSubmit={handleSubmit} className="border-t border-border pt-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="cf-name" className={labelClass}>
              ชื่อ-นามสกุล
            </label>
            <input
              id="cf-name"
              type="text"
              name="name"
              placeholder="กรอกชื่อ-นามสกุล"
              required
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor="cf-email" className={labelClass}>
              อีเมล
            </label>
            <input
              id="cf-email"
              type="email"
              name="email"
              placeholder="example@email.com"
              required
              className={fieldClass}
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="cf-subject" className={labelClass}>
              หัวข้อติดต่อ
            </label>
            <input
              id="cf-subject"
              type="text"
              name="subject"
              placeholder="ระบุหัวข้อที่ต้องการติดต่อ"
              required
              className={fieldClass}
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="cf-message" className={labelClass}>
              ข้อความถึงเรา
            </label>
            <textarea
              id="cf-message"
              name="message"
              rows={4}
              placeholder="เขียนข้อความของคุณที่นี่..."
              required
              className={`${fieldClass} resize-y`}
            />
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
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
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
