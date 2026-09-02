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

/**
 * Brach die Antwort am Token-Budget ab, statt zu Ende geschrieben zu werden?
 *
 * Steht hier und nicht am Aufrufer, weil es PROVIDER-Wissen ist: Anthropic nennt den Zustand
 * `max_tokens`, ein OpenAI-kompatibles lokales Modell `length` (`vision/local.ts` reicht dessen
 * `finish_reason` unverändert durch). Wer die beiden Namen an der Auswertungsstelle abschreibt,
 * schreibt sie beim nächsten Anbieter erneut ab — und vergisst einen.
 *
 * **Wozu die Unterscheidung.** Ein abgebrochenes „kein JSON gefunden" hat eine andere Ursache
 * (Budget zu klein) und eine andere Abhilfe (`maxTokens` erhöhen) als ein Modell, das schlicht
 * nichts lesen konnte. Ohne sie ist der Fall nur zu finden, indem man die Anfrage von Hand
 * nachstellt — genau das kostete #104 eine Fremdmessung. Die übrigen Vision-Aufrufe
 * (`detectSealDigits`, die Riegel-Lesung, `detectDevice`) protokollieren bislang ohne diese
 * Unterscheidung; sie können sie von hier übernehmen, wenn sie an denselben Punkt kommen.
 */
export function wasTruncated(stopReason: string | null | undefined): boolean {
  return stopReason === "max_tokens" || stopReason === "length";
}
