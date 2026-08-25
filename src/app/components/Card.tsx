import { type HTMLAttributes, type ReactNode } from "react";

type CardVariant = "default" | "outlined" | "semantic" | "interactive";
type CardPadding = "default" | "compact" | "none";
type SemanticColor = "lock" | "unlock" | "inspect" | "orgasm" | "request" | "sperrzeit" | "warn" | "ok";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  semantic?: SemanticColor;
  padding?: CardPadding;
  children: ReactNode;
}

/**
 * Der Innenraum einer Karte mit Randstreifen — Aufgaben-Karte und Strafen-Karte teilen ihn.
 *
 * Als Konstante statt als Komponente: gemeinsam ist wirklich nur diese Klassenkette, während der
 * INHALT beider Karten verschieden ist (die Aufgabe trägt Bedingungen, Nachweise und einen
 * Aktions-Slot, die Strafe nichts davon). Eine Rahmen-Komponente um ein einziges `div` wäre die
 * schlechtere Abstraktion — geteilt gehört der Wert, nicht die Struktur.
 */
export const CARD_BODY_STRIPED = "flex flex-col gap-3 p-4 border-l-[3px] border-l-border-strong";

const paddingClasses: Record<CardPadding, string> = {
  default: "p-4 sm:p-5",
  compact: "p-3",
  none: "",
};

/** Fläche und Rahmen je Bedeutung — AUSGESCHRIEBEN, nicht zusammengesetzt.
 *
 *  Vorher stand hier `` `bg-${semantic}-bg border-[var(--color-${semantic}-border)]` ``. Tailwind
 *  liest den Quelltext statisch; eine so gebaute Klasse sieht es NIE. Dass die Karten trotzdem
 *  Farbe hatten, war Zufall: dieselben Namen standen wörtlich in `Pill` und `Badge`, und davon
 *  lebten die 26 semantischen Karten mit. Wer diese Klassen dort entfernt hätte — genau das
 *  steht beim Redesign an — hätte den Karten still den Hintergrund genommen, ohne dass ein Test
 *  oder der Compiler etwas gemerkt hätte.
 *
 *  Ein `Record` über den Union-Typ erzwingt ausserdem, dass eine neue Bedeutung hier auftaucht. */
const SEMANTIC_SURFACE: Record<NonNullable<CardProps["semantic"]>, string> = {
  lock:      "rounded-xl border border-[var(--color-lock-border)] bg-lock-bg",
  unlock:    "rounded-xl border border-[var(--color-unlock-border)] bg-unlock-bg",
  inspect:   "rounded-xl border border-[var(--color-inspect-border)] bg-inspect-bg",
  orgasm:    "rounded-xl border border-[var(--color-orgasm-border)] bg-orgasm-bg",
  request:   "rounded-xl border border-[var(--color-request-border)] bg-request-bg",
  sperrzeit: "rounded-xl border border-[var(--color-sperrzeit-border)] bg-sperrzeit-bg",
  warn:      "rounded-xl border border-[var(--color-warn-border)] bg-warn-bg",
  ok:        "rounded-xl border border-[var(--color-ok-border)] bg-ok-bg",
};

export default function Card({
  variant = "default",
  semantic,
  padding = "default",
  className = "",
  children,
  ...rest
}: CardProps) {
  // Kein Rahmen, kein Radius mehr in der Basis: Abschnitte trennen sich durch Haarlinien und
  // Raum. Was einen Rahmen BRAUCHT, sagt es über `variant` — alles andere ist jetzt eine Fläche
  // im Fluss der Seite. Das macht nebenbei die 14 Aufrufstellen gegenstandslos, die bisher
  // `overflow-hidden` mitgeben mussten, nur weil der Radius Listen abschnitt.
  const baseClasses = [paddingClasses[padding]];

  switch (variant) {
    case "outlined":
      baseClasses.push("rounded-xl border border-border bg-transparent");
      break;
    case "semantic":
      if (semantic) baseClasses.push(SEMANTIC_SURFACE[semantic]);
      break;
    case "interactive":
      // Der Hover-Lift und der Schatten sind entfallen: "Leuchten gibt es nur an der runden
      // Taste." Was anklickbar ist, zeigt das über den Zeiger und eine Flächenaufhellung.
      baseClasses.push("rounded-xl bg-surface transition-colors hover:bg-surface-raised");
      break;
    default:
      baseClasses.push("bg-surface");
      break;
  }

  return (
    <div
      className={[...baseClasses, className].filter(Boolean).join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
}
