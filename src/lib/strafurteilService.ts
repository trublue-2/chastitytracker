import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildStrafbuch, type StrafbuchData } from "@/lib/strafbuch";
import { notifyUser, type NotifyContent } from "@/lib/notify";
import { senderKindOf } from "@/lib/messageService";
import { serviceFail, type ServiceFailure, type ServiceResult } from "@/lib/serviceResult";
import { codedError, codeOf } from "@/lib/codedError";
import { createTaskTx, type CreateTaskParams } from "@/lib/taskService";
import { formatDateTime } from "@/lib/utils";
import { markLastAction } from "@/lib/appMeta";
import { STORED_TYPE, type OffenseCanonicalType } from "@/lib/offenseTypes";

/**
 * Urteils-Lebenszyklus über erkannte Vergehen:
 *   erkannt → verworfen (DISMISSED) | bestraft (PUNISHED) → erledigt.
 * Single source of truth, geteilt von der Admin-Strafbuch-Route und dem MCP-Tool judge_offense.
 *
 * Die Strafe ist ein freies Textfeld (z.B. „20 Schläge") — kein Typen-Zoo, keine Sperrzeit-Kopplung.
 * Die Klugheit liegt im Urteilstext, nicht im Feld. „erledigtAt" schließt den Loop.
 */

/** Vergehens-Taxonomie: liegt in `offenseTypes.ts`, weil dieses Modul Prisma zieht und die Tabelle
 *  auch aus Client-Komponenten (Strafbuch-Seite) erreichbar sein muss. Hier re-exportiert, damit die
 *  bestehenden Importeure unverändert bleiben. */
export { STORED_TYPE, type OffenseCanonicalType, type StoredOffenseType } from "@/lib/offenseTypes";

export interface DetectedOffense {
  canonicalType: OffenseCanonicalType;
  offenseType: string;
  refId: string;
  at: Date | null;
}

/** cleaning_not_relocked shares its underlying OEFFNEN entry with cleaning_limit (both can fire on
 *  the same REINIGUNG opening — over the daily quota AND not relocked in time). StrafeRecord.refId
 *  is globally `@unique`, so the two offenses need disjoint ref namespaces — prefixed here rather
 *  than using the bare entry id. Exported so the ledger's `judge()` call constructs the exact
 *  same ref (round-trips through judge_offense) and the admin route can reverse it for its IDOR check. */
export function cleaningNotRelockedRef(entryId: string): string {
  return `relock:${entryId}`;
}
export function entryIdFromCleaningNotRelockedRef(refId: string): string | null {
  return refId.startsWith("relock:") ? refId.slice("relock:".length) : null;
}

/** Flacht die buildStrafbuch-Listen zu einer einheitlichen Liste erkannter Vergehen mit stabiler ref.
 *  Dient der ref-Auflösung (judge_offense) und dem Zählen — keine Strafwertung. */
export function collectDetectedOffenses(sb: StrafbuchData): DetectedOffense[] {
  const mk = (canonicalType: OffenseCanonicalType, refId: string, at: Date | null): DetectedOffense =>
    ({ canonicalType, offenseType: STORED_TYPE[canonicalType], refId, at });
  return [
    ...sb.unauthorizedOpenings.map((o) => mk("unauthorized_opening", o.id, o.startTime)),
    ...sb.lateControls.map((k) => mk("late_control", k.id, k.entryStartTime ?? k.deadline)),
    ...sb.rejectedControls.map((k) => mk("rejected_control", k.id, k.entryStartTime ?? k.deadline)),
    ...sb.autoRemovedControls.map((k) => mk("auto_removed_control", k.id, k.entryStartTime ?? k.deadline)),
    ...sb.reinigungLimitViolations.map((v) => mk("cleaning_limit", v.entryId, v.startTime)),
    ...sb.wrongDeviceViolations.map((v) => mk("wrong_device", v.entryId, v.startTime)),
    ...sb.missedOrgasmInstructions.map((m) => mk("missed_orgasm", m.id, m.endetAt)),
    ...sb.lateLocks.map((a) => mk("late_lock", a.id, a.fulfilledAt ?? a.endetAt)),
    ...sb.cleaningNotRelocked.map((c) => mk("cleaning_not_relocked", cleaningNotRelockedRef(c.entryId), c.relockAt ?? c.deadline)),
    // refId = Task.id. Anders als bei den Reinigungs-Vergehen braucht es kein Präfix: die id gehört
    // keiner zweiten Vergehensart, und `StrafeRecord.refId` ist global eindeutig.
    ...sb.unfulfilledTasks.map((t) => mk("unfulfilled_task", t.id, t.failedAt ?? t.holdUntil)),
    // refId ist die AdminPasswordChange-id: eigener Namensraum, kollidiert nicht mit Entry-/
    // Anforderungs-ids und bleibt stabil, auch wenn die Sperrzeit später zurückgezogen wird.
    ...sb.adminPasswordChanges.map((p) => mk("admin_password_change", p.id, p.at)),
  ];
}

