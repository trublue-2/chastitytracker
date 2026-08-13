import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildStrafbuch, offenseListViews, type StrafbuchData } from "@/lib/strafbuch";
import { notifyUser, type NotifyContent } from "@/lib/notify";
import { recordSystemMessage, DISMISSAL_BODY_KEY, type MessageActor } from "@/lib/messageService";
import { serviceFail, type ServiceResult, type ServiceFailure } from "@/lib/serviceResult";
import { checkTask, writeTask, type CreateTaskParams } from "@/lib/taskService";
import { formatDateTime } from "@/lib/utils";
import { markLastAction } from "@/lib/appMeta";
import { offenseWasAnnounced, OFFENSE_REF_TYPE } from "@/lib/offenseAnnounce";
import { STORED_TYPE, type OffenseCanonicalType, type StoredOffenseType } from "@/lib/offenseTypes";
import { isUniqueConstraintOn } from "@/lib/prismaErrors";
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
  /** `complete`/`uncomplete` sind die beiden Richtungen desselben Schalters am bestehenden Urteil —
   *  „Als erledigt" und „Wieder offen" im Strafbuch. Getrennt und nicht als `done: boolean`, weil
   *  die übrigen Werte schon Aktionen sind und ein Bool daneben zwei Grammatiken ergäbe. */
  action: "dismiss" | "punish" | "complete" | "uncomplete" | "reopen";
  /** Freitext: Strafe (bei punish, erforderlich) bzw. optionaler Grund (bei dismiss). */
  text?: string;
  /**
   * WELCHES der Vergehen an dieser ref gemeint ist — die BEHAUPTUNG des Aufrufers, gegen die
   * Erkennung geprüft (siehe {@link DetectedOffense.offenseType}).
   *
   * Zwei Arten können sich eine ref teilen: `unauthorized_opening` und `cleaning_limit` sind beide
   * die `Entry.id` derselben OEFFNEN-Zeile, und eine Reinigungsöffnung über dem Kontingent während
   * einer Sperrzeit ist beides. Das Strafbuch zeigt sie in zwei Abschnitten, und der Knopf, der
   * geklickt wurde, sagt hier, welcher es war — sonst stünde in der Urteils-Zeile die Art des
   * zuerst erkannten Abschnitts statt der beurteilten.
   *
   * Als {@link StoredOffenseType} und nicht als `string`: die Taxonomie ist im ganzen Repo hart
   * getippt, und ein weiter Typ hier machte ausgerechnet an der Schranke einen Tippfehler
   * unsichtbar. Die Umwandlung passiert EINMAL am JSON-Rand (der Route), wo der rohe Body ankommt.
   *
   * Weglassen heisst „egal, das erste erkannte" — so ruft der MCP, dem `get_offenses` die ref schon
   * eindeutig zu einer Art geliefert hat. Nur `punish`/`dismiss` werten es aus; die übrigen Aktionen
   * arbeiten auf dem bestehenden Urteil, das ohnehin genau eines je ref ist.
   */
  offenseType?: StoredOffenseType;
  /**
   * Darf dieses Urteil ein BESTEHENDES ersetzen?
   *
   * Vorgabe ist ja (Revision erlaubt) — so ruft der MCP: ein Agent spricht seine Absicht aus, und
   * die Korrektur eines eigenen Urteils ist für ihn der Normalfall.
   *
   * Der BROWSER ruft mit `false`, und das ist keine Verschärfung, sondern die Rettung einer Zusage,
   * die es vorher schon gab: das Strafbuch bietet Bestrafen/Strafaufgabe/Verwerfen nur an einer
   * UNbeurteilten Zeile an, an einer beurteilten steht das Urteil mit „Rückgängig". Eine Anfrage auf
   * ein bereits beurteiltes Vergehen kommt also aus einer VERALTETEN Seite (zweiter Keyholder,
   * zweiter Tab, oder — im selben Tab möglich — „Wurde bestraft" und „Verwerfen" gleichzeitig
   * aufgeklappt und beide abgeschickt) und ersetzte sonst ein fremdes Urteil samt Strafaufgabe.
   *
   * Die Schranke liegt HIER und nicht in der Route, weil nur hier atomar ist, was sie zusagt: eine
   * vorgeschaltete Abfrage („gibt es schon ein Urteil?") lässt zwischen Lesen und Schreiben ein
   * Fenster, in dem beide Anfragen vorbeikommen — und der Träger bekäme „Strafe verhängt" UND
   * „Vergehen fallengelassen" zu einem Vergehen, von dem die Datenbank nur eines hält. Umgesetzt
   * ist sie als `create` gegen die Eindeutigkeit von `StrafeRecord.refId`: die Datenbank entscheidet,
   * nicht eine Reihenfolge.
   */
  allowRevision?: boolean;
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
 *
 * Modul-intern: seit die Strafbuch-Route durch {@link judgeOffense} geht, schreibt niemand mehr
 * ausserhalb dieser Datei einen `StrafeRecord` aus einem Handelnden.
 */
