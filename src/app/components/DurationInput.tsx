"use client";

import { useTranslations } from "next-intl";
import Button from "./Button";
import FieldTabs from "./FieldTabs";
import HoursInput from "./HoursInput";
import { DURATION_QUICK_HOURS, DURATION_UNITS, durationFromHours, durationToHours, type DurationUnit } from "@/lib/constants";

/**
 * Eine Dauer wahlweise in Stunden oder Minuten — Umschalter über dem Zahlenfeld, Schnellwahl darunter.
 *
 * Eine Frist in Stunden zu denken ist gröber, als manche Sache verlangt: eine Kontrolle ist der
 * Griff zum Handy plus ein Foto, und eine Aufgabe kann eine Viertelstunde dauern. Beides stand
 * vorher vor derselben Wand, und die Kontroll-Form hatte den Umschalter deshalb schon von Hand —
 * diese Komponente ist genau jener Block, damit die zweite Stelle keine zweite Fassung wird.
 *
 * Der Wert bleibt beim Aufrufer, und zwar ROH in der gerade gewählten Einheit: nur er weiss, ob ein
 * leeres Feld erlaubt ist und was ein fehlender Wert bedeuten soll. Umgerechnet wird über
 * {@link durationToHours} — die Einheit ist Anzeige, gerechnet wird überall in Stunden.
 *
 * Die Schnellwahl gehört zum Bauteil und ist nicht abschaltbar: sie stand vorher nur an der
 * Aufgaben-Frist, und eine Zwei-Tap-Bedienung, die es je nach Formular gibt oder nicht, ist genau
 * die halbfertige Vereinheitlichung, die diese Datei vermeiden soll. Wählbar ist nur ihre SKALA
 * ({@link DURATION_QUICK_HOURS}) — sie hängt an der Grössenordnung des Feldes, nicht an der
 * Eingabe-Art. Die Knöpfe sind eine Empfehlung, keine Schranke: was fachlich gilt, entscheidet der
 * Server, und getippt werden darf ohnehin jeder Wert auf dem Raster.
 */
export default function DurationInput({
  label,
  ariaLabel,
  value,
  unit,
  onChange,
  quick = DURATION_QUICK_HOURS.short,
  required,
}: {
  /** Beschriftung der Gruppe, z.B. „Frist". Sie labelt den Umschalter und damit den ganzen Block.
   *  Weglassen, wo dieser Block unter einem Umschalter der ANTWORT-ART sitzt: dessen gewählter
   *  Reiter heisst dann schon „Dauer", und eine Beschriftung „Dauer" darunter sagt dasselbe Wort
   *  ein zweites Mal. Ohne `label` ist `ariaLabel` der Name des ganzen Blocks. */
  label?: string;
  /** Name für Assistenztechnik — am Zahlenfeld, und ohne `label` auch am Umschalter. Mit `label`
   *  nur nötig, wo die Gruppe anders heisst als das Feld („Haltefrist" über „Endet in"). */
  ariaLabel?: string;
  /** Rohe Eingabe in der aktuellen Einheit. Leer ist ein gültiger Zwischenstand. */
  value: string;
  unit: DurationUnit;
  /** Beides zusammen, weil ein Einheiten-Wechsel den Wert mitzieht — zwei Rückrufe liessen den
   *  Aufrufer die halbe Umrechnung nachbauen. */
  onChange: (value: string, unit: DurationUnit) => void;
  /** Welche Stufen die Schnellwahl anbietet — eine der Skalen aus {@link DURATION_QUICK_HOURS}. */
  quick?: readonly number[];
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
        ariaLabel={ariaLabel}
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
      {/* Die Knöpfe setzen die Dauer in der GERADE gewählten Einheit — auf „Minuten" gestellt trägt
          „1 h" also 60 ein, nicht 1. Beschriftet wird nach der Stufe, nicht nach der Einheit:
          „0.25 h" ist keine Zeitangabe, die jemand denkt. */}
      <div className="flex flex-wrap gap-2">
        {quick.map((h) => (
          <Button
            key={h}
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onChange(String(durationFromHours(h, unit)), unit)}
          >
            {h < 1 ? t("quickMinutes", { minutes: durationFromHours(h, "min") }) : t("quickHours", { hours: h })}
          </Button>
        ))}
      </div>
    </div>
  );
}
