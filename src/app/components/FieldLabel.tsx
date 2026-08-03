"use client";

/**
 * Die kleine Beschriftung über einem Formular-Abschnitt — „Frist", „Zeit zum Anlegen", „Anzeige".
 *
 * Bewusst NICHT die Beschriftung von {@link Input}/{@link DateTimePicker}: die ist versal, fett und
 * gehört zu EINEM Feld. Diese hier benennt eine Gruppe (ein Umschalter, ein Feld samt Einheit, zwei
 * Alternativen) und ist deshalb leiser.
 *
 * Extrahiert, weil dasselbe `<span className="text-xs text-foreground-faint">` in `FieldTabs` und
 * `HoursInput` stand und der Frist-Block der Aufgaben-Form die dritte Kopie gewesen wäre.
 *
 * `htmlFor` macht daraus ein echtes `<label>` — dort, wo die Gruppe genau ein Eingabefeld enthält.
 * Ohne bleibt es ein `<span>` mit `id`, den der Aufrufer per `aria-labelledby` an die Gruppe hängt:
 * ein `<label>` ohne Ziel ist für Assistenztechnik wertlos.
 */
export default function FieldLabel({
  id,
  htmlFor,
  children,
}: {
  id?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  const className = "text-xs text-foreground-faint";
  return htmlFor
    ? <label id={id} htmlFor={htmlFor} className={className}>{children}</label>
    : <span id={id} className={className}>{children}</span>;
}
