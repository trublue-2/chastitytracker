import { prisma } from "@/lib/prisma";
import {
  RELEASE_AVERAGE_DAYS_RANGE, RELEASE_MIN_MEASUREMENTS_RANGE, RELEASE_STEP_KG_RANGE,
  RELEASE_WINDOW_HOURS_RANGE, weightTrackingEnabled,
} from "@/lib/constants";
import { serviceErrors, mapServiceError, type ServiceResult } from "@/lib/serviceResult";
import { dayNumber, isUnderweightTarget, weightDayKey, weightProblem } from "@/lib/weight";
import { APP_TZ, clamp } from "@/lib/utils";
import { evaluateRelease, isReleaseDirection, thresholdOn, type ReleaseEvaluation } from "@/lib/weightRelease";
import { movingAverage, type WeightPoint } from "@/lib/weightSeries";
import { createOrgasmusAnforderung } from "@/lib/orgasmusAnforderungService";
import { notifyUser, notifyControllers } from "@/lib/notify";
import { getControllersOfUser } from "@/lib/keyholder";
import { weightForDisplay, type UnitSystem } from "@/lib/weight";
import type { MessageActor } from "@/lib/messageService";

/**
 * Die Freigabe-Vorgabe als Vorgang: stellen, zurückziehen, auswerten
 * (docs/gewicht-freigabe-konzept.md).
 *
 * Die RECHNUNG steht in `weightRelease.ts` und ist datenbankfrei; hier liegt alles, was den Bestand
 * braucht — die Messreihe, der Gesundheits-Halt, die offene Anforderung und das Schreiben. Derselbe
 * Schnitt wie zwischen `checkTask()` und `writeTask()`.
 */

const { table: ERRORS, fail } = serviceErrors({
  USER_NOT_FOUND: { status: 404, error: "USER_NOT_FOUND" },
  WEIGHT_TRACKING_DISABLED: { status: 403, error: "WEIGHT_TRACKING_DISABLED" },
  WEIGHT_OUT_OF_RANGE: { status: 400, error: "WEIGHT_OUT_OF_RANGE" },
  HEIGHT_OUT_OF_RANGE: { status: 400, error: "HEIGHT_OUT_OF_RANGE" },
  RELEASE_INVALID_DIRECTION: { status: 400, error: "RELEASE_INVALID_DIRECTION" },
  RELEASE_NOT_BEFORE_MUST_BE_FUTURE: { status: 400, error: "RELEASE_NOT_BEFORE_MUST_BE_FUTURE" },
  RELEASE_TOO_MANY_MEASUREMENTS: { status: 400, error: "RELEASE_TOO_MANY_MEASUREMENTS" },
  RELEASE_UNDERWEIGHT: { status: 400, error: "RELEASE_UNDERWEIGHT" },
  NOT_FOUND: { status: 404, error: "NOT_FOUND" },
});

export interface SetWeightReleaseParams {
  userId: string;
  /** Schwelle in KILOGRAMM — die Umrechnung aus Pfund macht der Aufrufer, wie überall im Feature. */
  thresholdKg: number;
  direction?: string;
  averageDays?: number;
  minMeasurements?: number;
  stepKg?: number;
  /** Frühester Zeitpunkt, ab dem die Vorgabe öffnen kann. */
  notBeforeAt: string | Date;
  windowHours?: number;
  openingAllowed?: boolean;
  message?: string | null;
}

/** Die Felder, die eine Anzeige der Vorgabe braucht. */
export const WEIGHT_RELEASE_SELECT = {
  id: true, thresholdKg: true, direction: true, averageDays: true, minMeasurements: true,
  stepKg: true, notBeforeAt: true, windowHours: true, openingAllowed: true, message: true,
  armedAt: true, createdAt: true, createdBy: true,
} as const;

/** Die offene Vorgabe eines Subs — `null`, wenn keine steht. Eine je Sub (siehe {@link setWeightRelease}). */
export async function openWeightRelease(userId: string) {
  if (!weightTrackingEnabled()) return null;
  return prisma.weightRelease.findFirst({
    where: { userId, releasedAt: null, withdrawnAt: null },
    orderBy: { createdAt: "desc" },
    select: WEIGHT_RELEASE_SELECT,
  });
}

/**
 * Stellt eine Vorgabe. Eine offene wird dabei zurückgezogen — eine je Sub, wie bei der
 * `OrgasmusAnforderung`: zwei Bedingungen, die dasselbe Fenster öffnen, wären für den Träger nicht
 * mehr lesbar.
 *
 * `armedAt = jetzt` ist der Bezugspunkt des Tagesanstiegs. Er wird NICHT auf `notBeforeAt` gelegt:
 * die Schwelle soll ab dem Stellen laufen, sonst stünde sie während der ganzen Mindestlaufzeit
 * still und spränge am ersten zählenden Tag.
 */
