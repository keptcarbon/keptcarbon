"use client";

import { Sprout, TreeDeciduous } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";

export const plantStatusLabel = (status?: string) =>
  status === "replanting" ? "เริ่มปลูกใหม่" : status === "existing" ? "ปลูกมาแล้ว" : "—";

/**
 * Icon-only plant status (sprout = replanting, tree = existing); the label lives
 * in the tooltip / screen-reader name. Focusable so keyboard users get it too.
 * Renders nothing for an unknown status.
 */
export function PlantStatusIcon({ status, size = "md" }: { status?: string; size?: "sm" | "md" }) {
  if (status !== "replanting" && status !== "existing") return null;
  const box = size === "sm" ? "size-6 rounded-md" : "size-9 rounded-lg";
  const icon = size === "sm" ? "size-3.5" : "size-4";
  return (
    <Tooltip content={plantStatusLabel(status)}>
      <span
        role="img"
        tabIndex={0}
        aria-label={plantStatusLabel(status)}
        className={`inline-flex ${box} cursor-help items-center justify-center border border-border bg-card text-primary outline-none focus-visible:ring-2 focus-visible:ring-primary/30`}
      >
        {status === "replanting"
          ? <Sprout className={icon} aria-hidden="true" />
          : <TreeDeciduous className={icon} aria-hidden="true" />}
      </span>
    </Tooltip>
  );
}
