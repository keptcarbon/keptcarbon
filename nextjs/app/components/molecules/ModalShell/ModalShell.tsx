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
      className="kc-modal-backdrop"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 1080,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "16px",
        overflowY: "auto",
      }}
    >
      <div
        style={{ width: "100%", maxWidth: width, position: "relative", margin: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-auth-card">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              border: 0,
              background: "transparent",
              fontSize: 22,
              cursor: "pointer",
              color: "#94a3b8",
              lineHeight: 1,
            }}
          >
            ×
          </button>
          {children}
        </div>
      </div>
    </div>
  );
}
