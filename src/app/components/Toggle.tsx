"use client";

import { useId, type InputHTMLAttributes } from "react";

interface ToggleProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
  description?: string;
}

export default function Toggle({
  label,
  description,
  disabled,
  checked,
  className = "",
  id: externalId,
  ...rest
}: ToggleProps) {
  const autoId = useId();
  const id = externalId ?? autoId;

  return (
    <label
      htmlFor={id}
      className={[
        "flex items-center justify-between gap-3 min-h-[48px] cursor-pointer select-none",
        disabled ? "opacity-50 cursor-not-allowed" : "",
        className,
      ].filter(Boolean).join(" ")}
    >
      <div className="flex flex-col">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {description && (
          <span className="text-xs text-foreground-faint">{description}</span>
        )}
      </div>
      <span className="relative inline-flex shrink-0">
        <input
          id={id}
          type="checkbox"
          role="switch"
          aria-checked={checked}
          disabled={disabled}
          checked={checked}
          className="peer sr-only"
          {...rest}
        />
        <span
          className={[
            "w-12 h-7 rounded-full transition-colors duration-fast",
            "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus-ring",
            checked ? "bg-btn-primary" : "bg-border-strong",
          ].filter(Boolean).join(" ")}
          aria-hidden="true"
        >
          <span
            className={[
              "block w-6 h-6 mt-0.5 rounded-full bg-white shadow-card transition-transform duration-fast",
              checked ? "translate-x-[22px]" : "translate-x-0.5",
            ].join(" ")}
          />
        </span>
      </span>
    </label>
  );
}
