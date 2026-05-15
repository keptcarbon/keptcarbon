import React from "react";

export type ButtonVariant = "primary" | "ghost" | "soft" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual variant */
  variant?: ButtonVariant;
  /** Size preset */
  size?: ButtonSize;
  /** Full-width */
  block?: boolean;
  /** Show loading spinner */
  loading?: boolean;
  /** Render as <a> tag instead */
  href?: string;
  children: React.ReactNode;
}

export default function Button({
  variant = "primary",
  size = "md",
  block = false,
  loading = false,
  href,
  className = "",
  children,
  disabled,
  ...rest
}: ButtonProps) {
  const cls = [
    "kc-btn",
    `kc-btn--${variant}`,
    size !== "md" ? `kc-btn--${size}` : "",
    block ? "kc-btn--block" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (href) {
    return (
      <a href={href} className={cls}>
        {loading && <span className="kc-btn__spinner" />}
        {children}
      </a>
    );
  }

  return (
    <button className={cls} disabled={disabled || loading} {...rest}>
      {loading && <span className="kc-btn__spinner" />}
      {children}
    </button>
  );
}
