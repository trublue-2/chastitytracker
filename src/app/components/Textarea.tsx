"use client";

import { forwardRef, useId, type TextareaHTMLAttributes } from "react";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string | null;
  hint?: string;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, hint, required, disabled, maxLength, value, className = "", id: externalId, rows = 3, ...rest },
  ref,
) {
  const autoId = useId();
  const id = externalId ?? autoId;
  const errorId = error ? `${id}-error` : undefined;
  const hintId = hint && !error ? `${id}-hint` : undefined;
  const charCount = typeof value === "string" ? value.length : undefined;

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
      <textarea
        ref={ref}
        id={id}
        rows={rows}
        disabled={disabled}
        required={required}
        maxLength={maxLength}
        value={value}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={errorId ?? hintId}
        className={[
          "w-full rounded-lg border bg-surface-raised text-foreground text-base",
          "placeholder:text-foreground-faint resize-none",
          "max-h-[200px] overflow-y-auto",
          "px-3 py-2.5",
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
      <div className="flex justify-between items-center">
        {error ? (
          <p id={errorId} className="text-sm text-warn-text" role="alert">
            {error}
          </p>
        ) : hint ? (
          <p id={hintId} className="text-xs text-foreground-faint">
            {hint}
          </p>
        ) : (
          <span />
        )}
        {maxLength != null && charCount != null && (
          <span className="text-xs text-foreground-faint tabular-nums">
            {charCount}/{maxLength}
          </span>
        )}
      </div>
    </div>
  );
});

export default Textarea;
