"use client";

import { useEffect, useState } from "react";

export function CondolenceLightbox() {
  const [show, setShow] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    // Show once per browser tab session: sessionStorage survives page
    // navigation and reloads within the same tab, but is cleared when the
    // tab is closed — so it shows again on a fresh visit in a new tab.
    const hasSeen = sessionStorage.getItem("keptcarbon_condolence_seen");
    if (!hasSeen) {
      // Small delay before showing
      const timer = setTimeout(() => {
        setShow(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleClose = () => {
    sessionStorage.setItem("keptcarbon_condolence_seen", "true");
    setClosing(true);
    // Let the fade-out play before unmounting
    setTimeout(() => setShow(false), 300);
  };

  // Close on Escape
  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [show]);

  // Lock body scroll while open
  useEffect(() => {
    if (!show) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [show]);

  if (!show) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-8 bg-neutral-950/80 backdrop-blur-md transition-opacity duration-300 ${closing ? "opacity-0" : "opacity-100"}`}
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-label="คำไว้อาลัย"
    >
      <div
        className={`relative mx-auto w-full max-w-2xl transition-all duration-500 ease-out ${closing ? "opacity-0 scale-[0.98]" : "opacity-100 scale-100 animate-in fade-in zoom-in-95"}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute -top-3 -right-3 sm:-top-4 sm:-right-4 z-10 flex size-9 items-center justify-center rounded-full border-0 bg-white/95 text-neutral-800 shadow-lg ring-1 ring-black/10 backdrop-blur cursor-pointer transition-all hover:scale-105 hover:bg-white sm:size-10"
          aria-label="ปิด"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>

        {/* Image with an elegant frame */}
        <div className="relative flex items-center justify-center overflow-hidden rounded-2xl bg-black shadow-2xl ring-1 ring-white/10">
          <img
            src="/assets/img/keptcarbon_.webp"
            alt="คำไว้อาลัย"
            className="block h-auto w-full max-h-[86vh] object-contain"
          />
        </div>
      </div>
    </div>
  );
}
