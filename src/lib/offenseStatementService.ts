import { prisma } from "@/lib/prisma";
import { announcedOffenseType } from "@/lib/offenseAnnounce";
import { OFFENSE_STATEMENT_MAX_LENGTH } from "@/lib/constants";
import { serviceFail, type ServiceResult } from "@/lib/serviceResult";
import type { ServiceErrorCode } from "@/lib/serviceErrorCodes";
import type { OffenseCanonicalType } from "@/lib/offenseTypes";

/**
 * Die Stellungnahme des Trägers zu einem festgestellten Vergehen.
 *
 * Der Schnitt ist derselbe wie bei `taskProofService`: die SCHRANKE ist rein und schreibfrei
 * ({@link statementBlockedReason}), das Schreiben liegt daneben. Die Formularseite fragt damit
 * dieselbe Bedingung, die der Service durchsetzt — eine zweite Bedingungskette daneben liefe
 * irgendwann auseinander und verspräche ein Feld, das der Server ablehnt.
 */

/** Was der Service über den Zustand eines Vergehens wissen muss, um die Schranke zu ziehen. */
export interface StatementGate {
  /** Ist die Stellungnahme bei diesem Träger überhaupt freigeschaltet? */
  allowed: boolean;
  /**
   * Wer über dieses Vergehen geurteilt hat — `null`, solange niemand geurteilt hat.
   *
   * `"system"` zählt ausdrücklich NICHT als Urteil: die automatische Ahndung des falschen Geräts
   * (`punishWrongDevice`) schreibt sofort einen `StrafeRecord` mit `judgedBy: "system"` und
   * gesetztem `erledigtAt`. Eine Schranke auf „es gibt ein Urteil" hätte die Stellungnahme
   * ausgerechnet dort von der ersten Sekunde an gesperrt — beim einzigen Vergehen, das ohne
   * menschlichen Urteilsschritt geahndet wird und über das der Träger nur eine Meldung bekommt.
   * Dort ist der Widerspruch am nötigsten, und die Keyholderin kann das Urteil zurücknehmen.
   */
  judgedBy: string | null;
}

/**
 * Warum diese Stellungnahme gerade nicht geschrieben werden darf — `null` heisst „erlaubt".
 *
 * Rein und ohne Datenbank, damit Seite und Service dieselbe Antwort bekommen.
 */
export function statementBlockedReason(gate: StatementGate): ServiceErrorCode | null {
  if (!gate.allowed) return "STATEMENT_NOT_ALLOWED";
  if (gate.judgedBy !== null && gate.judgedBy !== "system") return "STATEMENT_JUDGED";
  return null;
}

/** Der Text, wie er in die Datenbank geht — `null` heisst „löschen" (leeren nimmt sie zurück). */
export function normalizeStatementText(raw: string): string | null {
  const text = raw.trim();
  return text.length === 0 ? null : text;
}

/** Liest den Zustand eines Vergehens, den {@link statementBlockedReason} braucht. */
export async function loadStatementGate(userId: string, refId: string): Promise<StatementGate | null> {
  return (await loadStatementGates(userId, [refId], { strict: true })).get(refId) ?? null;
}

export interface WriteStatementParams {
  userId: string;
  refId: string;
  text: string;
}

export interface WriteStatementResult {
  /** `true`, wenn die Zeile mit diesem Aufruf ENTSTANDEN ist — nur dann wird gemeldet. Eine
   *  Änderung läuft still, sonst füllte eine Tippkorrektur den Posteingang der Keyholderin. */
  created: boolean;
  /** `true`, wenn der Träger seine Stellungnahme zurückgenommen hat (leerer Text). */
  removed: boolean;
  /** Die Art, unter der geschrieben wurde — aus der Meldung gelesen, nicht vom Aufrufer gesetzt.
   *  Die Route benennt damit das Vergehen in der Nachricht an die Keyholderin. */
  offenseType: OffenseCanonicalType;
}

