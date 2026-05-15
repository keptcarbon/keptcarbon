import React from "react";

export interface GradientTextProps {
  as?: "span" | "h1" | "h2" | "h3" | "h4" | "p";
  className?: string;
  children: React.ReactNode;
}

export default function GradientText({
  as: Tag = "span",
  className = "",
  children,
}: GradientTextProps) {
  return <Tag className={`kc-grad-text ${className}`}>{children}</Tag>;
}
