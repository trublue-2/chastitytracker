import { type ReactNode } from "react";

export type BadgeVariant = "lock" | "unlock" | "inspect" | "orgasm" | "request" | "sperrzeit" | "warn" | "ok" | "neutral";
type BadgeSize = "sm" | "default";

interface BadgeProps {
  variant?: BadgeVariant;
  /** Ein fertiger Farbton statt einer Variante — für Zustände, die ihre Farbe schon als Klasse
   *  mitbringen (`kontrollePills.ts` rechnet sie aus Anforderungs- und Verifikations-Status aus).
   *  ERSETZT `variant`, steht nicht daneben: zwei `text-*`-Klassen am selben Element entscheidet
   *  die Reihenfolge im erzeugten Stylesheet, nicht die im Attribut — das ist keine Wahl, das ist
   *  ein Würfel. */
  tone?: string;
  size?: BadgeSize;
  icon?: ReactNode;
  label: string;
  /** Optionaler Zusatzinhalt nach dem Label (z.B. ein hervorgehobener Wert oder Status-Icon). */
  children?: ReactNode;
  className?: string;
}

/**
 * Der Ton eines Abzeichens — nur noch SCHRIFT, keine Fläche und kein Rahmen.
 *
 * Ein Abzeichen ist eine Beschriftung, die etwas über die Zeile daneben sagt. Als gefüllte Pille
 * mit Rahmen war es dreimal ausgezeichnet — Farbe, Fläche, Umrandung — für eine Aussage von zwei
 * Wörtern, und auf einer Liste standen zwölf davon untereinander. Was übrig bleibt, ist die
 * Farbe; sie allein trägt die Aussage, und sie trägt sie nur, wenn sie selten ist.
 */
const colorMap: Record<BadgeVariant, string> = {
  lock:      "text-lock",
  unlock:    "text-unlock",
  inspect:   "text-inspect",
  orgasm:    "text-orgasm",
  request:   "text-request",
  sperrzeit: "text-sperrzeit",
  warn:      "text-warn",
  ok:        "text-ok",
  neutral:   "text-foreground-muted",
};

const sizeClasses: Record<BadgeSize, string> = {
  sm:      "text-rubrik gap-1",
  default: "text-neben gap-1.5",
};

export default function Badge({
  variant = "neutral",
  tone,
  size = "default",
  icon,
  label,
  children,
  className = "",
}: BadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center font-semibold whitespace-nowrap",
        sizeClasses[size],
        tone ?? colorMap[variant],
        className,
      ].join(" ")}
    >
      {icon && <span className="shrink-0" aria-hidden="true">{icon}</span>}
      {label}
      {children}
    </span>
  );
}
