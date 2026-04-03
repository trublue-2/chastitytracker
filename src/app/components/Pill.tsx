"use client";

import { X } from "lucide-react";

type PillVariant = "lock" | "unlock" | "inspect" | "orgasm" | "request" | "sperrzeit" | "warn" | "ok" | "neutral";

interface PillProps {
  label: string;
  variant?: PillVariant;
  onRemove?: () => void;
  className?: string;
}

const colorMap: Record<PillVariant, string> = {
  lock:      "bg-lock-bg text-lock-text border-lock-border",
  unlock:    "bg-unlock-bg text-unlock-text border-unlock-border",
  inspect:   "bg-inspect-bg text-inspect-text border-inspect-border",
  orgasm:    "bg-orgasm-bg text-orgasm-text border-orgasm-border",
  request:   "bg-request-bg text-request-text border-request-border",
  sperrzeit: "bg-sperrzeit-bg text-sperrzeit-text border-sperrzeit-border",
  warn:      "bg-warn-bg text-warn-text border-warn-border",
  ok:        "bg-ok-bg text-ok-text border-ok-border",
  neutral:   "bg-background-subtle text-foreground-muted border-border",
};

export default function Pill({
  label,
  variant = "neutral",
  onRemove,
  className = "",
}: PillProps) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 h-7 text-sm font-medium rounded-full border pl-3",
        onRemove ? "pr-1" : "pr-3",
        colorMap[variant],
        className,
      ].join(" ")}
    >
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center hover:bg-black/10 transition-colors"
          aria-label={`${label} entfernen`}
        >
          <X size={12} />
        </button>
      )}
    </span>
  );
}
