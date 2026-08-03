"use client";

import { useId } from "react";
import Input from "./Input";

/**
 * Schmales Zahlenfeld mit seiner Einheit daneben — die Zeit-Eingabe der Anforderungs-Formulare.
 *
 * Extrahiert, weil derselbe Block (fixe Breite `w-24`, Zahlenfeld, Einheit-Span) in
 * `KontrolleFields` und zweimal in `VerschlussAnforderungFields` stand; die Aufgaben-Form wäre die
 * vierte Kopie gewesen. Breite, Einheit und Feld-Ausrichtung liegen jetzt an einer Stelle — dieselbe
 * Bündelung wie bei {@link FieldTabs}, dem optischen Nachbarn im selben Formular.
 *
 * Die Einheit ist ein Parameter, der Name des Bauteils bloss sein häufigster Fall: die Kulanzfrist
 * der Aufgaben zählt in Minuten und benutzt dasselbe Feld.
 *
 * Grenzen (`min`/`step`) bleiben beim Aufrufer: 0.25 h für eine Kontrollfrist und 1 h für eine
 * Mindest-Tragedauer sind unterschiedliche fachliche Aussagen, keine Stil-Varianten.
 */
export default function HoursInput({
  label,
  value,
  onChange,
  min,
  step,
  ariaLabel,
  unit,
}: {
  /**
   * Sichtbare Beschriftung ÜBER der Zeile, im Stil der benachbarten {@link FieldTabs}. Wo sie steht,
   * ist `ariaLabel` überflüssig — die Beschriftung hängt per `htmlFor` am Feld. Ohne sie beschriftet
   * der Aufrufer das Feld anderweitig (die Kontroll-Frist über den Einheiten-Umschalter darüber).
   */
  label?: string;
  value: string;
  onChange: (value: string) => void;
  min: number;
  step: number;
  /**
   * Name des Feldes für Assistenztechnik. Nötig, wo die sichtbare Beschriftung NEBEN dem Feld steht
   * (die Kontroll-Frist beschriftet den Einheiten-Umschalter darüber) — ohne ihn liest sich das Feld
   * als namenloses Spinbutton vor. Kein sichtbares Label: das stünde dann doppelt da.
   */
  ariaLabel?: string;
  /** Übersetzte Einheit, z.B. „h". */
  unit: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      {label && <label htmlFor={id} className="text-xs text-foreground-faint">{label}</label>}
      <div className="flex items-center gap-2">
        <div className="w-24">
          <Input id={id} type="number" aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)} min={min} step={step} />
        </div>
        <span className="text-xs text-foreground-faint">{unit}</span>
      </div>
    </div>
  );
}
