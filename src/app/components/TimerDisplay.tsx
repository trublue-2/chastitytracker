"use client";

import useTick from "@/app/hooks/useTick";
import { decomposeMs } from "@/lib/utils";

type TimerMode = "countup" | "countdown";
type TimerFormat = "long" | "short";

interface TimerDisplayProps {
  targetDate: Date | string;
  mode?: TimerMode;
  format?: TimerFormat;
  warningThreshold?: number;
  criticalThreshold?: number;
  className?: string;
  onExpire?: () => void;
}

function formatLong(totalMs: number): string {
  const { days: d, hours: h, minutes: m } = decomposeMs(Math.abs(totalMs));

  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0 || d > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(" ");
}

/** Bewusst NICHT über `decomposeMs`: die Uhr-Darstellung `h:mm:ss` faltet Tage in die Stunden
 *  (49h statt „2T 1h"), `decomposeMs` trennt sie ab. Ein Umbau änderte jede Anzeige über 24 h. */
function formatShort(totalMs: number): string {
  const totalSeconds = Math.floor(Math.abs(totalMs) / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function getPhaseColor(remainingRatio: number | null): string {
  if (remainingRatio === null) return "text-lock";
  if (remainingRatio > 0.5) return "text-lock";
  if (remainingRatio > 0.1) return "text-inspect";
  return "text-warn";
}

export default function TimerDisplay({
  targetDate,
  mode = "countup",
  format = "long",
  warningThreshold = 0.5,
  criticalThreshold = 0.1,
  className = "",
  onExpire,
}: TimerDisplayProps) {
  const target = typeof targetDate === "string" ? new Date(targetDate) : targetDate;
  useTick(1000);
  const now = new Date();

  const diffMs = mode === "countup"
    ? now.getTime() - target.getTime()
    : target.getTime() - now.getTime();

  // For countdown: calculate remaining ratio for phase colors
  let remainingRatio: number | null = null;
  if (mode === "countdown") {
    const totalDuration = target.getTime() - (target.getTime() - Math.abs(diffMs + now.getTime() - target.getTime()));
    if (totalDuration > 0) {
      remainingRatio = Math.max(0, diffMs) / totalDuration;
    }
    if (diffMs <= 0 && onExpire) {
      onExpire();
    }
  }

  const colorClass = mode === "countdown"
    ? getPhaseColor(diffMs > 0 ? diffMs / Math.max(1, Math.abs(target.getTime() - now.getTime()) + diffMs) : 0)
    : "text-lock";

  const isExpired = mode === "countdown" && diffMs <= 0;
  const displayMs = isExpired ? 0 : Math.abs(diffMs);
  const formatted = format === "long" ? formatLong(displayMs) : formatShort(displayMs);
  const prefix = isExpired && mode === "countdown" ? "-" : "";

  return (
    <span
      className={`font-mono font-bold tabular-nums ${colorClass} ${className}`}
      aria-live="polite"
      aria-label={`${mode === "countdown" ? "Verbleibend" : "Vergangen"}: ${formatted}`}
      suppressHydrationWarning
    >
      {prefix}{formatted}
    </span>
  );
}
