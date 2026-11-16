"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* Copies the APA citation -- as HTML too, so the italic title survives a
   paste into Word / Google Docs; plain text everywhere else. */
export default function CopyCitationButton({
  before,
  title,
  after,
}: {
  /** "Author. (Date). " */
  before: string;
  /** Italicized in the HTML copy. */
  title: string;
  /** ". Site. URL" */
  after: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const text = `${before}${title}${after}`;
    const html = `${escapeHtml(before)}<i>${escapeHtml(title)}</i>${escapeHtml(after)}`;
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/plain": new Blob([text], { type: "text/plain" }),
            "text/html": new Blob([html], { type: "text/html" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(text);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked (http / permissions) — nothing to do */
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-live="polite"
      className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1.5 text-xs font-medium whitespace-nowrap text-foreground transition-colors hover:border-primary/30 hover:bg-secondary"
    >
      {copied ? (
        <>
          <Check className="size-3.5 text-primary" aria-hidden="true" />
          คัดลอกแล้ว
        </>
      ) : (
        <>
          <Copy className="size-3.5" aria-hidden="true" />
          คัดลอกการอ้างอิง
        </>
      )}
    </button>
  );
}
