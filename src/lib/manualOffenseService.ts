import { prisma } from "@/lib/prisma";
import { markLastAction } from "@/lib/appMeta";
import { serviceFail, type ServiceResult } from "@/lib/serviceResult";
import { MANUAL_OFFENSE_TITLE_MAX_LENGTH, MANUAL_OFFENSE_DESCRIPTION_MAX_LENGTH } from "@/lib/constants";

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

/**
 * Prüft die Roh-Eingabe eines Formulars/einer Route und formt sie zu {@link CreateManualOffenseParams}.
 *
 * Getrennt vom Schreiben, weil die beiden Aufrufer verschieden absagen: der MCP wirft englische
 * Sätze für den Agenten (`mcpRecordOffense`), der Browser braucht einen stabilen Fehler-CODE, den
 * `useApiError()` übersetzt. Das ist genau die Trennung, die der Modul-Kopf meint („Wer eine
 * übersetzte Absage braucht, formuliert sie an seinem Rand") — die REGELN stehen trotzdem hier,
 * nicht in der Route.
 *
 * `typeof`-Prüfungen statt blossem `?.trim()`: die Route reicht rohes JSON durch, und ein
 * `{"title": 5}` würfe sonst — aus einer Falscheingabe würde ein 500 statt eines 400.
 */
export function validateManualOffenseInput(input: {
  userId: unknown;
  occurredAt: unknown;
  title: unknown;
  description?: unknown;
  createdBy: string;
}): ServiceResult<CreateManualOffenseParams> {
  if (typeof input.userId !== "string" || !input.userId) return serviceFail(400, "USER_ID_REQUIRED");

  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title) return serviceFail(400, "OFFENSE_TITLE_REQUIRED");
  if (title.length > MANUAL_OFFENSE_TITLE_MAX_LENGTH) return serviceFail(400, "OFFENSE_TITLE_TOO_LONG");

  const description = typeof input.description === "string" ? input.description.trim() || null : null;
  if ((description?.length ?? 0) > MANUAL_OFFENSE_DESCRIPTION_MAX_LENGTH) {
    return serviceFail(400, "OFFENSE_DESCRIPTION_TOO_LONG");
  }

  const occurredAt = input.occurredAt instanceof Date ? input.occurredAt : new Date(String(input.occurredAt));
  if (Number.isNaN(occurredAt.getTime())) return serviceFail(400, "INVALID_DATETIME");
  // Dieselbe Schranke, die `mcpRecordOffense` zieht: ein Vergehen in der Zukunft wäre keine Notiz,
  // sondern eine Prognose — und das Strafbuch beurteilt jede Tat nach der Regel-Fassung IHRES
  // Zeitpunkts, die es für morgen noch nicht gibt. Strikt wie bei einem Eintrag
  // (`validateEntryPayload`), mit demselben `TIME_IN_FUTURE`: eine eigene Kulanz stünde im
  // Widerspruch zu dem Satz, den der Nutzer liest.
  if (occurredAt > new Date()) return serviceFail(400, "TIME_IN_FUTURE");

  return { ok: true, data: { userId: input.userId, occurredAt, title, description, createdBy: input.createdBy } };
}

/** Legt ein notiertes Vergehen an und gibt seine id zurück — zugleich seine Strafbuch-`ref`. */
export async function createManualOffense(p: CreateManualOffenseParams): Promise<{ id: string }> {
  const created = await prisma.manualOffense.create({ data: p });
  markLastAction();
  return { id: created.id };
}

/** Ausgang eines Rückzugs. `judged` ist kein Fehler des Aufrufers, sondern eine Reihenfolge:
 *  erst das Urteil zurücknehmen, dann die Notiz. */
export type WithdrawManualOffenseResult = "withdrawn" | "not_found" | "judged";

/**
 * Zieht ein notiertes Vergehen zurück: `withdrawnAt` setzen, nicht löschen — der Fehleintrag fällt
 * aus dem Strafbuch, bleibt aber nachlesbar.
 *
 * NICHT MEHR, sobald darüber geurteilt wurde. Ein `StrafeRecord` überlebt den Rückzug (er ist die
 * Aufzeichnung einer Entscheidung) — und genau deshalb darf sein Anlass nicht unter ihm
 * verschwinden: Eine bestrafte Notiz zurückzuziehen liesse die STRAFAUFGABE beim Sub stehen, während
 * ihr Vergehen aus dem Strafbuch fällt; verstreicht sie dann, entstünde daraus ein neues Vergehen
 * mit einer Kette, die ins Leere zeigt. Dieselbe Linie, die `applyOffenseRules` zieht: ein gefälltes
 * Urteil darf nicht durch einen Nebenweg entwertet werden. Der Weg zurück ist die Rücknahme des
 * Urteils („Rückgängig" im Strafbuch, `judge_offense` mit `reopen`), danach greift der Rückzug.
 *
 * Ein Schreib-Aufruf statt Lesen-dann-Schreiben: der offene Zustand steht in der Where-Klausel, ein
 * zweiter Rückzug trifft damit null Zeilen (Vorbild: `withdrawTask`). Die Urteils-Prüfung davor ist
 * bewusst keine Transaktion — im Rennen zwischen Urteil und Rückzug gewinnt sonst zufällig eines,
 * und das Ergebnis (zurückgezogen, Urteil bleibt) ist genau das, was der Rückzug ohnehin bedeutet.
 */
export async function withdrawManualOffense(id: string, userId: string): Promise<WithdrawManualOffenseResult> {
  const judgment = await prisma.strafeRecord.findUnique({ where: { refId: id }, select: { id: true } });
  if (judgment) return "judged";

  const { count } = await prisma.manualOffense.updateMany({
    where: { id, userId, withdrawnAt: null },
    data: { withdrawnAt: new Date() },
  });
  if (count === 0) return "not_found";
  markLastAction();
  return "withdrawn";
}
