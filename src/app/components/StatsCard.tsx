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
  up: "↑",
  down: "↓",
  neutral: "→",
};

/** Wert- und Balkenfarbe je Bedeutung — AUSGESCHRIEBEN, nicht zusammengesetzt.
 *
 *  Hier stand `` `text-${color}` `` und `` `bg-${color}` ``. Tailwind liest den Quelltext statisch
 *  und sieht so gebaute Klassen nie: die Kennzahl „ohne Foto" war seit jeher farblos, obwohl sie
 *  `color="warn"` mitgab. Anders als bei `Card` fiel es nicht einmal zufällig auf, weil kein
 *  anderes Bauteil `text-warn` wörtlich trug. Ein `Record` über den Union-Typ erzwingt, dass eine
 *  neue Bedeutung hier auftaucht — dasselbe Muster wie `SEMANTIC_SURFACE`. */
const VALUE_COLOR: Record<SemanticColor, string> = {
  lock: "text-lock", unlock: "text-unlock", inspect: "text-inspect", orgasm: "text-orgasm",
  request: "text-request", sperrzeit: "text-sperrzeit", warn: "text-warn", ok: "text-ok",
};
const BAR_COLOR: Record<SemanticColor, string> = {
  lock: "bg-lock", unlock: "bg-unlock", inspect: "bg-inspect", orgasm: "bg-orgasm",
  request: "bg-request", sperrzeit: "bg-sperrzeit", warn: "bg-warn", ok: "bg-ok",
};

/**
 * Eine Kennzahl — die Zahl trägt sie, nicht der Kasten um sie herum.
 *
 * Vorher sass jede in einer eigenen Karte mit Rahmen, Radius und Fläche; vier davon nebeneinander
 * ergaben ein Gitter aus vier Zäunen, in dem die Zahlen kleiner wirkten als ihre Umrandung. Jetzt
 * steht die Zahl gross und frei, die Beschriftung leise darunter, und die Trennung übernimmt der
 * Abstand. Was Rahmen brauchte, war nie die Zahl, sondern die Unsicherheit, ob sie für sich stehen
 * kann.
 */
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
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className={`text-kennzahl font-semibold tabular-nums ${color ? VALUE_COLOR[color] : "text-foreground"}`}>
          {value}
        </span>
        {icon && (
          <span className="text-foreground-faint shrink-0" aria-hidden="true">
            {icon}
          </span>
        )}
      </div>
      <span className="text-neben text-foreground-faint">{label}</span>

      {variant === "progress" && progress != null && (
        <div className="mt-1">
          <div className="h-1 rounded-full bg-border-subtle overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${color ? BAR_COLOR[color] : "bg-btn-primary"}`}
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        </div>
      )}

      {variant === "trend" && trend && (
        <div className={`flex items-center gap-1 text-neben font-medium ${trendColors[trend.direction]}`}>
          <span>{trendArrows[trend.direction]}</span>
          <span>{trend.label}</span>
        </div>
      )}
    </div>
  );
}
