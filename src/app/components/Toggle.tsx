"use client";

import SettingLabel from "@/app/components/SettingLabel";
import ToggleSwitch from "@/app/components/ToggleSwitch";

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
      <ToggleSwitch checked={checked} />
    </div>
  );
}
