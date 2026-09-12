"use client";

import SettingLabel from "@/app/components/SettingLabel";
import ToggleSwitch from "@/app/components/ToggleSwitch";

interface ToggleProps {
  label: string;
  description?: string;
  checked?: boolean;
  disabled?: boolean;
  className?: string;
  /** An {@link SettingLabel} weitergereicht: `warn` färbt die Erklärung, wenn sie ein Hindernis
   *  nennt („Benachrichtigungen blockiert"). */
  tone?: "default" | "warn";
  onChange?: (checked: boolean) => void;
}

export default function Toggle({
  label,
  description,
  disabled,
  checked,
  className = "",
  tone,
  onChange,
}: ToggleProps) {
  function handleClick() {
    if (disabled || !onChange) return;
    onChange(!checked);
  }

  // Dieselbe Bauform wie {@link ExpandRow}: fehlt der Rückruf, gibt es nichts zu schalten — die Zeile
  // behält Mass und Beschriftung, verliert aber Schalter, Rolle und Fokus. Sonst baut jeder Aufrufer
  // mit einem solchen Fall die Zeile ein zweites Mal nach und passt die Polsterung von Hand an die
  // andere Hälfte an (genau so standen in `PushAllowRow` ein `py-3` und ein `py-2` nebeneinander).
  const rowCls = [
    "flex items-center justify-between gap-3 min-h-[48px] select-none",
    className,
  ].filter(Boolean).join(" ");

  if (!onChange) {
    return (
      <div className={rowCls}>
        <SettingLabel label={label} description={description} tone={tone} />
      </div>
    );
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
        rowCls,
        "cursor-pointer touch-manipulation",
        disabled ? "opacity-50 cursor-not-allowed" : "",
      ].filter(Boolean).join(" ")}
    >
      <SettingLabel label={label} description={description} tone={tone} />
      <ToggleSwitch checked={checked} />
    </div>
  );
}
