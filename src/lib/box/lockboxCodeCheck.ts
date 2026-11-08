/**
 * Bildersafe: hat der Sub den Schlüsselbox-Code seit dem letzten Verschluss verstellt (Issue #115)?
 * Der REINE Teil — aus den Lesungen der beiden Code-Fotos ein Urteil. Laden und Lesen stehen in
 * `lockboxCodeCheckService.ts`.
 *
 * **Die Ziffern verlassen diesen Vergleich nicht.** Gespeichert und gemeldet wird nur das Urteil, nie
 * ein Code: weder in der Datenbank noch in Push oder Mail.
 *
 * **Warum doppelt gelesen wird.** Das Vision-Modell liest Zahlenschlösser unzuverlässig (gemessen an
 * Kontroll-Codes: lokal 2 von 8 richtig, #102). Eine einzelne Lesung ist deshalb kein Befund. „Sicher"
 * ist ein Foto erst, wenn ALLE Lesungen dieselbe Ziffernfolge ergeben — sonst ist das Ergebnis
 * `uncertain`, und die Keyholderin sieht selbst nach. Auch dann bleibt eine Grenze, die das Issue
 * selbst nennt: zwei gleich falsche Lesungen ergeben ein falsches „verschieden".
 */

/** Das Urteil eines Vergleichs. `first`: kein früheres Code-Foto zum Vergleichen. `different`/`same`:
 *  beide Fotos sicher gelesen. `uncertain`: mindestens ein Foto nicht sicher lesbar — der Mensch
 *  entscheidet. */
export const CODE_CHANGE_VERDICTS = ["first", "different", "same", "uncertain"] as const;
export type CodeChangeVerdict = (typeof CODE_CHANGE_VERDICTS)[number];

/** Was am Verschluss steht (`Entry.codeChangeCheck`): ein Urteil, oder `pending` (Prüfung läuft —
 *  beim Speichern gesetzt, wie `deviceCheck`) oder `error` (wollte prüfen, ging nicht). `null` heisst
 *  allein „nicht geprüft": kein Code-Foto, kein Vision-Provider oder Alt-Eintrag. */
export const CODE_CHANGE_STATES = [...CODE_CHANGE_VERDICTS, "pending", "error"] as const;
export type CodeChangeState = (typeof CODE_CHANGE_STATES)[number];

const isOneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === "string" && (list as readonly string[]).includes(v);

export const isCodeChangeVerdict = (v: unknown): v is CodeChangeVerdict => isOneOf(CODE_CHANGE_VERDICTS, v);
export const isCodeChangeState = (v: unknown): v is CodeChangeState => isOneOf(CODE_CHANGE_STATES, v);

/** Die Ziffernfolge, die ALLE Lesungen eines Fotos ergeben — oder null, wenn eine fehlt oder sie
 *  sich widersprechen. Eine leere Liste ist nie sicher. */
export function stableRead(reads: readonly (string | null)[]): string | null {
  if (reads.length === 0) return null;
  const first = reads[0];
  return first !== null && reads.every((r) => r === first) ? first : null;
}

/** Das Urteil aus den Lesungen des neuen und des vorigen Fotos. */
export function compareCodeReads(
  current: readonly (string | null)[],
  previous: readonly (string | null)[],
): Exclude<CodeChangeVerdict, "first"> {
  const a = stableRead(current);
  const b = stableRead(previous);
  if (a === null || b === null) return "uncertain";
  return a === b ? "same" : "different";
}

/** Soll die Keyholderin davon erfahren? Bei demselben Code und bei jedem unsicheren Vergleich — die
 *  Prüfung blockiert nie, also muss ein Mensch sehen, was sie nicht entscheiden konnte. */
export function codeChangeNeedsReview(result: CodeChangeState): boolean {
  return result === "same" || result === "uncertain";
}

/** Die Vergleichsansicht im Keyholder-Bereich — eine Quelle für Meldung, Posteingangs-Link und Seite. */
export function codeCheckPath(userId: string, entryId: string): string {
  return `/admin/users/${userId}/bildersafe/${entryId}`;
}
