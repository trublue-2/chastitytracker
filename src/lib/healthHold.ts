import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { taskAnchor } from "@/lib/tasks";
import { notifyUser, type NotifyContent } from "@/lib/notify";
import { serviceFail, type ServiceResult } from "@/lib/serviceResult";
import type { MessageActor } from "@/lib/messageService";

type Client = Prisma.TransactionClient | typeof prisma;

/**
 * Der Gesundheits-Halt: die eine Bremse, die über allem steht.
 *
 * WAS ER TUT, an einer Stelle gesagt, weil er in acht Modulen greift: solange er läuft, stellt die
 * App dem Träger nichts zu (Auto-Kontrollen, Eskalation, terminierte Direktiven, Wiege-Erinnerung),
 * hebt eine Öffnung keine Sperrzeit auf, und aus der Pausenzeit entsteht kein abgeleitetes Vergehen.
 * Er ist kein Signal an die Keyholderin, sondern ein Schalter — genau diese Verwechslung war der
 * Befund zu Issue #91: das Funktionsmodell führte die Wirkung seit je (`writers: ["admin","mcp"]`,
 * `affects: ["Sperrzeit","Kontrollen","Aufgaben","Auto-Kontrollen"]`), im Code stand sie nie.
 *
 * Die Tabelle kennt nur AKTIV/aufgelöst, kein geplantes Ende: eine Krankheit weiss ihr Ende nicht im
 * Voraus. Wer sie beendet, tut es von Hand — und genau darin liegt die Zusage, dass niemand
 * versehentlich in eine abgelaufene Pause hinein Vergehen sammelt.
 */

/** Höchstens ein aktiver Halt pro Träger — die Invariante lebt hier im Code, nicht im Schema
 *  (kein partieller Unique-Index in SQLite). Jede Mutation läuft durch {@link writeHealthHold}. */
export const HEALTH_HOLD_SELECT = {
  id: true,
  active: true,
  reason: true,
  createdAt: true,
  resolvedAt: true,
} satisfies Prisma.HealthHoldSelect;

export type HealthHoldRow = Prisma.HealthHoldGetPayload<{ select: typeof HEALTH_HOLD_SELECT }>;

/** Der laufende Halt dieses Trägers, oder `null`. */
export async function activeHealthHold(userId: string, client: Client = prisma): Promise<HealthHoldRow | null> {
  return client.healthHold.findFirst({
    where: { userId, active: true },
    orderBy: { createdAt: "desc" },
    select: HEALTH_HOLD_SELECT,
  });
}

/** Läuft gerade eine Pause? Die Kurzform für die Zweige, die den Grund nicht brauchen. */
export async function isHealthHoldActive(userId: string, client: Client = prisma): Promise<boolean> {
  return (await activeHealthHold(userId, client)) !== null;
}

/**
 * Alle Träger mit laufender Pause — EINE Abfrage für einen ganzen Poller-Tick.
 *
 * Der Poller berührt in jedem Tick sieben Zweige (Planung, Zustellung, Eskalation, Verschluss,
 * Orgasmus, Aufgaben, Wiegen) und in jedem davon mehrere Zeilen. Je Zeile zu fragen wären im
 * Minutenraster hunderte Abfragen für eine Antwort, die sich innerhalb eines Ticks nicht ändert.
 */
export async function pausedUserIds(client: Client = prisma): Promise<Set<string>> {
  const rows = await client.healthHold.findMany({ where: { active: true }, select: { userId: true } });
  return new Set(rows.map((r) => r.userId));
}

/**
 * Das Pausen-Set eines Poller-Ticks: durchgereicht, wenn es der Tick schon geladen hat, sonst selbst
 * geholt.
 *
 * Der Default ist die eigentliche Zusage. Jeder Einstiegspunkt des Pollers nimmt das Set optional
 * entgegen; wer es beim Aufruf vergisst, verliert damit eine Abfrage — aber NICHT die Wirkung. Als
 * Pflicht-Parameter wäre die Pause bei der nächsten neuen Aufrufstelle still wieder weg, und genau
 * diese Sorte Auslassung ist der Befund, den dieses Modul behebt.
 */
export async function pausedOrLoad(paused?: ReadonlySet<string>): Promise<ReadonlySet<string>> {
  return paused ?? await pausedUserIds();
}

/** Eine Pausen-SPANNE. `to: null` heisst „läuft noch" — nicht „unbekannt". */
export interface HealthHoldSpan {
  from: Date;
  to: Date | null;
}

/** Die Spannen dieses Trägers, älteste zuerst — die Lese-Seite für jede rückblickende Frage. */
export async function healthHoldSpans(userId: string, client: Client = prisma): Promise<HealthHoldSpan[]> {
  const rows = await client.healthHold.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true, resolvedAt: true },
  });
  return rows.map((r) => ({ from: r.createdAt, to: r.resolvedAt }));
}

