import React from "react";

export interface CardProps {
  /** Show accent left border */
  accent?: boolean;
  /** Remove decorative orb */
  clean?: boolean;
  className?: string;
  children: React.ReactNode;
}

export default function Card({
  accent = false,
  clean = false,
  className = "",
  children,
}: CardProps) {
  const cls = [
    "kc-card",
    accent ? "kc-card-accent" : "",
    clean ? "kc-card-clean" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <div className={cls}>{children}</div>;
}
