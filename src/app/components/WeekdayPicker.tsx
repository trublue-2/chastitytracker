"use client";

import { useLocale } from "next-intl";
import { toDateLocale } from "@/lib/utils";
import { buildWeekdayLabels } from "@/lib/statsBuilders";
import { WEEKDAY_KEYS, toggleWeekday, weekdayMaskHas } from "@/lib/weekdays";

/**
 * Sieben Häkchen für „an welchen Tagen gilt das" — als Reihe kleiner Schalter, nicht als Liste.
 *
 * **Bewusst ohne Bezug auf ein Feature** (Muster: `MeasurementChart`, `TimeInput`). Erster Nutzer
 * sind die Wiege-Fenster; dieselbe Auswahl brauchen die Auto-Kontrollen (Schlaf-Fenster, festes
 * Auslöse-Fenster) und die Reinigungsfenster, sobald jemand sie nachrüstet. Die Komponente kennt
 * eine Bitmaske und sonst nichts — was ein gesetzter Tag auslöst, entscheidet der Aufrufer.
 *
 * **Der letzte Tag lässt sich nicht abwählen, und zwar hier statt bei jedem Aufrufer.** Eine leere
 * Maske gilt an keinem Tag; eine Regel, die nie greift, sähe in der Liste trotzdem nach einer Regel
 * aus. Wer sie loswerden will, löscht die Zeile — die Schreib-Prüfung weist `0` ohnehin ab. Drei
 * Aufrufer hatten dieselbe Wache samt derselben Begründung selbst gebaut; der vierte hätte sie
 * vergessen, und das Ergebnis wäre eine gespeicherte Einstellung ohne Wirkung.
 *
 * Die Beschriftungen kommen aus {@link buildWeekdayLabels} — derselbe Generator, der die Jahres-
 * Heatmap beschriftet. Eigene Übersetzungs-Schlüssel wären eine zweite, von Hand gepflegte Quelle
 * für sieben Wörter, die jede Sprachumgebung schon kennt.
 */
export default function WeekdayPicker({ mask, disabled, onChange, ariaLabel }: {
  mask: number;
  disabled?: boolean;
  onChange: (next: number) => void;
  ariaLabel: string;
}) {
  const labels = buildWeekdayLabels(toDateLocale(useLocale()));

  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label={ariaLabel}>
      {WEEKDAY_KEYS.map((key, i) => {
        const isoDay = i + 1;
        const on = weekdayMaskHas(mask, isoDay);
        return (
          <button
            key={key}
            type="button"
            disabled={disabled}
            aria-pressed={on}
            onClick={() => {
              const next = toggleWeekday(mask, isoDay);
              if (next !== 0) onChange(next);
            }}
            className={[
              // min-h-12 wie Button/Checkbox/Toggle und der segmentierte `Tabs` — darunter liegt
              // die Trefferfläche unter dem Haus-Mindestmass.
              "w-11 min-h-12 rounded-lg border text-xs font-medium transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-focus-ring",
              "disabled:opacity-40 disabled:cursor-not-allowed",
              // Gefüllt = an, wie der ausgewählte Reiter im segmentierten `Tabs`. Kein eigenes
              // Farbpaar: die beiden Zustände sollen aussehen wie überall sonst im Haus.
              on
                ? "bg-foreground text-background border-foreground font-semibold"
                : "bg-surface-raised text-foreground-muted border-border hover:text-foreground",
            ].join(" ")}
          >
            {labels[i]}
          </button>
        );
      })}
    </div>
  );
}
