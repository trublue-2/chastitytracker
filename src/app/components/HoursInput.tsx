"use client";

import Input from "./Input";

/**
 * Schmales Zahlenfeld mit „h" daneben — die Stunden-Eingabe der Anforderungs-Formulare.
 *
 * Extrahiert, weil derselbe Block (fixe Breite `w-24`, Zahlenfeld, Einheit-Span) in
 * `KontrolleFields` und zweimal in `VerschlussAnforderungFields` stand; die Aufgaben-Form wäre die
 * vierte Kopie gewesen. Breite, Einheit und Feld-Ausrichtung liegen jetzt an einer Stelle — dieselbe
 * Bündelung wie bei {@link FieldTabs}, dem optischen Nachbarn im selben Formular.
 *
 * Grenzen (`min`/`step`) bleiben beim Aufrufer: 0.25 h für eine Kontrollfrist und 1 h für eine
 * Mindest-Tragedauer sind unterschiedliche fachliche Aussagen, keine Stil-Varianten.
 */
export default function HoursInput({
  value,
  onChange,
  min,
  step,
  ariaLabel,
  unit,
}: {
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
  return (
    <div className="flex items-center gap-2">
      <div className="w-24">
        <Input type="number" aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)} min={min} step={step} />
      </div>
      <span className="text-xs text-foreground-faint">{unit}</span>
    </div>
  );
}
