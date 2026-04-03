import { type ReactNode } from "react";

type StatsCardVariant = "default" | "progress" | "trend";
type TrendDirection = "up" | "down" | "neutral";
type SemanticColor = "lock" | "unlock" | "inspect" | "orgasm" | "request" | "sperrzeit" | "warn" | "ok";

interface StatsCardProps {
  value: string | number;
  label: string;
  variant?: StatsCardVariant;
  color?: SemanticColor;
  progress?: number;
  trend?: { direction: TrendDirection; label: string };
  icon?: ReactNode;
  className?: string;
}

const trendColors: Record<TrendDirection, string> = {
  up: "text-lock",
  down: "text-warn",
  neutral: "text-foreground-faint",
};

const trendArrows: Record<TrendDirection, string> = {
  up: "\u2191",
  down: "\u2193",
  neutral: "\u2192",
};

export default function StatsCard({
  value,
  label,
  variant = "default",
  color,
  progress,
  trend,
  icon,
  className = "",
}: StatsCardProps) {
  const valueColor = color ? `text-${color}` : "text-foreground";

  return (
    <div className={`rounded-xl border border-border bg-surface shadow-card p-4 sm:p-5 ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col min-w-0">
          <span className={`text-2xl font-bold tabular-nums ${valueColor}`}>
            {value}
          </span>
          <span className="text-sm text-foreground-muted mt-0.5">{label}</span>
        </div>
        {icon && (
          <span className="text-foreground-faint shrink-0" aria-hidden="true">
            {icon}
          </span>
        )}
      </div>

      {variant === "progress" && progress != null && (
        <div className="mt-3">
          <div className="h-2 rounded-full bg-background-subtle overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${color ? `bg-${color}` : "bg-btn-primary"}`}
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
          <span className="text-xs text-foreground-faint mt-1 block tabular-nums">
            {Math.round(progress)}%
          </span>
        </div>
      )}

      {variant === "trend" && trend && (
        <div className={`flex items-center gap-1 mt-2 text-sm font-medium ${trendColors[trend.direction]}`}>
          <span>{trendArrows[trend.direction]}</span>
          <span>{trend.label}</span>
        </div>
      )}
    </div>
  );
}