/**
 * Lag dieser Zeitpunkt in einer Pause?
 *
 * Rein und ohne Datenbank, damit das Strafbuch die Spannen EINMAL lädt und dann über hunderte
 * Vergehens-Zeilen prüft. Die Grenzen zählen mit: eine Tat in der Sekunde des Einschaltens ist
 * gedeckt — wer eine Pause setzt, meint sie ab jetzt, nicht ab der nächsten Sekunde.
 */
export function isPausedAt(spans: HealthHoldSpan[], at: Date): boolean {
  const t = at.getTime();
  return spans.some((s) => t >= s.from.getTime() && (s.to === null || t <= s.to.getTime()));
}

/** Was ein Schreibvorgang am Halt bewirkt hat — für die Meldung nach dem Commit und den Diff. */
export interface HealthHoldWriteResult {
  /** Der Halt NACH dem Schreiben, oder `null` (aufgehoben bzw. es lief keiner). */
  row: HealthHoldRow | null;
  /** Der Zustand VOR dem Schreiben — die Diff-Grundlage, die der MCP sonst selbst nachlesen müsste
   *  (und zwar VOR dem Auflösen der alten Zeile, sonst zeigte der Diff „war nicht aktiv"). */
  before: { active: boolean; reason: string | null };
  /** Zurückgezogene Kontroll-Anforderungen (nur beim Einschalten). */
  withdrawnInspections: number;
  /** Aufgaben, deren Fristen nachgerückt sind (nur beim Aufheben). */
  shiftedTasks: number;
}

/**
 * Der EINE Schreibweg des Gesundheits-Halts — geteilt von der Keyholder-Oberfläche
 * (`/api/admin/users/[id]/health-hold`) und vom MCP (`set_health_hold`).
 *
 * Er ist mehr als ein Datensatz, und deshalb darf ihn niemand nachbauen: das Einschalten zieht die
 * offenen Kontrollen zurück, das Aufheben rückt die Aufgaben-Fristen um die Pausendauer nach. Wer
 * nur die Zeile schriebe, bekäme einen Halt, der die Hälfte seiner Wirkung nicht hat — und zwar
 * lautlos, weil beides erst Tage später auffällt.
 *
 * Läuft IMMER in der Transaktion des Aufrufers: der MCP schreibt sein Audit im selben `tx`, und ein
 * halb angewandter Halt (Zeile ja, Kontrollen nein) wäre der schlechteste aller Zustände.
 */
export async function writeHealthHold(
  tx: Prisma.TransactionClient,
  userId: string,
  next: { active: boolean; reason: string | null },
  now: Date = new Date(),
): Promise<HealthHoldWriteResult> {
  const current = await activeHealthHold(userId, tx);
  const before = { active: current !== null, reason: current?.reason ?? null };

  // Erst auflösen, dann anlegen — auch beim Einschalten über einen bereits laufenden Halt hinweg
  // (die Keyholderin korrigiert den Grund). Sonst lägen zwei aktive Zeilen, und `activeHealthHold`
  // beantwortete die Frage „seit wann" ab da nach Zufall.
  if (current) {
    await tx.healthHold.updateMany({
      where: { userId, active: true },
      data: { active: false, resolvedAt: now },
    });
  }

  if (!next.active) {
    // Die Fristen holen nach, was die Pause verschluckt hat. Ohne laufenden Halt gibt es nichts
    // nachzuholen — das Aufheben eines nicht laufenden Halts ist ein No-Op, kein Fehler.
    const shiftedTasks = current ? await shiftTaskDeadlines(tx, userId, current.createdAt, now) : 0;
    return { row: null, before, withdrawnInspections: 0, shiftedTasks };
  }

  const row = await tx.healthHold.create({
    data: { userId, active: true, reason: next.reason ?? "" },
    select: HEALTH_HOLD_SELECT,
  });

  // Offene Kontrollen zurückziehen, GEPLANTE eingeschlossen: eine Frist, die der Träger im Bett
  // nicht erfüllen kann, ist keine Frist, sondern ein wartendes Vergehen. Kein Nachholen — dieselbe
  // Entscheidung wie beim Überschneidungs-Schutz und beim Schalter „nur bei Sperrzeit".
  const { count: withdrawnInspections } = await tx.kontrollAnforderung.updateMany({
    where: { userId, entryId: null, fulfilledAt: null, withdrawnAt: null, autoMarkedRemovedAt: null },
    data: { withdrawnAt: now },
  });

  return { row, before, withdrawnInspections, shiftedTasks: 0 };
}