export interface JudgeOffenseParams {
  userId: string;
  refId: string;
  action: "dismiss" | "punish" | "complete" | "reopen";
  /** Freitext: Strafe (bei punish, erforderlich) bzw. optionaler Grund (bei dismiss). */
  text?: string;
  judgedBy: "ai" | "admin";
}

export interface JudgeOffenseResult {
  status: "punished" | "dismissed" | "open";
  done: boolean;
}

/**
 * Fällt/aktualisiert ein Urteil über ein erkanntes Vergehen (per refId).
 * - dismiss: markiert DISMISSED (verbindlich), text = optionaler Grund.
 * - punish: markiert PUNISHED, text = Strafe (erforderlich), erledigtAt = null (offen).
 * - complete: setzt erledigtAt = now auf einer bestehenden Strafe (Loop schließen).
 * - reopen: entfernt das Urteil (revidieren).
 */
/** Betreff + Text der „Strafe verhängt"-Benachrichtigung — geteilt von judgeOffense (MCP) und
 *  der Admin-Strafe-Route, damit beide Wege identisch benachrichtigen.
 *
 *  Die Mail trägt den Straftext interpoliert (sie ist per Natur eine Kopie), die NACHRICHT dagegen
 *  nur die Referenz auf den `StrafeRecord`: der Text wird beim Lesen frisch von dort geholt, damit
 *  eine spätere Korrektur nicht neben einer veralteten Kopie steht. */
export function strafeVerhaengtNotice(reason: string | null, recordId: string, judgedBy: string | null): NotifyContent {
  const inbox = {
    bodyKey: "penaltyMessageNoReason",
    ref: { type: "offense", id: recordId },
    // Die App verheimlicht die KI nicht: wer geurteilt hat, steht an der Nachricht.
    senderKind: senderKindOf(judgedBy),
  } as const;
  return reason
    ? { subjectKey: "penaltySubject", messageKey: "penaltyMessage", params: { reason }, inbox }
    : { subjectKey: "penaltySubject", messageKey: "penaltyMessageNoReason", inbox };
}

/** `action: "punish"` verlangt einen nicht-leeren Straftext — geteilt von `judgeOffense` und der
 *  MCP-dryRun-Vorschau (mcpWrite.ts), damit die Regel nicht zweimal dasteht. */
export function checkPenaltyText(action: JudgeOffenseParams["action"], text: string | undefined): "PENALTY_TEXT_REQUIRED" | null {
  return action === "punish" && !text?.trim() ? "PENALTY_TEXT_REQUIRED" : null;
}

/** Der resultierende StrafeRecord.status bei punish/dismiss — geteilt vom echten Commit (unten) und
 *  vom MCP judge_offense dryRun-Preview (B-05), damit die Zuordnung nicht zweimal dasteht. */
export function judgmentStatus(action: "punish" | "dismiss"): "PUNISHED" | "DISMISSED" {
  return action === "punish" ? "PUNISHED" : "DISMISSED";
}

/**
 * Bestrafen, indem eine AUFGABE gestellt wird — statt „20 Schläge" als Freitext eine Forderung mit
 * Frist, deren Erfüllung die App selbst mitbekommt.
 *
 * Ein Vorgang, nicht zwei: Aufgabe und Urteil entstehen in derselben Transaktion. Nacheinander
 * geschrieben liesse ein Abbruch dazwischen eine Strafaufgabe beim Sub stehen, über die nie jemand
 * geurteilt hat — der Keyholder sähe das Vergehen weiter als offen und bestrafte es ein zweites Mal.
 *
 * Die Strafe im Urteil ist der TITEL der Aufgabe. Der Freitext bleibt damit gefüllt, auch wo nur er
 * gelesen wird (MCP-Strafbuch, Nachricht), und `taskId` trägt die Verbindung für alles Weitere.
 */
