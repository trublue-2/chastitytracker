"use client";

interface ToggleProps {
  label: string;
  description?: string;
  checked?: boolean;
  disabled?: boolean;
  className?: string;
  onChange?: (checked: boolean) => void;
}

export default function Toggle({
  label,
  description,
  disabled,
  checked,
  className = "",
  onChange,
}: ToggleProps) {
  function handleClick() {
    if (disabled || !onChange) return;
    onChange(!checked);
  }

  return (
    <div
      role="switch"
      aria-checked={checked}
      aria-label={label}
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
        <span className="text-sm font-medium text-foreground">{label}</span>
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
