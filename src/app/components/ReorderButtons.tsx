"use client";

import { ChevronUp, ChevronDown } from "lucide-react";

/**
 * Das Pfeil-Paar, mit dem eine Zeile in einer geordneten Liste nach oben oder unten wandert.
 *
 * Extrahiert beim zweiten Vorkommen (Öffnungsgründe, Aufgaben-Nachweise): zweimal derselbe
 * gestapelte Knopf-Block mit denselben Klassen, denselben Rand-Sperren und derselben Symbolgrösse.
 *
 * Eine DRITTE Stelle gibt es (`CategoriesClient`), sie ist bewusst nicht migriert: dort steht eine
 * andere Bedienform (die Ränder kommen als fehlende Handler statt aus Index und Anzahl) und eine
 * andere Optik (`size-5`, gerundeter Hover-Grund). Beides anzugleichen ist eine Design-Entscheidung,
 * keine Extraktion. Wer sie trifft, holt die Zeile hierher — dieses Bauteil ist der kanonische Stand.
 *
 * Die RAND-SPERREN rechnet dieses Bauteil selbst aus `index`/`count` — nicht der Aufrufer. Sie sind
 * keine Geschmacksfrage, sondern folgen aus der Position, und beide Aufrufer hatten sie einzeln
 * hingeschrieben. `disabled` bleibt zusätzlich, für den Grund, den nur der Aufrufer kennt (eine
 * laufende Speicherung).
 */
export default function ReorderButtons({
  index,
  count,
  onMove,
  upLabel,
  downLabel,
  disabled = false,
}: {
  index: number;
  count: number;
  /** Richtung als Schrittweite: `-1` nach oben, `+1` nach unten. */
  onMove: (dir: -1 | 1) => void;
  upLabel: string;
  downLabel: string;
  /** Sperrt BEIDE Pfeile, unabhängig von der Position. */
  disabled?: boolean;
}) {
  const cls = "p-0.5 text-foreground-faint hover:text-foreground disabled:opacity-30 transition";
  return (
    <div className="flex flex-col shrink-0">
      <button
        type="button"
        onClick={() => onMove(-1)}
        disabled={disabled || index === 0}
        aria-label={upLabel}
        className={cls}
      >
        <ChevronUp size={14} />
      </button>
      <button
        type="button"
        onClick={() => onMove(1)}
        disabled={disabled || index === count - 1}
        aria-label={downLabel}
        className={cls}
      >
        <ChevronDown size={14} />
      </button>
    </div>
  );
}
