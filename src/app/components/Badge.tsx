import { type ReactNode } from "react";

type BadgeVariant = "lock" | "unlock" | "inspect" | "orgasm" | "request" | "sperrzeit" | "warn" | "ok" | "neutral";
type BadgeSize = "sm" | "default";

interface BadgeProps {
  variant?: BadgeVariant;
  size?: BadgeSize;
  icon?: ReactNode;
  label: string;
  className?: string;
}

const colorMap: Record<BadgeVariant, string> = {
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

const sizeClasses: Record<BadgeSize, string> = {
  sm:      "h-5 text-xs px-2 gap-1",
  default: "h-6 text-sm px-2.5 gap-1.5",
};

export default function Badge({
  variant = "neutral",
  size = "default",
  icon,
  label,
  className = "",
}: BadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center font-medium rounded-full border whitespace-nowrap",
        sizeClasses[size],
        colorMap[variant],
        className,
      ].join(" ")}
    >
      {icon && <span className="shrink-0" aria-hidden="true">{icon}</span>}
      {label}
    </span>
  );
}
