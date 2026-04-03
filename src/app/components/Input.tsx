"use client";

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: string;
  error?: string | null;
  hint?: string;
  icon?: ReactNode;
}

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, icon, required, disabled, className = "", id: externalId, ...rest },
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
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-faint pointer-events-none" aria-hidden="true">
            {icon}
          </span>
        )}
        <input
          ref={ref}
          id={id}
          disabled={disabled}
          required={required}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={errorId ?? hintId}
          className={[
            "w-full h-11 rounded-lg border bg-surface-raised text-foreground text-base",
            "placeholder:text-foreground-faint",
            "transition-colors",
            "focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-focus-ring focus-visible:border-transparent",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            icon ? "pl-10 pr-3" : "px-3",
            error
              ? "border-[var(--color-warn)] bg-warn-bg"
              : "border-border",
            className,
          ].filter(Boolean).join(" ")}
          {...rest}
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

export default Input;