/**
 * Schreibt, ändert oder entfernt die Stellungnahme — die Schranke von oben wird HIER durchgesetzt
 * und nicht nur in der Route: der Service ist die verbindliche Seite.
 */
export async function writeOffenseStatement(p: WriteStatementParams): Promise<ServiceResult<WriteStatementResult>> {
  if (p.text.length > OFFENSE_STATEMENT_MAX_LENGTH) return serviceFail(400, "STATEMENT_TOO_LONG");

  // Die drei Lesevorgänge hängen nicht voneinander ab — nur ihre AUSWERTUNG hat eine Reihenfolge,
  // und die steht unverändert darunter. Nacheinander abgewartet kostete ein Textfeld vier Runden
  // zur Datenbank, bevor überhaupt geschrieben wurde.
  const [offenseType, gate, existing] = await Promise.all([
    announcedOffenseType(p.userId, p.refId),
    loadStatementGate(p.userId, p.refId),
    prisma.offenseStatement.findUnique({ where: { refId: p.refId }, select: { id: true, userId: true } }),
  ]);

  // Besitz VOR allem anderen: eine fremde `refId` darf nicht einmal erfahren, ob dort schon ein
  // Urteil steht. 404 und nicht 403 — die Antwort soll nicht verraten, dass es das Vergehen gibt.
  if (!offenseType) return serviceFail(404, "NOT_FOUND");
  if (!gate) return serviceFail(404, "USER_NOT_FOUND");
  const blocked = statementBlockedReason(gate);
  // 409 und nicht 403: der Zustand hat sich geändert, während er schrieb — das ist ein Konflikt und
  // keine fehlende Berechtigung. Die Oberfläche unterscheidet daran, ob sie seinen Text stehen lässt.
  if (blocked) return serviceFail(blocked === "STATEMENT_JUDGED" ? 409 : 403, blocked);

  // Fremde Zeile unter derselben ref: nicht anfassen. Kann nur durch einen Datenfehler entstehen —
  // still überschreiben wäre die schlechtere Antwort darauf.
  if (existing && existing.userId !== p.userId) return serviceFail(403, "FORBIDDEN");

  const text = normalizeStatementText(p.text);
  if (text === null) {
    if (!existing) return serviceFail(400, "STATEMENT_EMPTY");
    await prisma.offenseStatement.delete({ where: { refId: p.refId } });
    return { ok: true, data: { created: false, removed: true, offenseType } };
  }

  await prisma.offenseStatement.upsert({
    where: { refId: p.refId },
    create: { userId: p.userId, refId: p.refId, offenseType, text },
    update: { text },
  });
  return { ok: true, data: { created: !existing, removed: false, offenseType } };
}

/** Eine geladene Stellungnahme — `editedAt` ist die einzige Ableitung darauf und steht deshalb
 *  schon hier, nicht in jeder Sicht erneut. */
export interface LoadedStatement {
  text: string;
  createdAt: Date;
  /** Gesetzt, wenn der Träger den Text nach dem ersten Absenden nachgebessert hat — sonst `null`.
   *  `updatedAt` allein taugt dafür nicht: es steht bei jeder Zeile, auch der unberührten. */
  editedAt: Date | null;
}

async function loadStatementMap(where: { refId: { in: string[] } } | { userId: string }) {
  const rows = await prisma.offenseStatement.findMany({
    where,
    select: { refId: true, text: true, createdAt: true, updatedAt: true },
  });
  return new Map<string, LoadedStatement>(
    rows.map(({ refId, text, createdAt, updatedAt }) => [
      refId,
      { text, createdAt, editedAt: updatedAt.getTime() !== createdAt.getTime() ? updatedAt : null },
    ]),
  );
}

