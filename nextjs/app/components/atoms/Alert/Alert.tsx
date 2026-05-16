import React from "react";

export type AlertType = "success" | "error" | "warning" | "info";

export interface AlertProps {
  type: AlertType;
  children: React.ReactNode;
  className?: string;
}

const iconMap: Record<AlertType, string> = {
  success: "bi-check-circle",
  error: "bi-exclamation-circle",
  warning: "bi-exclamation-triangle",
  info: "bi-info-circle",
};

export default function Alert({ type, children, className = "" }: AlertProps) {
  return (
    <div className={`kc-alert ${type} ${className}`}>
      <i className={`bi ${iconMap[type]}`} />
      {children}
    </div>
  );
}
