import type { ServiceErrorCode } from "@/lib/serviceErrorCodes";

/**
 * Die zwei Hälften einer LISTE in einer JSON-Spalte — für die drei Fenster-Familien, die sich
 * dieselbe Ablage teilen: Reinigungs-Fenster, Wiege-Fenster, Tages-Ausnahmen der Kontrollen.
 *
 * **Geteilt wird die HÜLLE, nicht die Regel.** Was ein gültiges Fenster ausmacht, steht weiter in
 * seinem eigenen Modul und soll dort bleiben (siehe den Kopf von `weightWindows.ts`: die fachliche
 * Trennung von Reinigung und Wiegen ist Absicht). Was hier steht, ist das, was an allen dreien
 * gleich ist und gleich bleiben MUSS:
 *
 * - der tolerante LESE-Pfad: String → `JSON.parse` → Array → Form-Filter, Murks fällt still weg;
 * - die strenge SCHREIB-Hülle: kein Array / zu lang / welche Zeile stört.
 *
 * Warum das zusammengehört: die beiden Hälften sind ein PAAR. Der Lese-Pfad ist absichtlich
 * grosszügiger als der Schreib-Pfad (Bestand darf nicht daran scheitern, dass er einmal schief in
 * die Spalte kam), und genau deshalb muss ihre Beziehung an einer Stelle stehen. Lag sie dreimal
 * herum, änderte irgendwann jemand die Toleranz an einer Kopie — und die dazugehörige Schreib-Regel
 * bliebe, wo sie war.
 *
 * Importfrei bis auf den Fehler-Code-Typ, damit auch client-erreichbare Module es nehmen können.
 */

/** Der tolerante LESE-Pfad: JSON-String ODER Array herein, gefilterte Liste heraus. `shape` ist die
 *  Form-Regel EINER Zeile — `null` heisst „verwerfen". */
export function parseJsonList<T>(raw: unknown, shape: (item: unknown) => T | null): T[] {
  let arr: unknown = raw;
  if (typeof raw === "string") {
    try { arr = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(arr)) return [];
  const out: T[] = [];
  for (const item of arr) {
    const parsed = shape(item);
    if (parsed) out.push(parsed);
  }
  return out;
}

/** Was an einer Liste beim SCHREIBEN nicht stimmt — `null` heisst gültig. Der `index` sagt, WELCHE
 *  Zeile stört; ohne ihn bekommt eine Agentin, die fünf Fenster auf einmal setzt, ein blosses
 *  „Invalid time" und muss raten. Für „kein Array" und „zu lang" gibt es keinen — dort ist die Liste
 *  als GANZES das Problem. */
export interface ListProblem {
  code: ServiceErrorCode;
  index?: number;
}

/**
 * Die SCHREIB-Hülle: Array-Test, Längen-Grenze, dann jede Zeile durch `itemProblem`.
 *
 * `notAListCode` und `tooManyCode` kommen von aussen, weil die drei Familien verschiedene Sätze
 * dafür brauchen („Zu viele Reinigungsfenster" vs. „Höchstens sieben Tages-Ausnahmen").
 */
export function listProblem(
  raw: unknown,
  opts: { max: number; notAListCode: ServiceErrorCode; tooManyCode: ServiceErrorCode },
  itemProblem: (item: unknown) => ServiceErrorCode | null,
): ListProblem | null {
  if (!Array.isArray(raw)) return { code: opts.notAListCode };
  if (raw.length > opts.max) return { code: opts.tooManyCode };
  for (const [index, item] of raw.entries()) {
    const code = itemProblem(item);
    if (code) return { code, index };
  }
  return null;
}