export async function punishWithTask(
  p: CreateTaskParams & { refId: string; judgedBy: JudgeOffenseParams["judgedBy"] },
): Promise<ServiceResult<{ id: string }>> {
  const now = new Date();

  // Dieselbe Schranke wie in `judgeOffense`: nur über ein aktuell ERKANNTES Vergehen lässt sich
  // urteilen. Sie steht vor der Transaktion, weil sie nur liest und das ganze Strafbuch auswertet.
  const offense = collectDetectedOffenses(await buildStrafbuch(p.userId, now)).find((o) => o.refId === p.refId);
  if (!offense) return serviceFail(404, "OFFENSE_NOT_FOUND");

  // Die Ablehnung des Formulars (Titel zu lang, Frist zu früh, Gerät fremd) soll den Aufrufer im
  // Klartext erreichen. Deshalb aufheben und nach dem Rollback zurückgeben, statt sie in einen
  // generischen Transaktionsfehler zu verwandeln. Als Feld eines Objekts, nicht als lose Variable:
  // eine Zuweisung im Callback verfolgt TypeScript nicht, `let failure` verengte sich auf `never` —
  // und ein späteres Entfernen der Zuweisung wäre still durchgegangen.
  const box: { failure?: ServiceFailure } = {};
  let created: { id: string; title: string; holdUntil: Date };

  try {
    created = await prisma.$transaction(async (tx) => {
      const task = await createTaskTx(tx, { ...p, isPunishment: true });
      if (!task.ok) {
        box.failure = task;
        throw codedError("TASK_REJECTED");
      }
      await writeJudgment(tx, {
        userId: p.userId, offenseType: offense.offenseType, refId: p.refId, now,
        status: "PUNISHED", reason: task.data.title, judgedBy: p.judgedBy, taskId: task.data.id,
      });
      return task.data;
    });
  } catch (e) {
    if (codeOf(e) === "TASK_REJECTED" && box.failure) return box.failure;
    throw e;
  }

  // NACH der Transaktion: eine Mail lässt sich nicht zurückrollen. Und genau eine — die Strafe IST
  // die Aufgabe, zwei Nachrichten wären zweimal dieselbe Neuigkeit.
  await notifyUser(p.userId, strafaufgabeNotice(created, p.judgedBy));
  markLastAction();

  return { ok: true, data: { id: created.id } };
}

/**
 * Schreibt das Urteil über ein Vergehen — die EINE Stelle, an der ein `StrafeRecord` entsteht.
 *
 * `taskId` ist Pflicht-Argument, nicht optional: der Freitext-Weg muss eine frühere Strafaufgabe
 * ausdrücklich mit `null` lösen. Als optionales Feld liess er sie stehen, und ein verworfenes
 * Vergehen behielt eine Aufgabe, die das Schema ausdrücklich ausschliesst.
 *
 * Wird eine bestehende Strafaufgabe ersetzt, ZIEHT sie diese Funktion zurück. Sonst liefe die alte
 * beim Sub weiter, und wenn ihre Frist verstreicht, erzeugt sie als „nicht erfüllte Aufgabe" ein
 * neues Vergehen — die Korrektur eines Urteils würde ein Vergehen erfinden.
 */
async function writeJudgment(
  tx: Prisma.TransactionClient,
  p: {
    userId: string; offenseType: string; refId: string; now: Date;
    status: "PUNISHED" | "DISMISSED"; reason: string | null;
    judgedBy: JudgeOffenseParams["judgedBy"]; taskId: string | null;
  },
): Promise<{ id: string }> {
  const previous = await tx.strafeRecord.findUnique({
    where: { refId: p.refId },
    select: { userId: true, taskId: true },
  });
  if (previous?.taskId && previous.taskId !== p.taskId && previous.userId === p.userId) {
    await tx.task.updateMany({
      where: { id: previous.taskId, userId: p.userId, withdrawnAt: null },
      data: { withdrawnAt: p.now },
    });
  }

  const data = {
    status: p.status, reason: p.reason, judgedBy: p.judgedBy,
    erledigtAt: null, bestraftDatum: p.now, taskId: p.taskId,
  };
  return tx.strafeRecord.upsert({
    where: { refId: p.refId },
    create: { userId: p.userId, offenseType: p.offenseType, refId: p.refId, ...data },
    update: data,
    select: { id: true },
  });
}