function judgedByFromActor(actor: MessageActor): typeof AI_AUTHOR | "admin" {
  return actor === AI_AUTHOR ? AI_AUTHOR : "admin";
}

export interface JudgeOffenseResult {
  status: "punished" | "dismissed" | "open";
  done: boolean;
}

/** Betreff + Text der „Strafe verhängt"-Benachrichtigung. Erreichbar nur über {@link notifyJudgment}
 *  — dort steht, warum die Verzweigung über beide Ausgänge an EINER Stelle liegt.
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
 * Die Meldung an den Träger NACH dem geschriebenen Urteil — beide Ausgänge in EINER Verzweigung.
 *
 * Sie stand einmal zweimal da (hier und in der Strafbuch-Route), und genau daran war der
 * Verwerfungs-Zweig im Browser vergessen worden. Heute gibt es nur noch einen Aufrufer: die Route
 * geht selbst durch {@link judgeOffense}. Die Funktion bleibt trotzdem eigenständig, weil sie eine
 * eigene Zusage trägt — die folgende.
 *
 * WIRFT NIE, und das ist der Punkt: das Urteil steht zu diesem Zeitpunkt bereits in der Datenbank.
 * Beide Zweige lesen dabei noch einmal live (`offenseWasAnnounced` bzw. der Empfänger in
 * `notifyUser`) — ein transienter Fehler dort meldete dem Aufrufer einen 500 für einen Vorgang, der
 * gelungen ist. Sein Wiederholungsversuch liefe dann in die Eindeutigkeits-Sperre auf `refId` und
 * bekäme „schon beurteilt" (409): aus einem verschluckten Nebeneffekt würde ein gemeldeter Konflikt.
 * Die Meldung ist Fire-and-forget wie überall sonst in dieser App (`recordSystemMessage` fängt aus
 * demselben Grund selbst).
 */