export async function setWeightRelease(
  params: SetWeightReleaseParams,
  actor: MessageActor,
): Promise<ServiceResult<{ id: string }>> {
  try {
    if (!weightTrackingEnabled()) throw fail("WEIGHT_TRACKING_DISABLED");
    const { userId } = params;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { weightTrackingEnabled: true, heightCm: true },
    });
    if (!user) throw fail("USER_NOT_FOUND");
    if (!user.weightTrackingEnabled) throw fail("WEIGHT_TRACKING_DISABLED");

    const direction = params.direction ?? "below";
    if (!isReleaseDirection(direction)) throw fail("RELEASE_INVALID_DIRECTION");

    // Über `weightProblem`, nicht über eine eigene Bereichsprüfung: es ist dieselbe Frage wie beim
    // Messwert und beim Zielgewicht („Zahlendreher oder falsch gelesene Waage"), und eine zweite
    // Fassung liefe irgendwann anders.
    const thresholdKg = params.thresholdKg;
    const problem = weightProblem(thresholdKg);
    if (problem) throw fail(problem);
    // Dieselbe Schranke wie beim Zielgewicht: eine Vorgabe, die ins Untergewicht führt, wird nicht
    // gestellt. Bei `below` ist die Schwelle die niedrigste Zahl der Vorgabe — bei `above` ist sie
    // die Untergrenze, unter der er bleiben DARF, und dann ist es dieselbe Frage.
    if (isUnderweightTarget(thresholdKg, user.heightCm)) throw fail("RELEASE_UNDERWEIGHT");

    const notBeforeAt = new Date(params.notBeforeAt);
    if (Number.isNaN(notBeforeAt.getTime())) throw fail("RELEASE_NOT_BEFORE_MUST_BE_FUTURE");
    const now = new Date();
    if (notBeforeAt <= now) throw fail("RELEASE_NOT_BEFORE_MUST_BE_FUTURE");

    const averageDays = clamp(params.averageDays ?? RELEASE_AVERAGE_DAYS_RANGE.fallback, RELEASE_AVERAGE_DAYS_RANGE);
    const minMeasurements = clamp(params.minMeasurements ?? RELEASE_MIN_MEASUREMENTS_RANGE.fallback, RELEASE_MIN_MEASUREMENTS_RANGE);
    // Mehr Messungen zu verlangen, als das Fenster Tage hat, ist unerfüllbar — und zwar still: die
    // Vorgabe stünde da und könnte nie greifen. Lieber eine Absage beim Stellen.
    if (minMeasurements > averageDays) throw fail("RELEASE_TOO_MANY_MEASUREMENTS");

    // `clamp` rundet auf ganze Zahlen — der Anstieg ist aber ein halbes Kilo, also hier von Hand,
    // mit derselben Quelle für die Grenzen. Die Finite-Prüfung ist nicht Zierde: der Body kommt roh
    // aus der Route, und `Math.max(0, Math.min(5, "abc"))` ist NaN — das landete als NaN in einer
    // Float-Spalte und machte jede spätere Schwellen-Rechnung still unbrauchbar.
    const rawStep = Number(params.stepKg ?? 0);
    const stepKg = Number.isFinite(rawStep)
      ? Math.min(RELEASE_STEP_KG_RANGE.max, Math.max(RELEASE_STEP_KG_RANGE.min, rawStep))
      : 0;

    const created = await prisma.$transaction(async (tx) => {
      await tx.weightRelease.updateMany({
        where: { userId, releasedAt: null, withdrawnAt: null },
        data: { withdrawnAt: now },
      });
      return tx.weightRelease.create({
        data: {
          userId,
          thresholdKg,
          direction,
          averageDays,
          minMeasurements,
          stepKg,
          notBeforeAt,
          windowHours: clamp(params.windowHours ?? RELEASE_WINDOW_HOURS_RANGE.fallback, RELEASE_WINDOW_HOURS_RANGE),
          openingAllowed: Boolean(params.openingAllowed),
          message: params.message?.trim() || null,
          createdBy: actor ?? null,
          armedAt: now,
        },
        select: { id: true },
      });
    });

    await notifyWeightRelease(userId, "Set");
    return { ok: true, data: created };
  } catch (e) {
    const mapped = mapServiceError(e, ERRORS);
    if (mapped) return mapped;
    throw e;
  }
}

/** Zieht die offene Vorgabe zurück. Ohne offene Vorgabe ist es kein Fehler, sondern ein No-Op mit
 *  `count: 0` — dieselbe Konvention wie beim Rückzug der Orgasmus-Anweisung. */