/** Die eine Nachricht einer Strafaufgabe: sie nennt die Strafe und zeigt auf die Aufgabe, damit der
 *  Sub von der Nachricht aus direkt sieht, was zu tun ist. */
function strafaufgabeNotice(
  task: { id: string; title: string; holdUntil: Date },
  judgedBy: string | null,
): NotifyContent {
  return {
    subjectKey: "penaltyTaskSubject",
    messageKey: "penaltyTaskMessage",
    params: { title: task.title, until: formatDateTime(task.holdUntil) },
    alwaysNotify: true,
    inbox: {
      ref: { type: "task", id: task.id },
      senderKind: senderKindOf(judgedBy),
      // Eine Aufgabe wird genau einmal gestellt — ein Retry darf keine zweite Zeile hinterlassen.
      once: true,
    },
  };
}

export async function judgeOffense(p: JudgeOffenseParams): Promise<ServiceResult<JudgeOffenseResult>> {
  const now = new Date();

  if (p.action === "reopen") {
    // Die Strafaufgabe geht mit: bliebe sie stehen, forderte die App weiter eine Strafe ein, die es
    // nicht mehr gibt — und ihr Verstreichen wäre später ein neues Vergehen. Zurückgezogen, nicht
    // gelöscht: der Sub hat sie gesehen, und ein Rückzug ist die dafür vorgesehene Endstation.
    const removed = await prisma.$transaction(async (tx) => {
      const rec = await tx.strafeRecord.findUnique({
        where: { refId: p.refId },
        select: { userId: true, taskId: true },
      });
      if (!rec || rec.userId !== p.userId) return false;
      if (rec.taskId) {
        await tx.task.updateMany({
          where: { id: rec.taskId, userId: p.userId, withdrawnAt: null },
          data: { withdrawnAt: now },
        });
      }
      await tx.strafeRecord.delete({ where: { refId: p.refId } });
      return true;
    });
    if (!removed) return serviceFail(404, "JUDGMENT_NOT_FOUND");
    return { ok: true, data: { status: "open", done: false } };
  }

  if (p.action === "complete") {
    const rec = await prisma.strafeRecord.findUnique({ where: { refId: p.refId } });
    if (!rec || rec.userId !== p.userId) return serviceFail(404, "JUDGMENT_NOT_FOUND");
    if (rec.status !== "PUNISHED") return serviceFail(400, "PENALTY_NOT_PUNISHED");
    await prisma.strafeRecord.update({ where: { refId: p.refId }, data: { erledigtAt: rec.erledigtAt ?? now } });
    return { ok: true, data: { status: "punished", done: true } };
  }

  const text = p.text?.trim() || null;
  const penaltyTextError = checkPenaltyText(p.action, p.text);
  if (penaltyTextError) return serviceFail(400, penaltyTextError);

  // Vergehen muss aktuell erkannt sein (verhindert Urteile über Nicht-Vergehen).
  const offenses = collectDetectedOffenses(await buildStrafbuch(p.userId, now));
  const offense = offenses.find((o) => o.refId === p.refId);
  // Die ref stand früher im Fehlertext; sie ist ein Aufrufer-Argument, das der MCP-Agent bereits
  // kennt — ein Code ohne Interpolation genügt und bleibt übersetzbar.
  if (!offense) return serviceFail(404, "OFFENSE_NOT_FOUND");

  const status = judgmentStatus(p.action);
  // In einer Transaktion, weil das Urteil eine frühere Strafaufgabe zurückziehen kann — zwei
  // Schreibvorgänge, die zusammengehören. `taskId: null`: dieser Weg ist der Freitext, er LÖST eine
  // bestehende Aufgabe vom Urteil, statt sie stillschweigend weiterzuschleppen.
  const record = await prisma.$transaction((tx) => writeJudgment(tx, {
    userId: p.userId, offenseType: offense.offenseType, refId: p.refId, now,
    status, reason: text, judgedBy: p.judgedBy, taskId: null,
  }));

  // Nur bei verhängter Strafe benachrichtigen (ein Verwerfen ist für den Nutzer belanglos).
  if (status === "PUNISHED") await notifyUser(p.userId, strafeVerhaengtNotice(text, record.id, p.judgedBy));
  markLastAction();

  return { ok: true, data: { status: status === "PUNISHED" ? "punished" : "dismissed", done: false } };
}
