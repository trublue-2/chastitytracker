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
 * Grenzen (`min`/`step`) bleiben beim Aufrufer: 0.1 h für eine Kontrollfrist und 1 h für eine
 * Mindest-Tragedauer sind unterschiedliche fachliche Aussagen, keine Stil-Varianten.
 */
export default function HoursInput({
  value,
  onChange,
  min,
  step,
  label,
  unit,
}: {
  value: string;
  onChange: (value: string) => void;
  min: number;
  step: number;
  /** Optionale Beschriftung LINKS vom Feld (Kontroll-Frist nutzt sie, die anderen nicht). */
  label?: string;
  /** Übersetzte Einheit, z.B. „h". */
  unit: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {label && <label className="text-xs text-foreground-faint whitespace-nowrap">{label}</label>}
      <div className="w-24">
        <Input type="number" value={value} onChange={(e) => onChange(e.target.value)} min={min} step={step} />
      </div>
      <span className="text-xs text-foreground-faint">{unit}</span>
    </div>
  );
}
