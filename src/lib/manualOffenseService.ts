import { prisma } from "@/lib/prisma";
import { markLastAction } from "@/lib/appMeta";

/**
 * Von Hand notierte Vergehen (`ManualOffense`) — die einzige Vergehensart, die GESCHRIEBEN statt
 * abgeleitet wird.
 *
 * Bewusst ein eigenes, kleines Modul im Zuschnitt von `passwordAudit.ts`: es gibt genau zwei
 * Schreibvorgänge, keine Frist, keine Benachrichtigung und keinen Folgezustand — aber sie gehören
 * der Domäne, nicht dem MCP-Werkzeug. Die Admin-Oberfläche schreibt später durch dieselben zwei
 * Funktionen, statt eine zweite Schreibstelle auf dieselbe Tabelle zu eröffnen.
 *
 * Kein `ServiceResult`: beide Ausgänge sind ein Ja/Nein ohne Sonderfälle, und ein eigener
 * Fehler-Code-Satz (`serviceErrorCodes` plus beide `messages`-Dateien) wäre mehr Apparat als
 * Aussage. Wer eine übersetzte Absage braucht, formuliert sie an seinem Rand.
 */

export interface CreateManualOffenseParams {
  userId: string;
  /** Wann es passiert ist, NICHT wann notiert wurde — danach richtet sich die Einordnung im
   *  Strafbuch und welche Regel-Fassung gilt (siehe `offenseRules.ts`). */
  occurredAt: Date;
  title: string;
  description: string | null;
  /** Wer notiert hat: `"ai"` über den MCP, sonst der Username des Keyholders. */
  createdBy: string;
}

/** Legt ein notiertes Vergehen an und gibt seine id zurück — zugleich seine Strafbuch-`ref`. */
export async function createManualOffense(p: CreateManualOffenseParams): Promise<{ id: string }> {
  const created = await prisma.manualOffense.create({ data: p });
  markLastAction();
  return { id: created.id };
}

/**
 * Zieht ein notiertes Vergehen zurück: `withdrawnAt` setzen, nicht löschen — der Fehleintrag fällt
 * aus dem Strafbuch, bleibt aber nachlesbar. Ein bereits gefälltes Urteil (`StrafeRecord` auf diese
 * id) überlebt ohnehin, es ist die Aufzeichnung einer Entscheidung.
 *
 * Ein Aufruf statt Lesen-dann-Schreiben: der offene Zustand steht in der Where-Klausel, ein zweiter
 * Rückzug trifft damit null Zeilen (Vorbild: `withdrawTask`). `false` heisst, es gab nichts (mehr)
 * zurückzuziehen — fremder Sub, unbekannte id oder schon zurückgezogen.
 */
export async function withdrawManualOffense(id: string, userId: string): Promise<boolean> {
  const { count } = await prisma.manualOffense.updateMany({
    where: { id, userId, withdrawnAt: null },
    data: { withdrawnAt: new Date() },
  });
  if (count > 0) markLastAction();
  return count > 0;
}