async function notifyJudgment(
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
 * ALLE aktuell erkannten Vergehen zu dieser ref — meist eines, manchmal zwei (siehe
 * {@link JudgeOffenseParams.offenseType}), leer, wenn die ref gar kein Vergehen (mehr) bezeichnet.
 *
 * Die eine Schranke gegen Urteile über Nicht-Vergehen. Sie wertet das ganze Strafbuch aus und gehört
 * deshalb IMMER vor eine Transaktion.
 */
async function detectedOffensesAt(userId: string, refId: string, now: Date): Promise<DetectedOffense[]> {
  return collectDetectedOffenses(await buildStrafbuch(userId, now)).filter((o) => o.refId === refId);
}

/** Wie {@link detectedOffensesAt}, aber nur das erste Vergehen — für Aufrufer, denen die ART egal
 *  ist (die MCP-Vorschau fragt bloss „gibt es das überhaupt noch?"). */
export async function requireDetectedOffense(
  userId: string,
  refId: string,
  now: Date,
): Promise<DetectedOffense | null> {
  return (await detectedOffensesAt(userId, refId, now))[0] ?? null;
}

/**
 * Das Vergehen, über das geurteilt wird — die Schranke gegen Urteile über Nicht-Vergehen samt der
 * Auflösung, WELCHES an einer geteilten ref gemeint ist.
 *
 * Geteilt von {@link judgeOffense} und {@link punishWithTask}, weil beide dieselbe Frage stellen und
 * dieselben zwei Antworten schulden: 404 heisst „nichts (mehr) da", 400 heisst „da, aber eine andere
 * Art" — ein Client-Fehler, den ein 404 dem Absender als verschwundenes Vergehen verkaufen würde.
 */
async function resolveDetectedOffense(
  userId: string,
  refId: string,
  now: Date,
  offenseType: StoredOffenseType | undefined,
): Promise<ServiceResult<DetectedOffense>> {
  const detected = await detectedOffensesAt(userId, refId, now);
  if (detected.length === 0) return serviceFail(404, "OFFENSE_NOT_FOUND");
  const offense = offenseType ? detected.find((o) => o.offenseType === offenseType) : detected[0];
  return offense ? { ok: true, data: offense } : serviceFail(400, "OFFENSE_TYPE_MISMATCH");
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
  p: CreateTaskParams & Pick<JudgeOffenseParams, "refId" | "offenseType" | "allowRevision">,
  actor: MessageActor,
): Promise<ServiceResult<{ id: string }>> {
  const now = new Date();

  // Beide Prüfungen stehen VOR der Transaktion: sie lesen nur, und sie kosten zusammen ein Dutzend
  // Abfragen. Innerhalb hielten sie die einzige SQLite-Verbindung dieser App für ihre ganze Dauer.
  // Nur über ein aktuell ERKANNTES Vergehen lässt sich urteilen — dieselbe Schranke wie in
  // `judgeOffense`, und über dieselbe Auflösung: welche ART an einer geteilten ref gemeint ist, sagt
  // der Aufrufer. Ohne sie stempelte die Strafaufgabe aus dem Reinigungs-Limit-Abschnitt
  // `OEFFNEN_ENTRY` an ihr Urteil — die Art des zuerst erkannten Abschnitts.
  const found = await resolveDetectedOffense(p.userId, p.refId, now, p.offenseType);
  if (!found.ok) return found;
  const offense = found.data;

  // Die Ablehnung des Formulars (Titel zu lang, Frist zu früh, Gerät fremd) erreicht den Aufrufer
  // damit direkt, statt aus einem abgebrochenen Vorgang zurückgetragen werden zu müssen.
  const checked = await checkTask(prisma, { ...p, isPunishment: true });
  if (!checked.ok) return checked;

  // Was bleibt, sind die zwei Schreibvorgänge, die zusammengehören: die Aufgabe und ihr Urteil.
  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      const task = await writeTask(tx, checked.data);
      await writeJudgment(tx, {
        userId: p.userId, offense, now,
        status: "PUNISHED", reason: task.title, actor, taskId: task.id,
        allowRevision: p.allowRevision ?? true,
      });
      return task;
    });
  } catch (e) {
    // Der Konflikt rollt die GANZE Transaktion zurück — auch die Aufgabe. Genau deshalb steht die
    // Schranke in der Transaktion und nicht als Abfrage davor: sonst bliebe beim Sub eine Aufgabe
    // stehen, deren Urteil abgelehnt wurde.
    const conflict = judgmentConflict(e);
    if (conflict) return conflict;
    throw e;
  }

  // NACH der Transaktion: eine Mail lässt sich nicht zurückrollen. Und genau eine — die Strafe IST
  // die Aufgabe, zwei Nachrichten wären zweimal dieselbe Neuigkeit.
  //
  // Gekapselt wie in `notifyJudgment`, und seit `allowRevision: false` ist das keine Vorsicht mehr,
  // sondern nötig: `notifyUser` liest den Empfänger live: ein transienter Fehler dort meldete dem
  // Aufrufer einen 500 für einen Vorgang, der GELUNGEN ist. Sein Wiederholungsversuch liefe in die
  // Eindeutigkeits-Sperre auf `refId` und bekäme „schon beurteilt" — und der Träger bliebe mit einer
  // Strafaufgabe zurück, von der er nie erfahren hat, ohne zweite Gelegenheit, es ihm zu sagen.
  try {
    await notifyUser(p.userId, strafaufgabeNotice(created, actor));
  } catch (e) {
    console.error("[strafe] Benachrichtigung zur Strafaufgabe fehlgeschlagen", e);
  }
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
 * Schreibt das URTEIL über ein Vergehen — die eine Stelle, an der ein beurteilter `StrafeRecord`
 * entsteht. (Nicht die einzige Stelle, an der die Tabelle überhaupt beschrieben wird: die
 * automatische Ahndung eines falschen Geräts legt ihre Zeile in `entryFulfilment.ts` direkt an. Sie
 * durchläuft bewusst keinen Urteilsschritt — sie wird sofort als erledigt geschrieben.)
 *
 * `taskId` ist Pflicht-Argument, nicht optional: der Freitext-Weg muss eine frühere Strafaufgabe
 * ausdrücklich mit `null` lösen. Als optionales Feld liess er sie stehen, und ein verworfenes
 * Vergehen behielt eine Aufgabe, die das Schema ausdrücklich ausschliesst.
 *
 * Wird eine bestehende Strafaufgabe ersetzt, ZIEHT sie diese Funktion zurück. Sonst liefe die alte
 * beim Sub weiter, und wenn ihre Frist verstreicht, erzeugt sie als „nicht erfüllte Aufgabe" ein
 * neues Vergehen — die Korrektur eines Urteils würde ein Vergehen erfinden.
 *
 * `allowRevision` entscheidet zwischen `upsert` und `create` (Begründung bei
 * {@link JudgeOffenseParams.allowRevision}). Der `create` wirft bei bestehendem Urteil P2002 auf
 * `refId` — mitten in der Transaktion, die damit samt dem Aufgaben-Rückzug darüber zurückrollt. Das
 * Einfangen und Übersetzen ist Sache des Aufrufers, der die Transaktion aufspannt.
 */
