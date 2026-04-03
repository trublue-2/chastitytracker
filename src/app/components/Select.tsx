"use client";

import { forwardRef, useId, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";

interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  label?: string;
  options: SelectOption[];
  error?: string | null;
  hint?: string;
  placeholder?: string;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, options, error, hint, placeholder, required, disabled, className = "", id: externalId, ...rest },
  ref,
) {
  const autoId = useId();
  const id = externalId ?? autoId;
  const errorId = error ? `${id}-error` : undefined;
  const hintId = hint && !error ? `${id}-hint` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={id}
          className="text-xs font-semibold uppercase tracking-wider text-foreground-muted"
        >
          {label}
          {required && <span className="text-warn ml-0.5">*</span>}
        </label>
      )}
      <div className="relative">
        <select
          ref={ref}
          id={id}
          disabled={disabled}
          required={required}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={errorId ?? hintId}
          className={[
            "w-full h-11 rounded-lg border bg-surface-raised text-foreground text-base",
            "appearance-none pl-3 pr-10",
            "transition-colors",
            "focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-focus-ring focus-visible:border-transparent",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            error
              ? "border-[var(--color-warn)] bg-warn-bg"
              : "border-border",
            className,
          ].filter(Boolean).join(" ")}
          {...rest}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={16}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-faint pointer-events-none"
          aria-hidden="true"
        />
      </div>
      {error && (
        <p id={errorId} className="text-sm text-warn-text" role="alert">
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={hintId} className="text-xs text-foreground-faint">
          {hint}
        </p>
      )}
    </div>
  );
});

export default Select;
