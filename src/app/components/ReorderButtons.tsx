"use client";

import { ChevronUp, ChevronDown, ChevronsUp, ChevronsDown } from "lucide-react";
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
 *
 * **Die Sprünge (`onJump`) sind für LANGE Listen und deshalb optional.** Gemessen an der
 * Block-Anordnung: von Platz 15 auf Platz 1 sind es 14 Antipper, und der Pfeil wandert bei jedem um
 * eine Zeilenhöhe nach oben — man kann nicht zweimal auf dieselbe Stelle tippen, und ab der Mitte
 * scrollt die Liste unter der Hand weg (#72). Bei drei Öffnungsgründen wäre dasselbe Paar nur
 * zusätzliches Gedränge, deshalb bekommt es nicht jede Liste.
 *
 * Sie stehen NEBEN den Einzelschritten, nicht darunter: die Zeilenhöhe hängt an dieser Spalte
 * (2 × 24 px, WCAG 2.5.8), vier gestapelte Knöpfe machten aus 56 px deren 104. Und die
 * Einzelschritte bleiben rechts aussen, wo sie bisher standen.
 */
export default function ReorderButtons({
  index,
  count,
  onMove,
  onJump,
  upLabel,
  downLabel,
  jumpStartLabel,
  jumpEndLabel,
  disabled = false,
}: {
  index: number;
  count: number;
  /** Richtung als Schrittweite: `-1` nach oben, `+1` nach unten. */
  onMove: (dir: -1 | 1) => void;
  /** An den Anfang / ans Ende. Weggelassen = kein zweites Pfeil-Paar (kurze Listen). */
  onJump?: (edge: "start" | "end") => void;
  upLabel: string;
  downLabel: string;
  /** Pflicht, sobald `onJump` gesetzt ist — ein Knopf ohne Namen ist für Assistenztechnik stumm. */
  jumpStartLabel?: string;
  jumpEndLabel?: string;
  /** Sperrt ALLE Pfeile, unabhängig von der Position. */
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

  /** EIN Pfeil — die vier unterscheiden sich nur in Zeichen, Name und Rand-Prädikat. Ausgeschrieben
   *  stand die `aria-disabled`-Regel viermal da, und eine Kopie kann sie verlieren, ohne dass es
   *  auffällt. */
  const arrow = (
    Icon: typeof ChevronUp,
    label: string | undefined,
    atEdge: boolean,
    act: () => void,
  ) => (
    <button
      type="button"
      onClick={() => { if (!atEdge) act(); }}
      disabled={disabled}
      aria-disabled={disabled || atEdge}
      aria-label={label}
      className={cls}
    >
      <Icon size={14} />
    </button>
  );

  return (
    <div className="flex shrink-0">
      {onJump && (
        <div className="flex flex-col">
          {arrow(ChevronsUp, jumpStartLabel, atStart, () => onJump("start"))}
          {arrow(ChevronsDown, jumpEndLabel, atEnd, () => onJump("end"))}
        </div>
      )}
      <div className="flex flex-col">
        {arrow(ChevronUp, upLabel, atStart, () => onMove(-1))}
        {arrow(ChevronDown, downLabel, atEnd, () => onMove(1))}
      </div>
    </div>
  );
}
