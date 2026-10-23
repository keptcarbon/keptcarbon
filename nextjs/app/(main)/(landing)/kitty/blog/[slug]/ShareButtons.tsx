"use client";

import { useState } from "react";
import { Check, Link2 } from "lucide-react";

const pill =
  "inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-border bg-muted px-3 py-2 text-xs font-medium whitespace-nowrap text-foreground no-underline transition-colors hover:border-primary/30 hover:bg-secondary";

/* Facebook / LINE share + copy link, for the current page URL. */
export default function ShareButtons() {
  const [copied, setCopied] = useState(false);
  const url = () => window.location.href;

  const open = (shareUrl: string) =>
    window.open(shareUrl, "_blank", "noopener,noreferrer,width=600,height=600");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked (http / permissions) — nothing to do */
    }
  };

  return (
    <div className="flex gap-2">
      <button
        type="button"
        className={pill}
        onClick={() => open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url())}`)}
      >
        Facebook
      </button>
      <button
        type="button"
        className={pill}
        onClick={() => open(`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url())}`)}
      >
        LINE
      </button>
      <button type="button" className={pill} onClick={copy} aria-live="polite">
        {copied ? (
          <>
            <Check className="size-3.5 text-primary" aria-hidden="true" />
            คัดลอกแล้ว
          </>
        ) : (
          <>
            <Link2 className="size-3.5" aria-hidden="true" />
            คัดลอกลิงก์
          </>
        )}
      </button>
    </div>
  );
}