/**
 * Rückt die Fristen der offenen Aufgaben um die Pausendauer nach.
 *
 * Verschoben wird der NULLPUNKT (`wirksamAb`) mitsamt `holdUntil`, nicht jede Frist einzeln — genau
 * wie `deadlineFromDispatch` es bei einer verspäteten Zustellung tut. Kulanzfrist (`startGraceMin`)
 * und Nachweis-Fälligkeiten (`TaskProof.dueOffsetMin`) rechnen relativ zu diesem Nullpunkt und
 * wandern dadurch von selbst mit; sie einzeln anzufassen hiesse, dieselbe Geometrie ein zweites Mal
 * abzuschreiben.
 *
 * Verschoben wird um die Zeit, die DIESE Aufgabe in der Pause verloren hat — bei einer während der
 * Pause gestellten also weniger als die volle Pausendauer. Sonst bekäme eine Aufgabe, die zwei
 * Minuten vor dem Aufheben entstand, eine um Tage verschobene Frist geschenkt.
 *
 * NUR bereits ZUGESTELLTE Aufgaben: was der Poller noch nicht ausgeliefert hat, verschiebt er bei
 * der Zustellung selbst (`deadlineFromDispatch`). Beides zusammen verschöbe doppelt.
 */
async function shiftTaskDeadlines(
  tx: Prisma.TransactionClient,
  userId: string,
  pauseStart: Date,
  now: Date,
): Promise<number> {
  const open = await tx.task.findMany({
    where: {
      userId,
      withdrawnAt: null,
      resultNotifiedAt: null,
      benachrichtigtAt: { not: null },
      // Eine Aufgabe, deren Frist schon VOR der Pause abgelaufen war, hat mit ihr nichts zu tun.
      holdUntil: { gt: pauseStart },
    },
    select: { id: true, createdAt: true, wirksamAb: true, holdUntil: true },
  });

  for (const task of open) {
    const lostFrom = Math.max(pauseStart.getTime(), task.createdAt.getTime());
    const shiftMs = now.getTime() - lostFrom;
    if (shiftMs <= 0) continue;
    await tx.task.update({
      where: { id: task.id },
      data: {
        wirksamAb: new Date(taskAnchor(task).getTime() + shiftMs),
        holdUntil: new Date(task.holdUntil.getTime() + shiftMs),
      },
    });
  }
  return open.length;
}

/**
 * Der Halt, wie ihn die Keyholder-Oberfläche setzt: Transaktion, Meldung, Fehler-Code.
 *
 * Der MCP ruft {@link writeHealthHold} direkt, weil er seine eigene Transaktion braucht (das Audit
 * gehört in dieselbe). Beide Wege teilen sich damit die WIRKUNG, ohne dass einer dem anderen seine
 * Rahmen aufzwingt — dieselbe Zweiteilung wie zwischen `checkTask()` und `writeTask()`.
 */
export async function setHealthHold(params: {
  userId: string;
  active: boolean;
  reason: string | null;
  /** Wer geschaltet hat — Benutzername der Keyholderin. Steht als Absender an der Meldung. */
  actor: MessageActor;
}): Promise<ServiceResult<{ active: boolean; withdrawnInspections: number; shiftedTasks: number }>> {
  const reason = params.reason?.trim() || null;
  // Grund ist Pflicht — wie im MCP. Nur beim AUFHEBEN nicht: das Ende einer Pause erklärt sich selbst.
  if (params.active && !reason) return serviceFail(400, "HEALTH_HOLD_REASON_REQUIRED");

  const written = await prisma.$transaction((tx) =>
    writeHealthHold(tx, params.userId, { active: params.active, reason }),
  );

  // Nach dem Commit, nicht darin: eine Meldung über eine Pause, die die Transaktion am Ende nicht
  // gesetzt hat, wäre schlimmer als keine.
  await notifyUser(params.userId, healthHoldNotice(params.active, reason, params.actor));

  return {
    ok: true,
    data: {
      active: params.active,
      withdrawnInspections: written.withdrawnInspections,
      shiftedTasks: written.shiftedTasks,
    },
  };
}

/**
 * Die Meldung an den Träger — er ist der Einzige, für den sich durch die Pause etwas ÄNDERT.
 *
 * Ohne sie wäre die Pause für ihn ununterscheidbar von einem Defekt: die Kontrollen bleiben aus, das
 * Schloss lässt sich öffnen, und niemand hat es ihm gesagt. Der Grund gehört in die Meldung, weil er
 * die Frage beantwortet, die er sonst der Keyholderin stellt.
 */
export function healthHoldNotice(
  active: boolean,
  reason: string | null,
  actor: MessageActor,
): NotifyContent {
  return {
    subjectKey: active ? "healthHoldStartedSubject" : "healthHoldEndedSubject",
    messageKey: active ? "healthHoldStartedMessage" : "healthHoldEndedMessage",
    params: active ? { reason: reason ?? "" } : {},
    // Wie bei Kontroll- und Verschluss-Direktiven: eine Pflicht, die ausgesetzt oder wieder
    // aufgenommen wird, ist keine abschaltbare Nachricht.
    alwaysNotify: true,
    inbox: { actor },
  };
}