export async function withdrawWeightRelease(userId: string): Promise<ServiceResult<{ count: number }>> {
  const { count } = await prisma.weightRelease.updateMany({
    where: { userId, releasedAt: null, withdrawnAt: null },
    data: { withdrawnAt: new Date() },
  });
  if (count > 0) await notifyWeightRelease(userId, "Withdrawn");
  return { ok: true, data: { count } };
}

/** Meldung an den Träger. Über i18n-SCHLÜSSEL, nicht über fertigen Text: `notifyUser` löst sie in
 *  der Sprache des Empfängers auf — Posteingang, Mail und Push in einem. */
async function notifyWeightRelease(userId: string, event: "Set" | "Withdrawn"): Promise<void> {
  await notifyUser(userId, {
    subjectKey: `weightRelease${event}Subject`,
    messageKey: `weightRelease${event}Message` as "weightReleaseSetMessage" | "weightReleaseWithdrawnMessage",
  });
}

export interface ReleaseStatus extends ReleaseEvaluation {
  release: NonNullable<Awaited<ReturnType<typeof openWeightRelease>>>;
  /** Die Schwelle des FOLGETAGS — nur gesetzt, wenn sie sich bewegt (`stepKg > 0`). */
  nextThresholdKg: number | null;
}

/**
 * Der Stand der offenen Vorgabe: Mittel, Schwelle, was noch fehlt. Für jede Anzeige (Dashboard des
 * Trägers, „Meine Regeln", Keyholder-Dashboard, MCP) — **eine** Ableitung, damit die Zahl, gegen die
 * er rechnet, dieselbe ist, die auch öffnet.
 */
export async function weightReleaseStatus(userId: string, now: Date = new Date()): Promise<ReleaseStatus | null> {
  const release = await openWeightRelease(userId);
  if (!release) return null;
  const [user, points] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } }),
    countingPoints(userId, release.averageDays, now),
  ]);
  const tz = user?.timezone || APP_TZ;
  const evaluation = evaluateRelease(release, points, now, tz);
  return {
    ...evaluation,
    release,
    nextThresholdKg: release.stepKg > 0
      ? thresholdOn(release, weightDayKey(new Date(now.getTime() + 86_400_000), tz), tz)
      : null,
  };
}

/**
 * Die ZÄHLENDEN Messungen des Mittel-Fensters: nur innerhalb der Wiege-Fenster gemessene.
 *
 * Ohne diesen Filter ginge ein abends nach dem Essen gemessener Wert ins Mittel, und die Freigabe
 * misst die Tageszeit mit — derselbe Grund, aus dem die Trendlinie des Diagramms ihn zieht. Führt
 * der Sub gar keine Wiege-Fenster, ist `inWindow` ohnehin bei jeder Messung wahr.
 */
async function countingPoints(userId: string, averageDays: number, now: Date): Promise<WeightPoint[]> {
  // Grosszügig gefasst statt tagesgenau: die Auswahl über `measuredAt` muss die Zeitzone des
  // Trägers nicht kennen, und `evaluateRelease` schneidet über die Tagesschlüssel ohnehin exakt zu.
  const from = new Date(now.getTime() - (averageDays + 2) * 86_400_000);
  return prisma.weightEntry.findMany({
    where: { userId, inWindow: true, measuredAt: { gte: from } },
    orderBy: { measuredAt: "asc" },
    select: { dayKey: true, weightKg: true, inWindow: true },
  });
}

/**
 * Dass die Vorgabe gegriffen hat, geht an die KEYHOLDER — der Träger erfährt es über die
 * Orgasmus-Anforderung, die im selben Zug entsteht, und zwei Meldungen im selben Moment wären
 * dieselbe Nachricht zweimal.
 *
 * Die Einheit ist die des TRÄGERS: die Zeile geht an mehrere Empfänger, die verschiedene Einheiten
 * führen könnten, und der Text steht in der Nachricht, nicht in ihrer Ansicht (Muster
 * `announceTargetEvent`).
 */
async function announceRelease(userId: string, status: ReleaseStatus): Promise<void> {
  // Beim Auslösen liegt immer ein Mittel vor (ohne eines gäbe es kein `released`). Trotzdem
  // ausdrücklich: ein `?? 0` schriebe im Fehlerfall „0 kg im Mittel" in den Posteingang der
  // Keyholder — eine Zahl, die nie gemessen wurde.
  if (status.averageKg === null) return;
  const [user, controllers] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { username: true, unitSystem: true } }),
    getControllersOfUser(userId),
  ]);
  if (!user) return;
  const unit = (user.unitSystem as UnitSystem) ?? "metric";
  const suffix = unit === "imperial" ? "lbs" : "kg";
  await notifyControllers(userId, controllers, {
    subjectKey: "weightReleaseOpenedSubjectKeyholder",
    messageKey: "weightReleaseOpenedMessageKeyholder",
    params: {
      username: user.username,
      average: `${weightForDisplay(status.averageKg, unit)} ${suffix}`,
      threshold: `${weightForDisplay(status.thresholdKg, unit)} ${suffix}`,
    },
  });
}

