import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildStrafbuch, offenseListViews, type StrafbuchData } from "@/lib/strafbuch";
import { notifyUser, type NotifyContent } from "@/lib/notify";
import { recordSystemMessage, DISMISSAL_BODY_KEY, type MessageActor } from "@/lib/messageService";
import { serviceFail, type ServiceResult } from "@/lib/serviceResult";
import { checkTask, writeTask, type CreateTaskParams } from "@/lib/taskService";
import { formatDateTime } from "@/lib/utils";
import { markLastAction } from "@/lib/appMeta";
import { offenseWasAnnounced, OFFENSE_REF_TYPE } from "@/lib/offenseAnnounce";
import { STORED_TYPE, type OffenseCanonicalType } from "@/lib/offenseTypes";
import { AI_AUTHOR } from "@/lib/constants";

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

/** Die ref-Bildung für cleaning_not_relocked liegt in `strafbuch.ts` — dort braucht sie die
 *  OFFENSE_LISTS-Tabelle, und dieses Modul importiert jenes (andersherum gäbe es einen Zyklus).
 *  Hier re-exportiert: der Ledger baut damit exakt dieselbe ref für seinen `judge()`-Aufruf, und die
 *  Admin-Route dreht sie für ihren IDOR-Check wieder um. */
export { cleaningNotRelockedRef, entryIdFromCleaningNotRelockedRef } from "@/lib/strafbuch";

/** Flacht die buildStrafbuch-Listen zu einer einheitlichen Liste erkannter Vergehen mit stabiler ref.
 *  Dient der ref-Auflösung (judge_offense) und dem Zählen — keine Strafwertung.
 *
 *  ABGELEITET aus `OFFENSE_LISTS`, nicht abgeschrieben: die Zuordnung Art → Liste/refId/Zeitpunkt
 *  steht dort einmal und wird hier nur ausgelesen. Eine handgeführte Kopie ist genau das, woran das
 *  Strafbuch schon zweimal gescheitert ist — der KERN-BUG vom 11.07. (eine Art fehlte in der Kopie)
 *  und die fünf Arten, die bis v5.0.3 in keiner Anzeige auftauchten. */
export function collectDetectedOffenses(sb: StrafbuchData): DetectedOffense[] {
  return offenseListViews(sb).flatMap(({ type, rows, ref, at }) =>
    rows.map((row) => ({
      canonicalType: type,
      offenseType: STORED_TYPE[type],
      refId: ref(row),
      at: at(row),
    })),
  );
}

export interface JudgeOffenseParams {
  userId: string;
  refId: string;
  action: "dismiss" | "punish" | "complete" | "reopen";
  /** Freitext: Strafe (bei punish, erforderlich) bzw. optionaler Grund (bei dismiss). */
  text?: string;
}

/**
 * Das Audit-Kürzel für `StrafeRecord.judgedBy` aus der Kennung des Handelnden.
 *
 * Die Spalte kennt nur „wer aus Sicht der Autorität": {@link AI_AUTHOR} für den MCP, sonst „admin" —
 * ein Mensch bleibt ein Mensch, auch wenn seine Sitzung keinen Namen trug (dann fällt allein der
 * ABSENDER der Nachricht auf „System" zurück, siehe `senderFromAuthor`). Die KI-Seite ist
 * {@link AI_AUTHOR} und kein eigenes Literal: dieselbe Kennung schreibt der MCP und liest die
 * Absender-Abbildung — liefe sie hier auseinander, urteilte die KI unter einem Wert, den niemand
 * mehr als KI erkennt.
 *
 * DAMIT reicht die Namensgrenze auch bis in die Audit-Spalte. Warum ein Mensch trotzdem nie so
 * heissen kann, steht KANONISCH bei {@link AI_AUTHOR} — hier nicht wiederholt: dies ist die
 * Abbildung, nicht die Namensvergabe.
 */
