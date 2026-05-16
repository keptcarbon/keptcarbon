import React from "react";

export interface EyebrowProps {
  /** Dark variant for use on dark backgrounds */
  dark?: boolean;
  /** Optional icon (Bootstrap icon class) */
  icon?: string;
  className?: string;
  children: React.ReactNode;
}

export default function Eyebrow({
  dark = false,
  icon,
  className = "",
  children,
}: EyebrowProps) {
  return (
    <span className={`kc-eyebrow ${dark ? "kc-eyebrow-dark" : ""} ${className}`}>
      {icon && <i className={`bi ${icon}`} />}
      {children}
    </span>
  );
}
