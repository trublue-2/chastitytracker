"use client";

import { useTranslations } from "next-intl";
import DateTimePicker from "./DateTimePicker";
import DurationInput from "./DurationInput";
import FieldTabs from "./FieldTabs";
import { toDatetimeLocal, fromDatetimeLocal } from "@/lib/utils";
import { durationFromHours, durationToHours, type DurationUnit } from "@/lib/constants";

/**
 * EIN Zeitpunkt, zwei Eingabe-Wege: „Dauer" (Spanne ab einem Nullpunkt) oder „Zeitpunkt" (absolut).
 *
 * Der Block stand zuletzt an vier Stellen wörtlich gleich — Reiter mit denselben zwei Optionen,
 * darunter je nach Wahl {@link DurationInput} oder {@link DateTimePicker}, dazu eine handgeschriebene
 * Übernahme des Werts beim Umschalten. Jede Kopie hatte ihre eigene: eine nahm den Wert nur in einer
 * Richtung mit, eine gar nicht — wer die Uhrzeit feinjustiert hatte und zurückschaltete, verlor sie
 * wortlos.
 *
 * Der ANKER kommt vom Aufrufer und ist der Grund, warum das Bauteil den Zustand nicht selbst hält:
 * eine Dauer ist erst mit ihrem Nullpunkt ein Zeitpunkt, und der ist je Formular ein anderer (die
 * Einschliess-Frist zählt ab jetzt, das Orgasmus-Fenster ab seinem Start). Als Funktion, nicht als
 * Zahl: bei „ab jetzt" wandert er mit der Uhr.
 *
 * NICHT verwendet vom Aufgaben-Formular und vom Sperr-Ende: dort hat der Umschalter drei Wege bzw.
 * eine feste Einheit ohne Umschalter — das eine wäre ein Props-Sumpf, das andere eine bewusste
 * Abweichung (docs/ux-konsistenz.md §5).
 */
export default function DurationOrDatetimeField({
  label,
  ariaLabel,
  mode,
  onModeChange,
  value,
  unit,
  onDurationChange,
  quick,
  datetime,
  onDatetimeChange,
  datetimeMin,
  datetimeHint,
  anchorMs,
  tz,
  required,
  children,
}: {
  /** Sichtbare Beschriftung über den Reitern — sie benennt die FRAGE („Frist", „Fenster-Ende"). */
  label: string;
  /** Name der Dauer-Eingabe für Assistenztechnik. Ohne Angabe gilt `label`; der Umschalter darunter
   *  bleibt bewusst unbeschriftet, weil der Reiter darüber seinen Namen schon trägt. */
  ariaLabel?: string;
  mode: "duration" | "datetime";
  onModeChange: (mode: "duration" | "datetime") => void;
  value: string;
  unit: DurationUnit;
  onDurationChange: (value: string, unit: DurationUnit) => void;
  /** Schnellwahl-Skala der Dauer (siehe `DURATION_QUICK_HOURS`). */
  quick?: readonly number[];
  /** `datetime-local`-Wert in der Zone des Subs. */
  datetime: string;
  onDatetimeChange: (value: string) => void;
  datetimeMin?: string;
  datetimeHint?: string;
  /** Der Nullpunkt der Dauer, in Millisekunden — nur für die Übernahme beim Umschalten. */
  anchorMs: () => number;
  tz: string;
  required?: boolean;
  /** Platz für die Klartext-Vorschau unter beiden Zweigen. */
  children?: React.ReactNode;
}) {
  const tc = useTranslations("common");

  /**
   * Beim Umschalten zieht der WERT mit, in beide Richtungen: wer „24 h" eingestellt hat, findet im
   * Wähler den Zeitpunkt, den das ergibt — und umgekehrt. Sonst beantwortet der zweite Reiter eine
   * andere Frage als der erste, obwohl beide denselben Zeitpunkt meinen.
   *
   * Ein unlesbarer Zwischenstand wird NICHT übertragen: dann bleibt das Zielfeld, wie es war, statt
   * auf „Invalid Date" oder eine geratene Zahl zu fallen.
   */
  function switchMode(next: "duration" | "datetime") {
    if (next === mode) return;
    const anchor = anchorMs();
    if (next === "datetime") {
      const hours = durationToHours(parseFloat(value), unit);
      if (!Number.isNaN(hours)) onDatetimeChange(toDatetimeLocal(new Date(anchor + hours * 3600_000), tz));
    } else {
      const at = fromDatetimeLocal(datetime, tz);
      if (!Number.isNaN(at.getTime())) {
        onDurationChange(String(durationFromHours((at.getTime() - anchor) / 3600_000, unit)), unit);
      }
    }
    onModeChange(next);
  }

  return (
    <div className="flex flex-col gap-3">
      <FieldTabs
        label={label}
        value={mode}
        onChange={switchMode}
        required={required}
        options={[
          { value: "duration", label: tc("duration") },
          { value: "datetime", label: tc("pointInTime") },
        ]}
      />
      {mode === "duration" ? (
        <DurationInput
          ariaLabel={ariaLabel ?? label}
          value={value}
          unit={unit}
          onChange={onDurationChange}
          quick={quick}
          required={required}
        />
      ) : (
        <DateTimePicker
          value={datetime}
          onChange={(e) => onDatetimeChange(e.target.value)}
          min={datetimeMin}
          hint={datetimeHint}
          required={required}
        />
      )}
      {children}
    </div>
  );
}
