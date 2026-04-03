"use client";

import { forwardRef, useId, type InputHTMLAttributes } from "react";
import { Check } from "lucide-react";

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
}

const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, disabled, className = "", id: externalId, checked, ...rest },
  ref,
) {
  const autoId = useId();
  const id = externalId ?? autoId;

  return (
    <label
      htmlFor={id}
      className={[
        "inline-flex items-center gap-3 min-h-[48px] cursor-pointer select-none",
        disabled ? "opacity-50 cursor-not-allowed" : "",
        className,
      ].filter(Boolean).join(" ")}
    >
      <span className="relative flex items-center justify-center shrink-0">
        <input
          ref={ref}
          id={id}
          type="checkbox"
          disabled={disabled}
          checked={checked}
          className="peer sr-only"
          {...rest}
        />
        <span
          className={[
            "w-5 h-5 rounded border-2 transition-colors",
            "flex items-center justify-center",
            "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus-ring",
            checked
              ? "bg-btn-primary border-btn-primary"
              : "bg-surface border-border-strong",
            disabled ? "" : "peer-hover:border-foreground-faint",
          ].filter(Boolean).join(" ")}
          aria-hidden="true"
        >
          {checked && (
            <Check size={14} className="text-btn-primary-text" strokeWidth={3} />
          )}
        </span>
      </span>
      <span className="text-sm text-foreground">{label}</span>
    </label>
  );
});

export default Checkbox;
