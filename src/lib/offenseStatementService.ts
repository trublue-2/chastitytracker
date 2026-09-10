import { prisma } from "@/lib/prisma";
import { OFFENSE_REF_TYPE } from "@/lib/messageService";
import { OFFENSE_STATEMENT_MAX_LENGTH } from "@/lib/constants";
import { serviceFail, type ServiceResult } from "@/lib/serviceResult";
import type { ServiceErrorCode } from "@/lib/serviceErrorCodes";

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

/**
 * Gehört dieses Vergehen überhaupt DIESEM Träger?
 *
 * `refId` ist global eindeutig, und die Vergehen selbst sind eine Live-Ableitung — es gibt keine
 * Tabelle, in der „Vergehen X gehört Träger Y" stünde. Die Frage beantwortet deshalb die MELDUNG:
 * der Träger erfährt jedes Vergehen als Zeile in seinem Posteingang (`offenseAnnounce.ts`), und
 * genau von dort aus schreibt er. Was ihm nie gemeldet wurde, kann er auch nicht kommentieren.
 *
 * Ohne diese Prüfung könnte jeder Angemeldete unter der `refId` eines FREMDEN Vergehens schreiben:
 * `refId` ist der eindeutige Schlüssel der Tabelle, der Text erschiene im Posteingang des anderen
 * und in seinem `get_offenses` — und weil die Zeile dann besetzt ist, wäre er selbst dauerhaft
 * ausgesperrt (403). Ein Angriff, der keine Rechte braucht, nur eine fremde id.
 */
async function offenseBelongsToUser(userId: string, refId: string): Promise<boolean> {
  const seen = await prisma.message.findFirst({
    where: { subjectUserId: userId, audience: "sub", refEntityType: OFFENSE_REF_TYPE, refEntityId: refId },
    select: { id: true },
  });
  return seen !== null;
}

/** Liest den Zustand eines Vergehens, den {@link statementBlockedReason} braucht. */
export async function loadStatementGate(userId: string, refId: string): Promise<StatementGate | null> {
  const [user, judgment] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { offenseStatementsAllowed: true } }),
    prisma.strafeRecord.findUnique({ where: { refId }, select: { judgedBy: true, userId: true } }),
  ]);
  if (!user) return null;
  // Ein Urteil, das zu einem ANDEREN Träger gehört, gilt hier nicht: `refId` ist global eindeutig,
  // aber die Prüfung darf sich nicht an einer fremden Zeile festmachen.
  const judgedBy = judgment && judgment.userId === userId ? judgment.judgedBy ?? "unknown" : null;
  return { allowed: user.offenseStatementsAllowed, judgedBy };
}

export interface WriteStatementParams {
  userId: string;
  refId: string;
  /** Die Vergehens-Art, wie die aufrufende Ansicht sie kennt (`StoredOffenseType`). */
  offenseType: string;
  text: string;
}

export interface WriteStatementResult {
  /** `true`, wenn die Zeile mit diesem Aufruf ENTSTANDEN ist — nur dann wird gemeldet. Eine
   *  Änderung läuft still, sonst füllte eine Tippkorrektur den Posteingang der Keyholderin. */
  created: boolean;
  /** `true`, wenn der Träger seine Stellungnahme zurückgenommen hat (leerer Text). */
  removed: boolean;
}

/**
 * Schreibt, ändert oder entfernt die Stellungnahme — die Schranke von oben wird HIER durchgesetzt
 * und nicht nur in der Route: der Service ist die verbindliche Seite.
 */
export async function writeOffenseStatement(p: WriteStatementParams): Promise<ServiceResult<WriteStatementResult>> {
  if (p.text.length > OFFENSE_STATEMENT_MAX_LENGTH) return serviceFail(400, "STATEMENT_TOO_LONG");

  // Besitz VOR allem anderen: eine fremde `refId` darf nicht einmal erfahren, ob dort schon ein
  // Urteil steht. 404 und nicht 403 — die Antwort soll nicht verraten, dass es das Vergehen gibt.
  if (!(await offenseBelongsToUser(p.userId, p.refId))) return serviceFail(404, "NOT_FOUND");

  const gate = await loadStatementGate(p.userId, p.refId);
  if (!gate) return serviceFail(404, "USER_NOT_FOUND");
  const blocked = statementBlockedReason(gate);
  // 409 und nicht 403: der Zustand hat sich geändert, während er schrieb — das ist ein Konflikt und
  // keine fehlende Berechtigung. Die Oberfläche unterscheidet daran, ob sie seinen Text stehen lässt.
  if (blocked) return serviceFail(blocked === "STATEMENT_JUDGED" ? 409 : 403, blocked);

  const text = normalizeStatementText(p.text);
  const existing = await prisma.offenseStatement.findUnique({ where: { refId: p.refId }, select: { id: true, userId: true } });
  // Fremde Zeile unter derselben ref: nicht anfassen. Kann nur durch einen Datenfehler entstehen —
  // still überschreiben wäre die schlechtere Antwort darauf.
  if (existing && existing.userId !== p.userId) return serviceFail(403, "FORBIDDEN");

  if (text === null) {
    if (!existing) return serviceFail(400, "STATEMENT_EMPTY");
    await prisma.offenseStatement.delete({ where: { refId: p.refId } });
    return { ok: true, data: { created: false, removed: true } };
  }

  await prisma.offenseStatement.upsert({
    where: { refId: p.refId },
    create: { userId: p.userId, refId: p.refId, offenseType: p.offenseType, text },
    update: { text },
  });
  return { ok: true, data: { created: !existing, removed: false } };
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
  if (refIds.length === 0) return new Map<string, { text: string; createdAt: Date; updatedAt: Date }>();
  const rows = await prisma.offenseStatement.findMany({
    where: { refId: { in: refIds } },
    select: { refId: true, text: true, createdAt: true, updatedAt: true },
  });
  return new Map(rows.map(({ refId, ...rest }) => [refId, rest]));
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
  const rows = await prisma.offenseStatement.findMany({
    where: { userId },
    select: { refId: true, text: true, createdAt: true, updatedAt: true },
  });
  return new Map(rows.map(({ refId, ...rest }) => [refId, rest]));
}

/**
 * Die Schranke für MEHRERE Vergehen auf einmal — dieselbe Frage wie {@link loadStatementGate},
 * einmal statt je Zeile.
 *
 * Zwei Abfragen für eine ganze Seite: der Schalter des Trägers und die Urteile zu diesen refIds.
 */
export async function loadStatementGates(userId: string, refIds: string[]): Promise<Map<string, StatementGate>> {
  const out = new Map<string, StatementGate>();
  if (refIds.length === 0) return out;
  const [user, judgments] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { offenseStatementsAllowed: true } }),
    prisma.strafeRecord.findMany({ where: { userId, refId: { in: refIds } }, select: { refId: true, judgedBy: true } }),
  ]);
  const allowed = user?.offenseStatementsAllowed ?? false;
  const judged = new Map(judgments.map((j) => [j.refId, j.judgedBy ?? "unknown"]));
  for (const refId of refIds) out.set(refId, { allowed, judgedBy: judged.get(refId) ?? null });
  return out;
}