async function writeJudgment(
  tx: Prisma.TransactionClient,
  p: {
    userId: string; offense: DetectedOffense; now: Date;
    status: "PUNISHED" | "DISMISSED"; reason: string | null;
    actor: MessageActor; taskId: string | null; allowRevision: boolean;
  },
): Promise<{ id: string }> {
  await withdrawLinkedTask(tx, p.offense.refId, p.userId, p.now);

  const data = {
    status: p.status, reason: p.reason, judgedBy: judgedByFromActor(p.actor),
    erledigtAt: null, bestraftDatum: p.now, taskId: p.taskId,
  };
  const create = { userId: p.userId, offenseType: p.offense.offenseType, refId: p.offense.refId, ...data };
  return p.allowRevision
    ? tx.strafeRecord.upsert({ where: { refId: p.offense.refId }, create, update: data, select: { id: true } })
    : tx.strafeRecord.create({ data: create, select: { id: true } });
}

/**
 * Übersetzt den P2002 eines `create`-Urteils (siehe {@link writeJudgment}) in seinen Fehler-Code —
 * `null`, wenn es ein anderer Fehler war und der Aufrufer ihn weiterwerfen muss.
 *
 * Geteilt von {@link judgeOffense} und {@link punishWithTask}: beide schreiben dasselbe Urteil, und
 * beide müssen denselben Konflikt gleich beantworten. Genau diese Doppelung war der Grund, warum die
 * Aufgaben-Route bisher an der Schranke vorbeilief — sie stand nur an einem der beiden Wege.
 */