export function judgedByFromActor(actor: MessageActor): typeof AI_AUTHOR | "admin" {
  return actor === AI_AUTHOR ? AI_AUTHOR : "admin";
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
/** Betreff + Text der „Strafe verhängt"-Benachrichtigung. Erreichbar nur über {@link notifyJudgment}
 *  — dort steht, warum beide Urteils-Wege durch dieselbe Verzweigung gehen.
 *
 *  Die Mail trägt den Straftext interpoliert (sie ist per Natur eine Kopie), die NACHRICHT dagegen
 *  nur die Referenz auf den `StrafeRecord`: der Text wird beim Lesen frisch von dort geholt, damit
 *  eine spätere Korrektur nicht neben einer veralteten Kopie steht. */
function strafeVerhaengtNotice(reason: string | null, recordId: string, actor: MessageActor): NotifyContent {
  const inbox = {
    bodyKey: "penaltyMessageNoReason",
    ref: { type: "offense", id: recordId },
    // Die App verheimlicht weder die KI noch den Menschen: wer geurteilt hat, steht mit NAMEN an der
    // Nachricht. Nicht aus `StrafeRecord.judgedBy` abgeleitet — darin steht nur das Kürzel „admin".
    actor,
  } as const;
  return reason
    ? { subjectKey: "penaltySubject", messageKey: "penaltyMessage", params: { reason }, inbox }
    : { subjectKey: "penaltySubject", messageKey: "penaltyMessageNoReason", inbox };
}

/**
 * Die „Vergehen fallengelassen"-Zeile — geteilt von `judgeOffense` (MCP) und der Strafbuch-Route.
 *
 * Sie stand zuerst nur im MCP-Pfad, und genau daran liess sich der Preis zweier Umsetzungen ablesen:
 * wer im Strafbuch verwarf, schickte dem Träger NICHTS. Seine Zeile „Ein Vergehen wurde festgestellt
 * … ob und wie es beurteilt wird, entscheidet der Keyholder" blieb damit für immer unbeantwortet —
 * dieselbe stille Nicht-Auflösung, gegen die der Posteingang überhaupt gebaut wurde.
 *
 * Nur Posteingang, kein Push und keine Mail: die Nachricht nimmt eine Last weg, statt eine
 * aufzuerlegen. Wer dafür geweckt wird, lernt, Benachrichtigungen abzuschalten.
 *
 * NUR, wenn die Feststellung den Träger je erreicht hat. Vor dem Melde-Stichtag abgeleitete Vergehen
 * werden nie gemeldet — für die wäre diese Zeile das Ende einer Geschichte, die der Posteingang nie
 * erzählt hat.
 */
async function notifyOffenseDismissed(userId: string, refId: string, actor: MessageActor): Promise<void> {
  if (!(await offenseWasAnnounced(userId, refId))) return;
  await recordSystemMessage({
    subjectUserId: userId,
    bodyKey: DISMISSAL_BODY_KEY,
    // Auf das VERGEHEN, nicht auf das Urteil: dieselbe Referenz wie die Feststellungs-Meldung,
    // damit beide Zeilen denselben Anlass zeigen und ihren Freitext live von dort holen.
    ref: { type: OFFENSE_REF_TYPE, id: refId },
    // Das Verwerfen ist eine ENTSCHEIDUNG, keine Feststellung — sie trägt den Namen dessen, der sie
    // getroffen hat, nicht den des Notierenden (dessen Name steht an der Feststellung).
    actor,
    // Wieder-eröffnen und erneut verwerfen ist möglich; zwei gleichlautende Zeilen dazu nicht. Die
    // Zusage greift, weil ein `reopen` die alte Zeile löscht (siehe `judgeOffense`) — sonst wäre
    // „einmal je Bezugsobjekt" gleichbedeutend mit „für immer der erste Urteilende".
    once: true,
  });
}

/**
 * Die Meldung an den Träger NACH dem geschriebenen Urteil — beide Ausgänge, geteilt von
 * {@link judgeOffense} (MCP) und der Strafbuch-Route (Browser). Bis hierher stand dieselbe Verzweigung
 * zweimal da, und genau daran war der Verwerfungs-Zweig im Browser schon einmal vergessen worden.
 *
 * WIRFT NIE, und das ist der Punkt: das Urteil steht zu diesem Zeitpunkt bereits in der Datenbank.
 * Beide Zweige lesen dabei noch einmal live (`offenseWasAnnounced` bzw. der Empfänger in
 * `notifyUser`) — ein transienter Fehler dort meldete dem Aufrufer einen 500 für einen Vorgang, der
 * gelungen ist. Sein Wiederholungsversuch liefe dann in die Eindeutigkeits-Sperre auf `refId` und
 * bekäme „schon beurteilt" (409): aus einem verschluckten Nebeneffekt würde ein gemeldeter Konflikt.
 * Die Meldung ist Fire-and-forget wie überall sonst in dieser App (`recordSystemMessage` fängt aus
 * demselben Grund selbst).
 */
export async function notifyJudgment(
  p: { userId: string; refId: string; recordId: string; status: "PUNISHED" | "DISMISSED"; reason: string | null },
  actor: MessageActor,
): Promise<void> {
  try {
    if (p.status === "PUNISHED") {
      await notifyUser(p.userId, strafeVerhaengtNotice(p.reason, p.recordId, actor));
    } else {
      await notifyOffenseDismissed(p.userId, p.refId, actor);
    }
  } catch (err) {
    console.error("[strafurteil] Meldung zum Urteil fehlgeschlagen", err);
  }
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
 * Das Vergehen, über das geurteilt werden soll — oder null, wenn es aktuell gar nicht (mehr)
 * erkannt ist.
 *
 * Die eine Schranke gegen Urteile über Nicht-Vergehen. Sie wertet das ganze Strafbuch aus und gehört
 * deshalb IMMER vor eine Transaktion.
 */
export async function requireDetectedOffense(
  userId: string,
  refId: string,
  now: Date,
): Promise<DetectedOffense | null> {
  return collectDetectedOffenses(await buildStrafbuch(userId, now)).find((o) => o.refId === refId) ?? null;
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
  p: CreateTaskParams & { refId: string },
  actor: MessageActor,
): Promise<ServiceResult<{ id: string }>> {
  const now = new Date();

  // Beide Prüfungen stehen VOR der Transaktion: sie lesen nur, und sie kosten zusammen ein Dutzend
  // Abfragen. Innerhalb hielten sie die einzige SQLite-Verbindung dieser App für ihre ganze Dauer.
  // Nur über ein aktuell ERKANNTES Vergehen lässt sich urteilen — dieselbe Schranke wie in
  // `judgeOffense`.
  const offense = await requireDetectedOffense(p.userId, p.refId, now);
  if (!offense) return serviceFail(404, "OFFENSE_NOT_FOUND");

  // Die Ablehnung des Formulars (Titel zu lang, Frist zu früh, Gerät fremd) erreicht den Aufrufer
  // damit direkt, statt aus einem abgebrochenen Vorgang zurückgetragen werden zu müssen.
  const checked = await checkTask(prisma, { ...p, isPunishment: true });
  if (!checked.ok) return checked;

  // Was bleibt, sind die zwei Schreibvorgänge, die zusammengehören: die Aufgabe und ihr Urteil.
  const created = await prisma.$transaction(async (tx) => {
    const task = await writeTask(tx, checked.data);
    await writeJudgment(tx, {
      userId: p.userId, offense, now,
      status: "PUNISHED", reason: task.title, actor, taskId: task.id,
    });
    return task;
  });

  // NACH der Transaktion: eine Mail lässt sich nicht zurückrollen. Und genau eine — die Strafe IST
  // die Aufgabe, zwei Nachrichten wären zweimal dieselbe Neuigkeit.
  await notifyUser(p.userId, strafaufgabeNotice(created, actor));
  markLastAction();

  return { ok: true, data: { id: created.id } };
}

/**
 * Zieht die Aufgabe zurück, die am bisherigen Urteil dieses Vergehens hängt.
 *
 * Über die BEZIEHUNG statt über ein vorher gelesenes `taskId`: das spart die Abfrage und macht den
 * Besitz-Vergleich zu einer Bedingung der Anweisung selbst. Im Anlege-Fall trifft sie nur die ALTE
 * Aufgabe — die neue ist zu diesem Zeitpunkt noch nicht verknüpft (das `upsert` folgt erst danach).
 *
 * `withdrawnAt: null` in der Bedingung: ein zweiter Rückzug fasst null Zeilen an, statt den
 * Zeitpunkt des ersten zu überschreiben.
 */
async function withdrawLinkedTask(tx: Prisma.TransactionClient, refId: string, userId: string, now: Date): Promise<void> {
  await tx.task.updateMany({
    where: { userId, withdrawnAt: null, strafeRecords: { some: { refId } } },
    data: { withdrawnAt: now },
  });
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
    userId: string; offense: DetectedOffense; now: Date;
    status: "PUNISHED" | "DISMISSED"; reason: string | null;
    actor: MessageActor; taskId: string | null;
  },
): Promise<{ id: string }> {
  await withdrawLinkedTask(tx, p.offense.refId, p.userId, p.now);

  const data = {
    status: p.status, reason: p.reason, judgedBy: judgedByFromActor(p.actor),
    erledigtAt: null, bestraftDatum: p.now, taskId: p.taskId,
  };
  return tx.strafeRecord.upsert({
    where: { refId: p.offense.refId },
    create: { userId: p.userId, offenseType: p.offense.offenseType, refId: p.offense.refId, ...data },
    update: data,
    select: { id: true },
  });
}

/** Die eine Nachricht einer Strafaufgabe: sie nennt die Strafe und zeigt auf die Aufgabe, damit der
 *  Sub von der Nachricht aus direkt sieht, was zu tun ist. */
function strafaufgabeNotice(
  task: { id: string; title: string; holdUntil: Date },
  actor: MessageActor,
): NotifyContent {
  return {
    subjectKey: "penaltyTaskSubject",
    messageKey: "penaltyTaskMessage",
    params: { title: task.title, until: formatDateTime(task.holdUntil) },
    alwaysNotify: true,
    inbox: {
      ref: { type: "task", id: task.id },
      actor,
      // Eine Aufgabe wird genau einmal gestellt — ein Retry darf keine zweite Zeile hinterlassen.
      once: true,
    },
  };
}

/**
 * Fällt ein Urteil über ein erkanntes Vergehen.
 *
 * `actor` ist WER urteilt (Benutzername der Sitzung bzw. {@link AI_AUTHOR} über den MCP, siehe
 * {@link MessageActor}) — als eigenes ARGUMENT und bewusst kein Feld in `params`, wie bei
 * {@link punishWithTask} und allen Direktiv-Diensten: die Routen reichen den rohen Request-Body als
 * Parameter-Objekt durch, und in einem Bag wäre der Urteilende von aussen setzbar.
 *
 * Aus ihm entsteht BEIDES — der Absender der Meldung an den Träger und das Audit-Kürzel in
 * `StrafeRecord.judgedBy` ({@link judgedByFromActor}). Eine Angabe statt zweier: `judgedBy` allein
 * kennt nur die Kürzel „ai"/„admin" und kann nicht sagen, WELCHER Mensch geurteilt hat. Beide Werte
 * nebeneinander entgegenzunehmen liesse dagegen die widersprüchliche Kombination zu, das Urteil
 * eines Menschen als KI-Urteil zu verbuchen.
 */
export async function judgeOffense(
  p: JudgeOffenseParams,
  actor: MessageActor,
): Promise<ServiceResult<JudgeOffenseResult>> {
  const now = new Date();

  if (p.action === "reopen") {
    // Die Strafaufgabe geht mit: bliebe sie stehen, forderte die App weiter eine Strafe ein, die es
    // nicht mehr gibt — und ihr Verstreichen wäre später ein neues Vergehen. Zurückgezogen, nicht
    // gelöscht: der Sub hat sie gesehen, und ein Rückzug ist die dafür vorgesehene Endstation.
    const removed = await prisma.$transaction(async (tx) => {
      // Erst der Rückzug: danach gibt es die Verknüpfung nicht mehr, über die er sein Ziel findet.
      await withdrawLinkedTask(tx, p.refId, p.userId, now);
      const del = await tx.strafeRecord.deleteMany({ where: { userId: p.userId, refId: p.refId } });
      // Gab es kein Urteil, war das hier kein Wieder-Eröffnen: der Aufrufer bekommt 404, und dann
      // soll dieser Weg auch nichts hinterlassen haben.
      if (del.count === 0) return false;

      // Sonst geht die „fallengelassen"-Meldung MIT dem Urteil, in derselben Transaktion.
      //
      // WARUM LÖSCHEN und nicht bloss verbergen: die Zeile behauptet „dieses Vergehen wurde
      // fallengelassen", und in dem Moment, in dem das Urteil verschwindet, ist das nicht mehr wahr.
      // Sichtbar war sie ohnehin schon nicht mehr (`dismissalMessageStillApplies` blendet sie ohne
      // Urteil aus) — stehen bleibt sie also nur als Sperre: `notifyOffenseDismissed` schreibt mit
      // `once`, und die alte Zeile unterdrückte damit die NEUE. Wer nach einem reopen erneut
      // verwarf, blieb im Posteingang des Trägers unter dem Namen des ERSTEN Urteilenden stehen —
      // mit dessen Zeitpunkt und dessen Gelesen-Stand, also ohne jedes Zeichen für die zweite
      // Entscheidung. Genau die Falschaussage, gegen die die Absender-Angabe gebaut ist.
      //
      // Der Verlust ist keiner: die FESTSTELLUNG („ein Vergehen wurde festgestellt") bleibt stehen,
      // sie ist der Beleg. Verworfen wird nur die Auflösung, die es nicht mehr gibt.
      await tx.message.deleteMany({
        where: {
          subjectUserId: p.userId,
          audience: "sub",
          bodyKey: DISMISSAL_BODY_KEY,
          refEntityType: OFFENSE_REF_TYPE,
          refEntityId: p.refId,
        },
      });
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

  // Die ref stand früher im Fehlertext; sie ist ein Aufrufer-Argument, das der MCP-Agent bereits
  // kennt — ein Code ohne Interpolation genügt und bleibt übersetzbar.
  const offense = await requireDetectedOffense(p.userId, p.refId, now);
  if (!offense) return serviceFail(404, "OFFENSE_NOT_FOUND");

  const status = judgmentStatus(p.action);
  // In einer Transaktion, weil das Urteil eine frühere Strafaufgabe zurückziehen kann — zwei
  // Schreibvorgänge, die zusammengehören. `taskId: null`: dieser Weg ist der Freitext, er LÖST eine
  // bestehende Aufgabe vom Urteil, statt sie stillschweigend weiterzuschleppen.
  const record = await prisma.$transaction((tx) => writeJudgment(tx, {
    userId: p.userId, offense, now,
    status, reason: text, actor, taskId: null,
  }));

  await notifyJudgment({ userId: p.userId, refId: offense.refId, recordId: record.id, status, reason: text }, actor);
  markLastAction();

  return { ok: true, data: { status: status === "PUNISHED" ? "punished" : "dismissed", done: false } };
}
