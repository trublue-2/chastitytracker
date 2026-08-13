import { OFFENSE_LISTS } from "@/lib/strafbuch";

/**
 * TEST-ONLY (liegt wie `prismaMock.ts` ausserhalb von `src/lib/`: Produktivcode braucht das nicht).
 *
 * Jede Vergehens-Liste eines Strafbuchs, leer — die Basis, auf die ein Test genau die Zeilen legt,
 * die er prüfen will.
 *
 * ABGELEITET aus {@link OFFENSE_LISTS}, nicht abgeschrieben. Wer die Namen von Hand aufzählt, hat
 * bei der nächsten Vergehensart eine Lücke, und die meldet sich nicht als Testfehler, sondern als
 * `undefined.filter` — oder, schlimmer, gar nicht, weil die Auswertung die fehlende Liste einfach
 * überspringt. Dieselbe Fehlerklasse wie der KERN-BUG vom 11.07.
 */
export function emptyOffenseLists(): Record<string, never[]> {
  return Object.fromEntries(Object.values(OFFENSE_LISTS).map((s) => [s.key, []]));
}
