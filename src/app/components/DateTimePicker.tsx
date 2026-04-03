"use client";

import { forwardRef, useId, type InputHTMLAttributes } from "react";

interface DateTimePickerProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
  error?: string | null;
  hint?: string;
}

const DateTimePicker = forwardRef<HTMLInputElement, DateTimePickerProps>(function DateTimePicker(
  { label, error, hint, required, disabled, className = "", id: externalId, ...rest },
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
      <input
        ref={ref}
        id={id}
        type="datetime-local"
        disabled={disabled}
        required={required}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={errorId ?? hintId}
        className={[
          "w-full h-11 rounded-lg border bg-surface-raised text-foreground text-base",
          "px-3",
          "transition-colors",
          "focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-focus-ring focus-visible:border-transparent",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          error
            ? "border-[var(--color-warn)] bg-warn-bg"
            : "border-border",
          className,
        ].filter(Boolean).join(" ")}
        {...rest}
      />
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

export default DateTimePicker;
