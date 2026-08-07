import React from "react";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Bootstrap icon class (e.g. "bi-envelope") */
  icon?: string;
  /** Label text */
  label?: string;
  /** Error message */
  error?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ icon, label, error, className = "", id, ...rest }, ref) => {
    const inputId = id || `input-${label?.replace(/\s+/g, "-").toLowerCase()}`;

    return (
      <div className="kc-field">
        {label && (
          <label htmlFor={inputId} className="kc-field-label">
            {label}
          </label>
        )}
        <div className={`kc-input-wrap ${className}`}>
          {icon && <i className={`bi ${icon}`} />}
          <input
            ref={ref}
            id={inputId}
            className={icon ? "" : "kc-input-bare"}
            {...rest}
          />
        </div>
        {error && (
          <span className="kc-field-error">{error}</span>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
export default Input;
