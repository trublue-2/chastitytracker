import { prisma } from "@/lib/prisma";
import { clamp, formatDateTime, APP_TZ } from "@/lib/utils";
import { INSPECTION_JOKER_MINUTES_RANGE, INSPECTION_JOKER_REASON_MAX_LENGTH } from "@/lib/constants";
import { markLastAction } from "@/lib/appMeta";
import { notifyControllers } from "@/lib/notify";
import { getControllerAudience } from "@/lib/keyholder";
import { serviceErrors, mapServiceError, serviceFail, type ServiceResult } from "@/lib/serviceResult";
import { extendInspectionProblem, inspectionDeadlineWrite } from "@/lib/inspectionDeadline";
import {
  AUTO_KONTROLLE_SETTINGS_SELECT, autoKontrolleSettingsFromUser, isEntryTriggeredInspection, isSleepingAt,
  minutesUntilSleep, type AutoKontrolleSettings, type AutoKontrolleUserFields,
} from "@/lib/autoKontrolleService";

/*
 * Der Fristen-Joker: der Träger verschiebt eine laufende Kontrollfrist selbst, BEVOR sie abläuft.
 *
 * Die Keyholderin vergibt ein Guthaben (`User.inspectionJokerBalance`, 0 = aus) und legt den Aufschub
 * fest (`inspectionJokerMinutes`). Jeder Einsatz kostet einen Joker, je Kontrolle höchstens einen.
 *
 * Nur VOR Fristende, und das ist der Kern der Regel: das Strafbuch leitet „zu spät" live aus der
 * aktuellen Frist ab. Ein Joker nach Ablauf hiesse, die Frist hinter den Verstoss zu schieben — der
 * Träger erliesse sich das Vergehen selbst. Nachträglich bleibt der Weg über die Keyholderin.
 *
 * Kein Joker für die Kontrollen nach einer Reinigungspause oder einem Verschluss
 * (`isEntryTriggeredInspection`): sie belegen, dass er GERADE wieder zu ist; aufgeschoben belegten sie
 * nichts mehr.
 */

/** Die User-Spalten, die der Joker liest — eine Quelle für jeden Lader (Dashboard, Dienst, Poller,
 *  Kontroll-Anforderung, MCP). */
export const INSPECTION_JOKER_USER_SELECT = {
  inspectionJokerBalance: true, inspectionJokerMinutes: true,
} as const;

/** Unter so viel Aufschub — nach dem Kappen am Schlaf-Fenster — wird der Joker nicht angeboten: er
 *  kostete einen Joker für eine Frist, die praktisch gleich bleibt. */
export const INSPECTION_JOKER_MIN_GAIN_MINUTES = 15;

interface JokerInspection {
  deadline: Date;
  entryId: string | null;
  withdrawnAt: Date | null;
  autoMarkedRemovedAt: Date | null;
  wirksamAb: Date | null;
  benachrichtigtAt: Date | null;
  cleaningRelock: boolean;
  postLock: boolean;
  /** Die Frist vor einem Joker-Einsatz — gesetzt heisst zugleich „für diese Kontrolle verbraucht". */
  jokerPreviousDeadline: Date | null;
}

interface JokerUser {
  inspectionJokerBalance: number;
  inspectionJokerMinutes: number;
}

const MINUTE_MS = 60_000;

/**
 * Die Frist, auf die ein Joker JETZT verschöbe — oder `null`, wenn er nicht angeboten wird.
 *
 * Rein und schreibfrei: der Knopf im Dashboard, der Dienst und die MCP-Sicht fragen DIESE Funktion,
 * damit der Knopf nie einen Einsatz anbietet, den der Dienst ablehnt.
 *
 * Schlaf-Fenster: Liegt die alte Frist im Wachen, endet die neue spätestens mit dem Beginn des nächsten
 * Schlafs — dieselbe Absicht, mit der die Auto-Kontrollen ihre Fristen kappen. Liegt sie schon im Schlaf (eine
 * manuelle Kontrolle darf das), wird nicht gekappt: dort hat die Keyholderin bewusst entschieden.
 */
export function jokerDeadline(
  ka: JokerInspection,
  user: JokerUser,
  sleep: AutoKontrolleSettings,
  now: Date,
  tz: string,
): Date | null {
  // `> 0` statt `<= 0` verneint: ein fehlendes Guthaben (`undefined`, z.B. ein schmaler Select) heisst
  // „kein Joker", nicht „unbegrenzt".
  if (!(user.inspectionJokerBalance > 0)) return null;
  if (ka.jokerPreviousDeadline || isEntryTriggeredInspection(ka)) return null;
  if (ka.deadline.getTime() <= now.getTime()) return null;

  const configured = clamp(user.inspectionJokerMinutes, INSPECTION_JOKER_MINUTES_RANGE);
  // Die neue Frist fällt AUF den Schlaf-Beginn: bis dahin muss die Kontrolle stehen. Eine Minute
  // früher (wie bei den Auto-Kontrollen, die auf einem Minuten-Raster planen) gäbe hier nur krumme
  // Aufschübe wie „+29 min".
  const minutes = isSleepingAt(sleep, ka.deadline, tz)
    ? configured
    : Math.min(configured, minutesUntilSleep(sleep, ka.deadline, tz, configured));
  if (minutes < INSPECTION_JOKER_MIN_GAIN_MINUTES) return null;

  const newDeadline = new Date(ka.deadline.getTime() + minutes * MINUTE_MS);
  // Erfüllt, zurückgezogen, gebucht oder noch nicht zugestellt — dieselbe Schranke wie die
  // Verlängerung durch die Keyholderin, nicht eine zweite daneben.
  return extendInspectionProblem(ka, newDeadline, now) ? null : newDeadline;
}

