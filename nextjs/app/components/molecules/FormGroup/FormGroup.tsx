"use client";

import React from "react";
import { Input } from "@/app/components/atoms";
import type { InputProps } from "@/app/components/atoms";

export interface FormGroupProps {
  /** Label text */
  label: string;
  /** Icon class (e.g. "bi-envelope") */
  icon?: string;
  /** Error message */
  error?: string;
  /** Extra className on wrapper */
  className?: string;
  children?: React.ReactNode;
  /** Input props — if no children, renders an Input atom */
  inputProps?: InputProps;
}

export default function FormGroup({
  label,
  icon,
  error,
  className = "",
  children,
  inputProps,
}: FormGroupProps) {
  return (
    <div className={`modal-auth-form-group ${className}`}>
      <label>{label}</label>
      {children || (
        <div className="modal-inp-wrap">
          {icon && <i className={`bi ${icon}`} />}
          {inputProps && <input {...inputProps} />}
        </div>
      )}
      {error && (
        <span style={{ color: "var(--kc-error)", fontSize: "var(--kc-font-size-xs)", marginTop: 4, display: "block" }}>
          {error}
        </span>
      )}
    </div>
  );
}
