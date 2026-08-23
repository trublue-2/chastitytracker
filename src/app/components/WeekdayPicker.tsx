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
 * Ein Tag, den niemand angehakt hat, ist kein Sonderfall: die leere Maske gilt an keinem Tag. Wer
 * das will, löscht die Regel — die Schreib-Prüfung des Aufrufers weist `0` deshalb ab.
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
            onClick={() => onChange(toggleWeekday(mask, isoDay))}
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
