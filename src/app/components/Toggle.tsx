"use client";

import SettingLabel from "@/app/components/SettingLabel";

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
      <SettingLabel label={label} description={description} />
      <span
        className={[
          "relative inline-flex shrink-0 w-12 h-7 rounded-full transition-colors duration-fast",
          checked ? "bg-btn-primary" : "bg-border-strong",
        ].filter(Boolean).join(" ")}
        aria-hidden="true"
      >
        {/* Der Knopf nimmt die Schrift-Farbe der Primärfläche, nicht Weiss.
            Weiss auf `--btn-primary` mass 3,4 (rosa), 2,9 (indigo) und 1,9 (grün) — der
            EINGESCHALTETE Zustand war damit schlechter ablesbar als der ausgeschaltete (8,6 auf
            `border-strong`), und in der grünen Welt verschwamm der Knopf mit seiner Schiene. Genau
            verkehrt herum: der Zustand, der etwas aussagt, muss der deutlichere sein. */}
        <span
          className={[
            "block w-6 h-6 mt-0.5 rounded-full shadow-card transition-transform duration-fast",
            checked ? "bg-btn-primary-text translate-x-[22px]" : "bg-foreground translate-x-0.5",
          ].join(" ")}
        />
      </span>
    </div>
  );
}
