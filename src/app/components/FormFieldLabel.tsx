import type { ReactNode } from "react";

/**
 * Die versale Beschriftung ÜBER einem Formular-Feld — dieselbe Anmutung wie das eingebaute Label von
 * {@link Input}/{@link Select}/{@link Textarea}, aber für Felder, die ihre Beschriftung selbst
 * setzen (`FormField`, `VorgabeForm`).
 *
 * Sie trägt dieselbe Klassenkette wie eine Block-Rubrik (`uppercase tracking-wider`) und wurde
 * deshalb von `pageMeasures.test.ts` als vermeintlicher `BlockHeading`-Nachbau erfasst (Issue #78).
 * Der Unterschied ist die BEDEUTUNG: ein `<label>` über einem Eingabefeld ist keine Überschrift und
 * hat in der Überschriften-Navigation nichts verloren — darum ein eigenes benanntes Bauteil statt
 * `BlockHeading`, und darum steht diese Datei (wie `BlockHeading`) auf der Ausnahmeliste des Tests.
 *
 * NICHT zu verwechseln mit {@link FieldLabel}: das ist die LEISE, nicht-versale Beschriftung einer
 * Feld-GRUPPE (Umschalter, Feld samt Einheit). Diese hier ist die versale eines EINZELNEN Feldes.
 * Bewusst `text-foreground-faint`: die Farbe, die die beiden Aufrufer schon trugen — die Labels von
 * `Input`/`Select`/`Textarea` stehen auf `text-foreground-muted` und laufen NICHT hierüber; deren
 * Angleich ist eine eigene Frage, nicht Teil dieses Aufräumens.
 *
 * `children` statt `label`-String, weil manche Beschriftung einen Pflicht-Stern o. Ä. mitträgt.
 * `className` für den Abstand nach unten (`mb-*`), den der Aufrufer je nach Feld selbst setzt.
 */
export default function FormFieldLabel({ htmlFor, className = "", children }: {
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className={`block text-xs font-semibold uppercase tracking-wider text-foreground-faint ${className}`}>
      {children}
    </label>
  );
}
