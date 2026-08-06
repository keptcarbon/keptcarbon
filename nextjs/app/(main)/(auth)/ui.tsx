"use client";

/**
 * Shared UI primitives for the public auth pages (forgot / reset password).
 * Deliberately mirrors app/components/organisms/AuthModals/AuthModals.tsx
 * class-for-class (rounded-xl inputs, text-base labels, AlertBox banner,
 * FieldError, RequiredStar, button sizing) so these standalone pages read as
 * a continuation of the login/register modal, not a different design.
 */
import { forwardRef } from "react";
import Link from "next/link";
import { CheckCircle2, AlertCircle, Check, Loader2, type LucideIcon } from "lucide-react";

// ── Page header (logo lives in the layout; this is just the title block) ──
export function AuthTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-5 text-center">
      <h1 className="mb-0 text-2xl font-bold tracking-tight text-[var(--kc-ink)]">{title}</h1>
      {subtitle && (
        <p className="mt-1.5 text-sm leading-relaxed text-[var(--kc-muted)]">{subtitle}</p>
      )}
    </div>
  );
}

// ── Top-of-form banner — identical markup/classes to AuthModals' AlertBox ──
export function AlertBanner({ type, msg }: { type: "success" | "error"; msg: string }) {
  const isSuccess = type === "success";
  return (
    <div
      className={`mb-6 flex items-start gap-3 rounded-xl p-4 text-base font-medium ${
        isSuccess ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
      }`}
    >
      {isSuccess ? (
        <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
      ) : (
        <AlertCircle className="mt-0.5 size-5 shrink-0" />
      )}
      <span>{msg}</span>
    </div>
  );
}

// ── Field label with the same red-asterisk "required" marker as the modal ──
export function RequiredStar() {
  return <span className="text-red-500"> *</span>;
}

export function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="text-base font-medium text-[var(--kc-ink)]">
      {children}
      {required && <RequiredStar />}
    </label>
  );
}

/** Same red-400/border-input focus-ring logic as AuthModals' errBorder(). */
function errBorder(hasError: boolean): string {
  return hasError
    ? "border-red-400 focus:border-red-400 focus:ring-1 focus:ring-red-400"
    : "border-[var(--kc-border-input)] focus:border-[var(--kc-green)] focus:ring-1 focus:ring-[var(--kc-green)]";
}

type IconFieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  icon: LucideIcon;
  invalid?: boolean;
  trailing?: React.ReactNode;
};

/** Icon-left text input — matches the modal's input exactly (rounded-xl, py-2.5, pl-10). */
export const IconField = forwardRef<HTMLInputElement, IconFieldProps>(function IconField(
  { icon: Icon, invalid, trailing, className = "", ...rest },
  ref
) {
  return (
    <div className="relative">
      <Icon className="absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-[var(--kc-sage)]" />
      <input
        ref={ref}
        {...rest}
        className={`w-full rounded-xl border bg-white py-2.5 pl-10 text-base text-[var(--kc-ink)] outline-none transition-colors placeholder:text-slate-400 ${
          trailing ? "pr-10" : "pr-4"
        } ${errBorder(!!invalid)} ${className}`}
      />
      {trailing && (
        <div className="absolute right-3.5 top-1/2 -translate-y-1/2">{trailing}</div>
      )}
    </div>
  );
});

/** Inline per-field validation message — identical to the modal's FieldError. */
export function FieldError({ msg }: { msg?: string | null }) {
  if (!msg) return null;
  return (
    <p className="flex items-center gap-1 text-sm font-medium text-red-500">
      <AlertCircle className="size-3.5 shrink-0" />
      <span>{msg}</span>
    </p>
  );
}

/** Primary submit button — same sizing/weight as the modal's submit button. */
export function PrimaryButton({
  busy,
  children,
  ...rest
}: { busy?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="submit"
      {...rest}
      className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border-0 bg-[var(--kc-green)] py-2.5 text-base font-semibold text-white transition-colors hover:bg-[var(--kc-green-dark)] disabled:cursor-not-allowed disabled:opacity-70 cursor-pointer"
    >
      {busy && <Loader2 className="size-4.5 animate-spin" />}
      {children}
    </button>
  );
}

/** Link styled as the primary button (used for "request a new link", etc). */
export function PrimaryLinkButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="mt-2 flex w-full items-center justify-center rounded-xl border-0 bg-[var(--kc-green)] py-2.5 text-base font-semibold text-white no-underline transition-colors hover:bg-[var(--kc-green-dark)]"
    >
      {children}
    </Link>
  );
}

/** Bottom-of-card muted line with a green inline link — same as modal's "ยังไม่มีบัญชี?" row. */
export function BottomLink({ label, href, linkText }: { label: string; href: string; linkText: string }) {
  return (
    <div className="mt-4 text-center text-base font-medium text-[var(--kc-muted)]">
      {label}{" "}
      <Link href={href} className="text-[var(--kc-green)] no-underline hover:underline">
        {linkText}
      </Link>
    </div>
  );
}

/** Full-panel status state (success / expired), icon in a soft brand circle. */
export function StatusPanel({
  icon: Icon,
  tone = "green",
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  tone?: "green" | "error";
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  const badge =
    tone === "error" ? "bg-red-50 text-red-500" : "bg-[var(--kc-green-50)] text-[var(--kc-green)]";
  return (
    <div className="flex flex-col items-center text-center">
      <div className={`mb-4 flex size-12 items-center justify-center rounded-full ${badge}`}>
        <Icon className="size-6" />
      </div>
      <h1 className="mb-1.5 text-2xl font-bold tracking-tight text-[var(--kc-ink)]">{title}</h1>
      <p className="mb-6 text-sm leading-relaxed text-[var(--kc-muted)]">{description}</p>
      {action}
    </div>
  );
}

/** Centered spinner + label (token validation, in-flight states). */
export function LoadingPanel({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center py-6 text-center">
      <Loader2 className="mb-3 size-7 animate-spin text-[var(--kc-sage)]" />
      <p className="text-sm text-[var(--kc-muted)]">{label}</p>
    </div>
  );
}

/** Live password-requirement row: muted until met, brand green + check once satisfied. */
export function Requirement({ met, label }: { met: boolean; label: string }) {
  return (
    <span
      className={`flex items-center gap-1.5 text-sm transition-colors ${
        met ? "text-[var(--kc-green)]" : "text-[var(--kc-muted)]"
      }`}
    >
      <Check className={`size-3.5 shrink-0 ${met ? "opacity-100" : "opacity-40"}`} />
      {label}
    </span>
  );
}
