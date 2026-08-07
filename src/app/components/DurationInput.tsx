"use client";

import { useTranslations } from "next-intl";
import FieldTabs from "./FieldTabs";
import HoursInput from "./HoursInput";
import { DURATION_UNITS, durationFromHours, durationToHours, type DurationUnit } from "@/lib/constants";

/**
 * Eine Dauer wahlweise in Stunden oder Minuten — Umschalter über dem Zahlenfeld.
 *
 * Eine Frist in Stunden zu denken ist gröber, als manche Sache verlangt: eine Kontrolle ist der
 * Griff zum Handy plus ein Foto, und eine Aufgabe kann eine Viertelstunde dauern. Beides stand
 * vorher vor derselben Wand, und die Kontroll-Form hatte den Umschalter deshalb schon von Hand —
 * diese Komponente ist genau jener Block, damit die zweite Stelle keine zweite Fassung wird.
 *
 * Der Wert bleibt beim Aufrufer, und zwar ROH in der gerade gewählten Einheit: nur er weiss, ob ein
 * leeres Feld erlaubt ist und was ein fehlender Wert bedeuten soll. Umgerechnet wird über
 * {@link durationToHours} — die Einheit ist Anzeige, gerechnet wird überall in Stunden.
 */
export default function DurationInput({
  label,
  ariaLabel,
  value,
  unit,
  onChange,
  required,
}: {
  /** Beschriftung der Gruppe, z.B. „Frist". Sie labelt den Umschalter und damit den ganzen Block. */
  label: string;
  /** Name des Zahlenfeldes für Assistenztechnik — die sichtbare Beschriftung steht am Umschalter und
   *  gehört dort zur Gruppe, nicht zum Feld. Ohne Angabe gilt `label`; nur wo die Gruppe anders heisst
   *  als das Feld („Haltefrist" über „Endet in") lohnt ein eigener Name. */
  ariaLabel?: string;
  /** Rohe Eingabe in der aktuellen Einheit. Leer ist ein gültiger Zwischenstand. */
  value: string;
  unit: DurationUnit;
  /** Beides zusammen, weil ein Einheiten-Wechsel den Wert mitzieht — zwei Rückrufe liessen den
   *  Aufrufer die halbe Umrechnung nachbauen. */
  onChange: (value: string, unit: DurationUnit) => void;
  required?: boolean;
}) {
  const t = useTranslations("common");

  /** Beim Wechsel zieht die DAUER mit, nicht die Zahl: aus 1 h wird 60 min, nicht 1 min. Ein leeres
   *  Feld bleibt leer — es gibt keine Dauer, die mitziehen könnte. */
  function switchUnit(next: DurationUnit) {
    if (next === unit) return;
    const hours = durationToHours(parseFloat(value), unit);
    onChange(Number.isNaN(hours) ? "" : String(durationFromHours(hours, next)), next);
  }

  return (
    <div className="flex flex-col gap-2">
      <FieldTabs
        label={label}
        value={unit}
        options={[
          { value: "h", label: t("unitHours") },
          { value: "min", label: t("unitMinutes") },
        ]}
        onChange={switchUnit}
        required={required}
      />
      <HoursInput
        value={value}
        onChange={(next) => onChange(next, unit)}
        ariaLabel={ariaLabel ?? label}
        min={DURATION_UNITS[unit].min}
        step={DURATION_UNITS[unit].step}
        unit={t(unit === "min" ? "minutesUnit" : "hoursUnit")}
        required={required}
      />
    </div>
  );
}
