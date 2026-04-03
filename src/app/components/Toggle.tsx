"use client";

import { useId, type ChangeEvent } from "react";

interface ToggleProps {
  label: string;
  description?: string;
  checked?: boolean;
  disabled?: boolean;
  className?: string;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
}

export default function Toggle({
  label,
  description,
  disabled,
  checked,
  className = "",
  onChange,
}: ToggleProps) {
  const id = useId();

  function handleClick() {
    if (disabled || !onChange) return;
    // Synthesize a change event with the toggled value
    const fakeEvent = { target: { checked: !checked } } as ChangeEvent<HTMLInputElement>;
    onChange(fakeEvent);
  }

  return (
    <div
      role="switch"
      aria-checked={checked}
      aria-labelledby={`${id}-label`}
      tabIndex={disabled ? -1 : 0}
      onClick={handleClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleClick(); } }}
      className={[
        "flex items-center justify-between gap-3 min-h-[48px] cursor-pointer select-none touch-manipulation",
        disabled ? "opacity-50 cursor-not-allowed" : "",
        className,
      ].filter(Boolean).join(" ")}
    >
      <div className="flex flex-col">
        <span id={`${id}-label`} className="text-sm font-medium text-foreground">{label}</span>
        {description && (
          <span className="text-xs text-foreground-faint">{description}</span>
        )}
      </div>
      <span
        className={[
          "relative inline-flex shrink-0 w-12 h-7 rounded-full transition-colors duration-fast",
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
    </div>
  );
}