/** Was das Dashboard für EINE Kontrolle anbietet — fehlt es, gibt es keinen Knopf. */
export interface InspectionJokerOffer {
  /** Die Frist NACH dem Einsatz, schon am Schlaf-Fenster gekappt. ISO, weil sie in den Client geht. */
  newDeadline: string;
  /** Tatsächlicher Aufschub in Minuten — nach dem Kappen kann er kürzer sein als eingestellt. */
  minutes: number;
  /** Verbleibende Joker VOR dem Einsatz. */
  balance: number;
}

/** {@link jokerDeadline} in der Form, die der Knopf braucht. */
export function jokerOffer(
  ka: JokerInspection,
  user: JokerUser & AutoKontrolleUserFields,
  now: Date,
  tz: string,
): InspectionJokerOffer | null {
  const next = jokerDeadline(ka, user, autoKontrolleSettingsFromUser(user), now, tz);
  if (!next) return null;
  return {
    newDeadline: next.toISOString(),
    minutes: Math.round((next.getTime() - ka.deadline.getTime()) / MINUTE_MS),
    balance: user.inspectionJokerBalance,
  };
}

/** Ein Grund aus dem Formular: getrimmt, gekürzt, leer = keiner. */
export function normalizeJokerReason(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().slice(0, INSPECTION_JOKER_REASON_MAX_LENGTH);
  return trimmed || null;
}

/** Abbruch der Transaktion, wenn zwischen Lesen und Schreiben etwas anderes gewonnen hat. */
const { table: ERRORS, fail } = serviceErrors({
  INSPECTION_JOKER_UNAVAILABLE: { status: 400, error: "INSPECTION_JOKER_UNAVAILABLE" },
});

/**
 * Setzt einen Joker für die Kontrolle `id` des Trägers `userId` ein.
 *
 * Beide Schreibzugriffe sind BEDINGT und laufen in einer Transaktion: die Kontrolle nur, solange sie
 * offen ist, noch keinen Joker trägt und ihre Frist unverändert und nicht abgelaufen ist; das
 * Guthaben nur, solange es über 0 liegt. Ein Doppelklick, eine parallel eingereichte Kontrolle oder
 * eine gerade ablaufende Frist ergeben so nie zwei Joker oder einen Joker ohne Guthaben.
 *
 * Gemeldet wird der KEYHOLDERIN, nicht dem Träger: er hat den Knopf selbst gedrückt.
 */
export async function spendInspectionJoker(
  id: string,
  userId: string,
  reason: string | null,
): Promise<ServiceResult<{ deadline: Date; balance: number }>> {
  const ka = await prisma.kontrollAnforderung.findUnique({
    where: { id },
    include: { user: { select: { ...AUTO_KONTROLLE_SETTINGS_SELECT, ...INSPECTION_JOKER_USER_SELECT } } },
  });
  // Eine fremde Kontrolle ist für diesen Träger dieselbe wie eine, die es nicht gibt.
  if (!ka || ka.userId !== userId) return serviceFail(404, "INSPECTION_NOT_FOUND");

  const now = new Date();
  const tz = ka.user.timezone ?? APP_TZ;
  const newDeadline = jokerDeadline(ka, ka.user, autoKontrolleSettingsFromUser(ka.user), now, tz);
  if (!newDeadline) return serviceFail(400, "INSPECTION_JOKER_UNAVAILABLE");

  let balance: number;
  try {
    balance = await prisma.$transaction(async (tx) => {
      // Dasselbe bedingte Schreiben wie die Verlängerung durch die Keyholderin, dazu: noch kein
      // Joker, und die Frist ist die gelesene und noch nicht abgelaufen.
      const { count } = await tx.kontrollAnforderung.updateMany(inspectionDeadlineWrite(id, newDeadline, {
        where: { jokerPreviousDeadline: null, deadline: { equals: ka.deadline, gt: now } },
        data: { jokerPreviousDeadline: ka.deadline },
      }));
      if (count === 0) throw fail("INSPECTION_JOKER_UNAVAILABLE");
      const debited = await tx.user.updateMany({
        where: { id: userId, inspectionJokerBalance: { gt: 0 } },
        data: { inspectionJokerBalance: { decrement: 1 } },
      });
      if (debited.count === 0) throw fail("INSPECTION_JOKER_UNAVAILABLE");
      const after = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { inspectionJokerBalance: true } });
      return after.inspectionJokerBalance;
    });
  } catch (e) {
    const mapped = mapServiceError(e, ERRORS);
    if (mapped) return mapped;
    throw e;
  }
  markLastAction();

  const { controllers, username } = await getControllerAudience(userId);
  await notifyControllers(userId, controllers, {
    subjectKey: "inspectionJokerUsedSubjectKeyholder",
    messageKey: reason ? "inspectionJokerUsedReasonMessageKeyholder" : "inspectionJokerUsedMessageKeyholder",
    params: {
      username,
      from: formatDateTime(ka.deadline, undefined, tz),
      to: formatDateTime(newDeadline, undefined, tz),
      balance,
      ...(reason ? { reason } : {}),
    },
    inbox: { ref: { type: "control", id } },
  });

  return { ok: true, data: { deadline: newDeadline, balance } };
}