/**
 * Sein Mittel der letzten `days` Tage — für das Formular, in dem noch gar keine Vorgabe steht.
 *
 * Dasselbe Kalender-Fenster und dieselben zählenden Messungen wie in der echten Auswertung, damit
 * die Zahl, gegen die die Keyholderin ihre Schwelle setzt, die Zahl ist, die später entscheidet.
 * **`null`, wenn die letzten Tage leer sind** — ein Mittel aus alten Werten wäre die gefährlichere
 * Auskunft: es stünde als „heute" da, während er seit einer Woche nicht auf der Waage war.
 */
export async function currentWeightAverage(
  userId: string,
  days: number,
  now: Date = new Date(),
): Promise<{ averageKg: number; measurements: number } | null> {
  const [user, points] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } }),
    countingPoints(userId, days, now),
  ]);
  const tz = user?.timezone || APP_TZ;
  const today = dayNumber(weightDayKey(now, tz));
  const inWindow = points.filter((p) => {
    const n = dayNumber(p.dayKey);
    return n > today - days && n <= today;
  });
  if (inWindow.length === 0) return null;
  const trend = movingAverage(inWindow, days);
  return { averageKg: trend[trend.length - 1].weightKg, measurements: inWindow.length };
}

/**
 * Prüft nach einer neuen Messung, ob die Vorgabe greift — und öffnet dann das Fenster.
 *
 * Aufgerufen aus `recordWeight()`, NUR bei der ersten Messung des Tages (`replaced === false`).
 * Der Grund steht im Konzept, Abschnitt 6: wer nachwiegt, könnte sonst so lange wiegen, bis das
 * Mittel passt. Eine Korrektur wirkt deshalb erst ab dem Folgetag mit.
 *
 * Zwei Schranken, die nur der Bestand beantworten kann und die deshalb hier stehen statt im
 * Rechenkern:
 * - **Gesundheits-Halt:** ist einer aktiv, ruht die Vorgabe. Dieselbe Stelle, an der auch die
 *   Meldepflicht pausiert.
 * - **Offene Anforderung:** dann feuert die Vorgabe nicht und bleibt stehen. Sie würde die offene
 *   sonst verdrängen (`createOrgasmusAnforderung` zieht offene Zeilen zurück) — eine Anweisung der
 *   Keyholderin darf eine Automatik nicht wegräumen.
 */
export async function applyWeightRelease(userId: string, now: Date = new Date()): Promise<{ releasedId: string } | null> {
  const status = await weightReleaseStatus(userId, now);
  if (!status?.released) return null;

  const [hold, openRequest] = await Promise.all([
    prisma.healthHold.findFirst({ where: { userId, active: true }, select: { id: true } }),
    prisma.orgasmusAnforderung.findFirst({
      where: { userId, fulfilledAt: null, withdrawnAt: null },
      select: { id: true },
    }),
  ]);
  if (hold || openRequest) return null;

  const created = await createOrgasmusAnforderung({
    userId,
    // GELEGENHEIT, nicht ANWEISUNG: die Freigabe ist ein Preis, keine Pflicht. Ungenutzt bleibt sie
    // folgenlos — eine ANWEISUNG würde daraus ein `missed_orgasm`-Vergehen machen.
    art: "GELEGENHEIT",
    nachricht: status.release.message,
    beginntAt: now,
    endetAt: new Date(now.getTime() + status.release.windowHours * 3600_000),
    oeffnenErlaubt: status.release.openingAllowed,
  }, "system");
  if (!created.ok) return null;

  const { count } = await prisma.weightRelease.updateMany({
    // Über `updateMany` mit derselben Bedingung wie beim Lesen: liefen zwei Erfassungen gleichzeitig,
    // markiert die zweite eine bereits verbrauchte Zeile nicht noch einmal.
    where: { id: status.release.id, releasedAt: null, withdrawnAt: null },
    data: { releasedAt: now, releasedRequestId: created.data.id },
  });

  // Nur wer die Zeile TATSÄCHLICH verbraucht hat, meldet — sonst stünde die Nachricht bei einem
  // Wettlauf zweimal im Posteingang der Keyholder.
  if (count > 0) await announceRelease(userId, status);
  return { releasedId: created.data.id };
}
