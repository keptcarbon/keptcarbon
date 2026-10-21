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

/** Areas (ไร่, ตร.ม.) are always shown with 2 decimals and thousands separators, e.g. 1,234.56. */
export function formatArea(value: number): string {
  return value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Carbon (tCO₂eq) is kept and shown with 2 decimals everywhere, so per-plot
 * values add up visually to project totals and gain = stock(t) − stock(base).
 * Round each plot's value with carbon2, derive gains and sums from those, and
 * round down to whole tonnes (creditTonnes) only where credits are priced.
 * The epsilon guards float noise such as 0.1 + 0.2.
 */
export function carbon2(value: number): number {
  return Math.round(value * 100 + (value >= 0 ? 1e-7 : -1e-7)) / 100;
}

/** A carbon ± CI with 2 decimals, rounded UP so uncertainty is never understated. */
export function ciCarbon2(value: number): number {
  return Math.max(0, Math.ceil(value * 100 - 1e-7) / 100);
}

export function formatCarbon(value: number): string {
  return carbon2(value).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatCiCarbon(value: number): string {
  return formatCarbon(ciCarbon2(value));
}

/** TGO: credits are priced as whole tonnes, rounded DOWN from the (2-decimal) total. */
export function creditTonnes(value: number): number {
  return Math.max(0, Math.floor(value + 1e-9));
}
