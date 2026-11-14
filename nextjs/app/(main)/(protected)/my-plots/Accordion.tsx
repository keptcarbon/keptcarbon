"use client";

import { useEffect, useState } from "react";

/**
 * Slide open/close wrapper (grid-rows 0fr→1fr), same mechanism as the
 * map-draw step-2 accordion. Content unmounts after the close transition,
 * unless keepMounted: then it mounts on first open and stays mounted (just
 * collapsed and inert) so its state -- slider values, fetched data, map
 * view -- survives closing and reopening.
 */
export function Accordion({ open, keepMounted = false, children }: { open: boolean; keepMounted?: boolean; children: React.ReactNode }) {
  const [render, setRender] = useState(open);
  useEffect(() => {
    if (open) setRender(true);
  }, [open]);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: open ? "1fr" : "0fr",
        transition: "grid-template-rows 0.32s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
      onTransitionEnd={(e) => {
        if (e.propertyName === "grid-template-rows" && e.target === e.currentTarget && !open && !keepMounted) {
          setRender(false);
        }
      }}
    >
      <div style={{ overflow: "hidden", minHeight: 0 }} inert={!open}>{render ? children : null}</div>
    </div>
  );
}
