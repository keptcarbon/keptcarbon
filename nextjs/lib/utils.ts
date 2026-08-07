import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a Thai phone number for input display: keep digits only (max 10),
 * and group them as xxx-xxx-xxxx (e.g. "0123456789" → "012-345-6789").
 * Use directly in an input's onChange so hyphens are inserted as the user types
 * and non-numeric characters are ignored.
 */
export function formatThaiPhone(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 10);
  const parts = [d.slice(0, 3), d.slice(3, 6), d.slice(6, 10)].filter(Boolean);
  return parts.join("-");
}

/** Password-strength meter fill (width + color) driven by character count. */
export function strengthFor(len: number): { width: string; color: string } {
  if (len === 0) return { width: "0%", color: "transparent" };
  if (len < 4) return { width: "25%", color: "var(--kc-danger)" };
  if (len < 6) return { width: "50%", color: "var(--kc-warning)" };
  if (len < 10) return { width: "75%", color: "var(--kc-warning)" };
  return { width: "100%", color: "var(--kc-success)" };
}
