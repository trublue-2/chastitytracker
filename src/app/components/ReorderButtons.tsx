"use client";

import { ChevronUp, ChevronDown } from "lucide-react";
import { busyDimCls, iconButtonCls } from "@/app/components/inputStyles";

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
 *
 * **Die RAND-Sperre ist `aria-disabled` mit der Schranke im Handler, die Speicher-Sperre echtes
 * `disabled`** — Begründung bei `busyDimCls`. Kurz: die Rand-Sperre entsteht aus der eigenen
 * Betätigung, die Speicher-Sperre nicht.
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
  // `iconButtonCls` bringt das 24-px-Minimum aus WCAG 2.5.8 mit; `p-0.5` auf einem 14-px-Zeichen
  // ergab 18 px und lag darunter.
  // EIN Dämpfungswert für „nicht verfügbar": `busyDimCls` deckt beide Fälle. Zwei verschieden
  // starke Werte nebeneinander (Rand vs. Speicherung) entschieden bei gleichzeitigem Zutreffen per
  // Stylesheet-Reihenfolge, welcher gewinnt — das ist keine Wahl, das ist ein Würfel.
  const cls = `${iconButtonCls} ${busyDimCls} text-foreground-faint hover:text-foreground disabled:opacity-50 transition`;
  const atStart = index === 0;
  const atEnd = index === count - 1;
  return (
    <div className="flex flex-col shrink-0">
      <button
        type="button"
        onClick={() => { if (!atStart) onMove(-1); }}
        disabled={disabled}
        aria-disabled={disabled || atStart}
        aria-label={upLabel}
        className={cls}
      >
        <ChevronUp size={14} />
      </button>
      <button
        type="button"
        onClick={() => { if (!atEnd) onMove(1); }}
        disabled={disabled}
        aria-disabled={disabled || atEnd}
        aria-label={downLabel}
        className={cls}
      >
        <ChevronDown size={14} />
      </button>
    </div>
  );
}
