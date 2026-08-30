/**
 * **Der schwebende Verschluss — eine Regel, zwei Formen.**
 *
 * Bei einem Träger mit Riegel-Schalter (`User.lockRequiresBolt`) ist ein VERSCHLUSS-Eintrag erst der
 * AUFRUF, die Box zu schliessen. Er steht sofort in der Tabelle, gilt aber nicht: erst die Meldung
 * „Riegel zu" setzt `boltConfirmedAt` und vollzieht ihn (`lockCommit.ts`, docs/riegel-konzept.md).
 *
 * Solange er schwebt, muss er für JEDE Ableitung unsichtbar sein — Verschluss-Zustand, Farbwelt,
 * Sessions, Statistik, Kalender, Trainingsziele, Strafbuch, Kontroll-Ziel, MCP. Das gelingt nur,
 * weil der ganze Bestand durch zwei Trichter läuft: {@link getLatestKgEntry} (Abfrage) und
 * {@link filterAndSortPairEntries} (Speicher). Dieses Modul hält die Regel für beide an EINER
 * Stelle — als Prisma-Filter und als Prädikat.
 *
 * **Importfrei** (per Test abgesichert): Client-Komponenten und server-only Code teilen es sich.
 */

/** Was eine Zeile mitbringen muss, damit die Frage überhaupt beantwortbar ist. */
export type BoltGatedRow = { type: string; boltConfirmedAt: Date | null };

/**
 * Ein Verschluss, dessen Riegel noch aussteht.
 *
 * Bewusst `=== null` und nicht `== null`: fehlt das Feld im `select` einer Abfrage, ist es
 * `undefined` — und dann fällt die Zeile auf das Bestandsverhalten zurück (sie gilt), statt dass
 * still ALLE Verschlüsse verschwinden. Der Typ verlangt das Feld ohnehin; das hier ist die
 * Absicherung für den Fall, dass jemand ihn umgeht.
 */
export function isPendingLock(e: BoltGatedRow): boolean {
  return e.type === "VERSCHLUSS" && e.boltConfirmedAt === null;
}

/** Das Gegenstück — die Zeilen, aus denen der Zustand entsteht. */
export function isEffectiveEntry(e: BoltGatedRow): boolean {
  return !isPendingLock(e);
}

/**
 * Der gemeldete Riegel-Zeitpunkt, so wie er gelten darf: geklemmt auf `[Aufruf, jetzt]`.
 *
 * Die Box stellt ihre eigene Uhr, und eine falsch gestellte darf weder in die Zukunft datieren noch
 * hinter den Aufruf zurückreichen — sonst rettete sie eine verpasste Frist oder erzeugte eine, die
 * es nie gab. Als eigene Funktion, weil sie die einzige Rechnung im Vollzug ist und für sich prüfbar
 * sein soll.
 */
export function clampBoltTime(reported: Date, calledAt: Date, now: Date): Date {
  return new Date(Math.min(Math.max(reported.getTime(), calledAt.getTime()), now.getTime()));
}

/**
 * Der jüngste WIRKSAME KG-Eintrag aus einer nach `startTime` ABSTEIGEND sortierten Liste — der
 * Speicher-Zwilling von `getLatestKgEntry`.
 *
 * Er existiert, weil `filterAndSortPairEntries` nur die PAARUNG trichtert, nicht die Frage „was ist
 * der jüngste Eintrag". Die stand danach dreimal wortgleich im Baum (Dashboard, MCP-Lock-Zustand,
 * Statistik-Seite) — und die dritte hatte die Regel gar nicht erst bekommen: sie zeigte „Aktive
 * Session — verschlossen seit …", während das Dashboard daneben den offenen Zustand zeigte.
 */
export function latestEffectiveKgEntry<E extends BoltGatedRow>(entries: E[]): E | null {
  return entries.find((e) => (e.type === "VERSCHLUSS" || e.type === "OEFFNEN") && isEffectiveEntry(e)) ?? null;
}

/**
 * Die Riegel-Spalte eines NEU angelegten Eintrags — die Schreib-Seite derselben Regel.
 *
 * **Jeder Erzeuger eines VERSCHLUSS muss hier durch.** Die Spalte ist nullbar ohne Vorgabe, ein
 * Erzeuger, der sie vergisst, legt also einen dauerhaft schwebenden Verschluss an — unsichtbar für
 * jede Ableitung, auf einer Instanz ganz ohne Box. Genau das war beim Keyholder-Pfad und beim
 * Demo-Seeder der Fall, solange die Regel nur im Formular-Pfad stand.
 *
 * `awaitsBolt` entscheidet allein der Sub-Pfad (`lockAwaitsBolt`); überall sonst gilt der Eintrag
 * sofort.
 */
export function boltFieldsFor(type: string, startTime: Date, awaitsBolt = false): { boltConfirmedAt: Date | null } {
  if (type !== "VERSCHLUSS") return { boltConfirmedAt: null };
  return { boltConfirmedAt: awaitsBolt ? null : startTime };
}

/**
 * Prisma-Filter für Abfragen, die AUSSCHLIESSLICH Verschlüsse lesen (`type: "VERSCHLUSS"`).
 * Als Feld-Fragment einzusetzen: `where: { userId, type: "VERSCHLUSS", ...CONFIRMED_LOCK_FILTER }`.
 */
export const CONFIRMED_LOCK_FILTER = { boltConfirmedAt: { not: null } };

/**
 * Der wartende Aufruf — die POSITIVE Fassung, und die einzige, die an sechs Stellen gebraucht wird
 * (Guard, Vollzug, Reparaturweg, drei Lese-Sichten). Sie fehlte hier zuerst, und prompt stand sie
 * sechsmal von Hand im Baum.
 */
export const PENDING_LOCK_FILTER = { type: "VERSCHLUSS", boltConfirmedAt: null };

/**
 * Where-Bedingung für GEMISCHTE Abfragen (VERSCHLUSS neben anderen Typen): der übergebene Rest
 * UND „nicht schwebend".
 *
 * Als Funktion und nicht als Objekt zum Spreaden: die Bedingung trägt ein `OR`, und in einer
 * Abfrage, die selbst eines hat, überschriebe eines das andere — lautlos, ohne Fehler, mit allen
 * schwebenden Verschlüssen zurück in der Auswertung. Dieselbe Haltung wie beim Pflichtfeld in
 * `filterAndSortPairEntries`: den Fehler unmöglich machen, statt vor ihm zu warnen.
 */
export function effectiveEntryWhere<T extends object>(rest: T) {
  return { AND: [rest, { OR: [{ type: { not: "VERSCHLUSS" } }, { boltConfirmedAt: { not: null } }] }] };
}
