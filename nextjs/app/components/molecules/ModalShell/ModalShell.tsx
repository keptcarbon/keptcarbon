"use client";

import React, { useEffect } from "react";

export interface ModalShellProps {
  /** Max width of modal card */
  width?: number;
  /** Close handler */
  onClose: () => void;
  children: React.ReactNode;
}

export default function ModalShell({
  width = 440,
  onClose,
  children,
}: ModalShellProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="kc-tw fixed inset-0 z-[1080] flex items-start justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="relative w-full transition-all"
        style={{ maxWidth: width }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative overflow-hidden rounded-2xl bg-white p-6 shadow-2xl sm:p-8 border border-[var(--kc-border-input)]">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 flex size-8 items-center justify-center border-0 bg-transparent rounded-full text-[var(--kc-muted)] transition-colors hover:bg-[var(--kc-green-50)] hover:text-[var(--kc-ink)] cursor-pointer"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
          {children}
        </div>
      </div>
    </div>
  );
}