function judgmentConflict(e: unknown): ServiceFailure | null {
  return isUniqueConstraintOn(e, "refId") ? serviceFail(409, "JUDGMENT_ALREADY_EXISTS") : null;
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
 * Fällt/aktualisiert ein Urteil über ein erkanntes Vergehen (per refId).
 * - dismiss: markiert DISMISSED (verbindlich), text = optionaler Grund.
 * - punish: markiert PUNISHED, text = Strafe (erforderlich), erledigtAt = null (offen).
 * - complete: setzt erledigtAt auf einer bestehenden Strafe (Loop schliessen) — idempotent.
 * - uncomplete: nimmt erledigtAt wieder weg (Loop erneut öffnen).
 * - reopen: entfernt das Urteil (revidieren) samt seiner Strafaufgabe und der Verwerfungs-Meldung.
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
    //
    // AUCH EINE BEREITS ERFÜLLTE: `withdrawLinkedTask` filtert nur auf `withdrawnAt: null`, nicht
    // auf den Fortschritt, und `withdrawnAt` schlägt in der Anzeige jeden anderen Zustand — eine
    // sichtbar erledigte Aufgabe wird also still zu einer zurückgezogenen. Das ist gewollt und die
    // einzig widerspruchsfreie Wahl: „Rückgängig" LÖSCHT das Urteil, und die Aufgabe war nichts
    // anderes als dessen Vollzugsform. Ohne den Rückzug bliebe beim Sub eine Strafaufgabe ohne
    // Strafe stehen; als „erfüllt" stehen zu lassen behauptete, er habe eine Strafe abgeleistet, die
    // niemand mehr verhängt hat. Was er GETAN hat, ist damit nicht bestritten — der Nachweis bleibt
    // an der Aufgabe. Bestritten ist nur, dass es eine Strafe war.
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

  // Die beiden Richtungen EINES Schalters am bestehenden Urteil — der Loop schliesst sich oder geht
  // wieder auf. Zusammen, weil sie sich nur im geschriebenen Wert unterscheiden; die Schranken
  // davor („gibt es das Urteil, gehört es diesem Träger, ist es überhaupt eine Strafe") sind
  // dieselben.
  if (p.action === "complete" || p.action === "uncomplete") {
    const rec = await prisma.strafeRecord.findUnique({ where: { refId: p.refId } });
    if (!rec || rec.userId !== p.userId) return serviceFail(404, "JUDGMENT_NOT_FOUND");
    if (rec.status !== "PUNISHED") return serviceFail(400, "PENALTY_NOT_PUNISHED");
    const done = p.action === "complete";
    // `rec.erledigtAt ?? now` und nicht `now`: der Zeitpunkt sagt, WANN die Strafe abgeleistet war,
    // nicht wann zuletzt jemand auf den Knopf gedrückt hat. Ein zweiter Klick auf „Als erledigt"
    // (Doppelklick, zweiter Tab, zweiter Keyholder) darf ihn deshalb nicht nach vorne schieben.
    await prisma.strafeRecord.update({
      where: { refId: p.refId },
      data: { erledigtAt: done ? (rec.erledigtAt ?? now) : null },
    });
    return { ok: true, data: { status: "punished", done } };
  }

  const text = p.text?.trim() || null;
  const penaltyTextError = checkPenaltyText(p.action, p.text);
  if (penaltyTextError) return serviceFail(400, penaltyTextError);

  // Die ref stand früher im Fehlertext; sie ist ein Aufrufer-Argument, das der MCP-Agent bereits
  // kennt — ein Code ohne Interpolation genügt und bleibt übersetzbar.
  const found = await resolveDetectedOffense(p.userId, p.refId, now, p.offenseType);
  if (!found.ok) return found;
  const offense = found.data;

  const status = judgmentStatus(p.action);
  // In einer Transaktion, weil das Urteil eine frühere Strafaufgabe zurückziehen kann — zwei
  // Schreibvorgänge, die zusammengehören. `taskId: null`: dieser Weg ist der Freitext, er LÖST eine
  // bestehende Aufgabe vom Urteil, statt sie stillschweigend weiterzuschleppen.
  let record;
  try {
    record = await prisma.$transaction((tx) => writeJudgment(tx, {
      userId: p.userId, offense, now,
      status, reason: text, actor, taskId: null,
      allowRevision: p.allowRevision ?? true,
    }));
  } catch (e) {
    // Bricht der `create` an der Eindeutigkeit von `refId`, hat ein anderes Urteil das Rennen
    // gewonnen — und der Rückzug der Strafaufgabe rollt mit zurück. Nichts angefasst, nichts
    // gemeldet: der Träger bekommt genau eine Auflösung zu genau einem Urteil.
    const conflict = judgmentConflict(e);
    if (conflict) return conflict;
    throw e;
  }

  await notifyJudgment({ userId: p.userId, refId: offense.refId, recordId: record.id, status, reason: text }, actor);
  markLastAction();

  return { ok: true, data: { status: status === "PUNISHED" ? "punished" : "dismissed", done: false } };
}
