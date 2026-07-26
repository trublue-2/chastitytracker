/**
 * Auswertung von Modell-ANTWORTEN — bewusst getrennt vom Provider-Modul (`@/lib/vision`).
 *
 * `@/lib/vision` ist die Transport-Grenze und wird in Tests komplett gemockt. Läge dieser Parser
 * dort, verschwände er mit jedem solchen Mock (und der Aufrufer liefe mit `undefined` in einen
 * Fehler, statt zu parsen — genau so gesehen in `detectDevice.test.ts`). Hier ist er eine reine
 * Funktion ohne Provider-Bezug: Tests mocken den Transport, das Parsen bleibt echt.
 */

/** Erstes JSON-Objekt aus einer Modellantwort parsen, sonst null. Jede Vision-Auswertung braucht
 *  das: Modelle rahmen ihr JSON gern in Fliesstext ein, und ein Parse-Fehler darf nie werfen —
 *  „nicht auswertbar" ist ein normales Ergebnis, kein Defekt. */
export function parseJsonObject<T>(text: string): T | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as T;
  } catch {
    return null;
  }
}