/**
 * Die Stellungnahmen zu einer MENGE von Vergehen als Karte `refId → Zeile`.
 *
 * Über `refId: { in: … }` und nicht „alle dieses Trägers": die Anzeige fragt nach den Zeilen einer
 * Seite, und die Menge der geschriebenen Stellungnahmen wächst mit den Jahren, die gefragte nicht.
 * Ohne `userId` im Filter, weil `refId` global eindeutig ist — die Aufrufer schlagen nur nach, was
 * sie ohnehin anzeigen dürfen.
 */
export async function loadStatements(refIds: string[]) {
  if (refIds.length === 0) return new Map<string, LoadedStatement>();
  return loadStatementMap({ refId: { in: refIds } });
}

/**
 * ALLE Stellungnahmen eines Trägers — für das Strafbuch, das ohnehin sein ganzes Buch zeigt.
 *
 * Getrennt von {@link loadStatements}: dort fragt eine Seite des Posteingangs nach einer Handvoll
 * refIds, hier fragt eine Sicht nach allem, was dieser Träger je geschrieben hat. Ein gemeinsamer
 * Aufruf müsste erst die vollständige Liste der refIds zusammentragen, die diese Seite gar nicht
 * kennt — die Vergehen sind eine Ableitung, ihre refs entstehen im Client.
 */
export async function loadStatementsOfUser(userId: string) {
  return loadStatementMap({ userId });
}

/**
 * Die Schranke für MEHRERE Vergehen auf einmal — dieselbe Frage wie {@link loadStatementGate},
 * einmal statt je Zeile.
 *
 * Zwei Abfragen für eine ganze Seite: der Schalter des Trägers und die Urteile zu diesen refIds.
 */
export async function loadStatementGates(
  userId: string,
  refIds: string[],
  /** `strict`: gibt es den Träger gar nicht, bleibt die Karte LEER, statt „nicht freigeschaltet" zu
   *  behaupten. Der Schreibweg unterscheidet daran 404 von 403 — die Anzeige braucht das nicht, für
   *  sie ist beides „kein Feld". */
  opts: { strict?: boolean } = {},
): Promise<Map<string, StatementGate>> {
  const out = new Map<string, StatementGate>();
  if (refIds.length === 0) return out;
  const [user, judgments] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { offenseStatementsAllowed: true } }),
    prisma.strafeRecord.findMany({ where: { userId, refId: { in: refIds } }, select: { refId: true, judgedBy: true } }),
  ]);
  if (!user && opts.strict) return out;
  const allowed = user?.offenseStatementsAllowed ?? false;
  // Die Urteile sind bereits auf `userId` gefiltert: `refId` ist global eindeutig, aber die Schranke
  // darf sich nicht an der Zeile eines FREMDEN Trägers festmachen.
  const judged = new Map(judgments.map((j) => [j.refId, j.judgedBy ?? "unknown"]));
  for (const refId of refIds) out.set(refId, { allowed, judgedBy: judged.get(refId) ?? null });
  return out;
}

/**
 * Der Schalter „darf sich äussern" — EIN Schreiber für Oberfläche und MCP.
 *
 * Vorbild `setLockRequiresBolt()` (`lockCommit.ts`): Route und `mcpSetOffenseRules` schrieben ihn
 * zuvor je selbst. Jede künftige Nebenwirkung (eine Meldung an den Träger, ein Audit-Eintrag) müsste
 * sonst zweimal nachgezogen werden — und die zweite Stelle findet niemand, weil der Schalter dort
 * nur eine Zeile unter fünfzehn anderen ist.
 *
 * BEWUSST ohne Regel-Historie: der Schalter sagt, ob der Träger sich zu KÜNFTIGEN Feststellungen
 * äussern darf. Was er geschrieben hat, bleibt stehen — Abschalten nimmt ihm das Feld, nicht seine
 * Worte.
 */
export async function setOffenseStatementsAllowed(userId: string, allowed: boolean): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { offenseStatementsAllowed: allowed } });
}
