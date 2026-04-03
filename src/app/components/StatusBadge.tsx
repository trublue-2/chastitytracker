"use client";

import { Lock, LockOpen } from "lucide-react";

type StatusBadgeSize = "large" | "compact";

interface StatusBadgeProps {
  status: "locked" | "unlocked";
  duration: string;
  size?: StatusBadgeSize;
  className?: string;
}

export default function StatusBadge({
  status,
  duration,
  size = "large",
  className = "",
}: StatusBadgeProps) {
  const isLocked = status === "locked";
  const Icon = isLocked ? Lock : LockOpen;
  const colorClass = isLocked ? "text-lock" : "text-unlock";
  const bgClass = isLocked ? "bg-lock-bg" : "bg-unlock-bg";
  const borderClass = isLocked ? "border-lock-border" : "border-unlock-border";

  if (size === "compact") {
    return (
      <span className={`inline-flex items-center gap-1.5 ${className}`}>
        <Icon size={16} className={colorClass} />
        <span className={`text-sm font-medium ${colorClass}`}>
          {duration}
        </span>
      </span>
    );
  }

  return (
    <div className={`flex items-center gap-4 rounded-xl border px-5 py-4 ${bgClass} ${borderClass} ${className}`}>
      <div className={`shrink-0 ${colorClass}`}>
        <Icon size={40} strokeWidth={1.5} />
      </div>
      <div className="flex flex-col min-w-0">
        <span className={`text-2xl font-bold tabular-nums ${colorClass}`}>
          {duration}
        </span>
      </div>
    </div>
  );
}
