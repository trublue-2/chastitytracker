import { prisma } from "@/lib/prisma";
import { LOCK_ENDED_REASON, APP_NAME } from "@/lib/constants";
import { sendMailSafe, escHtml, optionalNoticeBoxHtml, dashboardEmailHtml } from "@/lib/mail";
import { notifyUser, type NotifyContent, type NotifyInbox } from "@/lib/notify";
import { actorColumn, recordMessageAndBadge, type MessageActor } from "@/lib/messageService";
import { notifyHeimdallForUserId } from "@/lib/heimdallNotify";
import { emailT, emailGreeting } from "@/lib/emailI18n";
import { validateDeviceOwnership, getIsLocked, isScheduledDirective } from "@/lib/queries";
import { formatDateTime, formatDurationHours } from "@/lib/utils";
import { firePush } from "@/lib/push";
import { parseTriggerAt, computeDelayedTrigger, isHiddenFromSub } from "@/lib/delayedTrigger";
import { serviceErrors, mapServiceError, serviceFail, type ServiceResult } from "@/lib/serviceResult";

export interface CreateVerschlussAnforderungParams {
  userId: string;
  art: "ANFORDERUNG" | "SPERRZEIT";
  message?: string | null;
  /** Absolute end (ISO string or Date). Takes precedence over fristH. */
  endsAt?: string | Date | null;
  /** Relative deadline/duration in hours, used when endsAt is absent. */
  fristH?: number | null;
  /** ANFORDERUNG only: min wearing duration (h) → inherited by the auto-created SPERRZEIT on lock. */
  minDurationHours?: number | null;
  /** ANFORDERUNG only: absolute lock end (wall clock, ISO string or Date). Taken 1:1 as the
   *  auto-created SPERRZEIT.endsAt on fulfill — a late lock does NOT shift it. Alternative to minDurationHours. */
  lockEndsAt?: string | Date | null;
  deviceId?: string | null;
  cleaningAllowed?: boolean;
  /** Verzögerte Auslösung in Minuten (>0). Fehlt/0 = sofort (sofern kein wirksamAbAt). */
  delayMinutes?: number | null;
  /** Absoluter Versandzeitpunkt (ISO-String oder Date). Hat Vorrang vor delayMinutes. */
  wirksamAbAt?: string | Date | null;
}

/**
 * Ein Sperr-Ende muss nach dem Zeitpunkt liegen, ab dem die Sperre überhaupt gilt — bei einer
 * SOFORTIGEN Sperrzeit ist das jetzt, bei einer TERMINIERTEN der Auslösezeitpunkt.
 *
 * Nur gegen `now` zu prüfen genügt nicht: bei einer drei Wochen voraus geplanten Sperrzeit passiert
 * ein Ende von „morgen" den `> now`-Test, und der Poller meldet dem Sub bei Fälligkeit „Gesperrt bis
 * <20 Tage in der Vergangenheit>" — eine Sperre, die beim Auslösen bereits abgelaufen ist.
 *
 * `wirksamAb` in der Vergangenheit (bereits ausgelöst) zählt als „gilt jetzt", deshalb der
 * `> now`-Vergleich statt eines blossen Null-Checks. `endsAt === null` = unbefristet, immer ok.
 */
export function checkLockEnd(
  endsAt: Date | null,
  wirksamAb: Date | null,
  now: Date,
): "LOCK_PERIOD_END_MUST_BE_FUTURE" | "LOCK_PERIOD_END_MUST_BE_AFTER_TRIGGER" | null {
  if (!endsAt) return null;
  if (wirksamAb && wirksamAb > now) {
    return endsAt > wirksamAb ? null : "LOCK_PERIOD_END_MUST_BE_AFTER_TRIGGER";
  }
  return endsAt > now ? null : "LOCK_PERIOD_END_MUST_BE_FUTURE";
}

/** Die Felder EINER Anforderung, aus denen die mitgebrachte Sperrzeit entsteht. */
export interface LockPeriodFromRequest {
  minDurationHours: number | null;
  lockEndsAt: Date | null;
}

/**
 * Das Ende der Sperrzeit, die diese Anforderung mitbringt — `null` heisst: sie bringt keine mit.
 *
 * Zwei Wege, EINE Regel: ein absolutes Sperr-Ende (`lockEndsAt`, Wanduhr) gewinnt und bleibt fix,
 * egal wann die Sperre zustande kommt; sonst zählt `minDurationHours` ab `abZeitpunkt`. Was dieser Zeitpunkt
 * ist, entscheidet der Aufrufer und ist der einzige Unterschied zwischen den beiden Wegen, auf denen
 * eine Sperrzeit entsteht: beim Erfüllen ist es der Verschluss des Subs (`entryFulfilment.ts`), bei
 * einer terminierten Anforderung, die auf einen bereits verschlossenen Sub trifft, die Auslösung
 * (`kontrollePoller.ts`) — dort wäre der lange zurückliegende Verschluss der falsche Anker: eine
 * 24h-Sperre wäre bei einem seit 30h verschlossenen Sub im Moment ihrer Entstehung schon abgelaufen.
 */
export function lockPeriodEndFromRequest(a: LockPeriodFromRequest, abZeitpunkt: Date): Date | null {
  return a.lockEndsAt ?? (a.minDurationHours ? new Date(abZeitpunkt.getTime() + a.minDurationHours * 60 * 60 * 1000) : null);
}

/**
 * Creates a VerschlussAnforderung (ANFORDERUNG) or Sperrzeit (SPERRZEIT) for a user.
 * Single source of truth shared by POST /api/admin/verschluss-anforderung and the MCP write tool.
 * Validates state in a transaction (TOCTOU-safe), withdraws an existing open one of the same art,
 * and sends the user an e-mail + push notification — identical behaviour from UI or MCP.
 *
 * `actor` ist WER anordnet (Sitzung bzw. {@link AI_AUTHOR}). Ein eigenes ARGUMENT und bewusst kein
 * Feld in `params` — die Begründung steht bei `requestKontrolle` (kontrolleService.ts): die Route
 * reicht den rohen Request-Body durch, und in einem Bag wäre der Absender von aussen setzbar.
 * Wandert in `VerschlussAnforderung.createdBy` und von dort an jede Zustellung (siehe Schema).
 */
export async function createVerschlussAnforderung(
  params: CreateVerschlussAnforderungParams,
  actor: MessageActor,
): Promise<ServiceResult<{ id: string; scheduledFor: string | null }>> {
  const { userId, art, message, endsAt, fristH, minDurationHours, lockEndsAt, deviceId, cleaningAllowed, delayMinutes, wirksamAbAt } = params;

  if (!userId) return serviceFail(400, "USER_ID_REQUIRED");
  if (art !== "ANFORDERUNG" && art !== "SPERRZEIT") {
    return serviceFail(400, "LOCK_INVALID_ART");
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return serviceFail(404, "USER_NOT_FOUND");
  // KEINE E-Mail-Pflicht: der Sub erfährt die Anforderung über den Posteingang
  // (`recordMessageAndBadge`, weiter unten und unbedingt) und über das Banner auf seinem
  // Dashboard, das aus der Zeile selbst kommt. Die Mail ist die Beigabe. Bis v6 stand hier ein
  // `USER_NO_EMAIL`, und es sperrte der Keyholderin die Hauptaktion für jeden Sub ohne Adresse —
  // gemeldet aus dem Betrieb. `kontrolleService` behält seine Prüfung: dort geht ein CODE per
  // Mail, ohne Adresse käme er nirgends an.

  const now = new Date();

  // Der FEHLERCODE bleibt hier, das Parsen teilen sich die Dienste (`parseTriggerAt`).
  const wirksamAbParsed = parseTriggerAt(wirksamAbAt);
  if (wirksamAbParsed === "invalid") return serviceFail(400, "LOCK_INVALID_SEND_TIME");
  const { wirksamAb, benachrichtigtAt } = computeDelayedTrigger(now, { delayMinutes, wirksamAbAt: wirksamAbParsed });

  // endsAt berechnen (Frist zum Einschliessen / Sperrzeit-Ende).
  // Absolute endsAt-Angaben bleiben absolut; relative Frist (fristH) zählt ab dem geplanten
  // Versand (wirksamAb), nicht ab Erstellung.
  let endsAtDate: Date | null = null;
  if (endsAt) {
    endsAtDate = new Date(endsAt);
    if (Number.isNaN(endsAtDate.getTime())) return serviceFail(400, "INVALID_DATETIME");
  } else if (fristH) {
    endsAtDate = new Date((wirksamAb ?? now).getTime() + fristH * 60 * 60 * 1000);
  }
  if (art === "ANFORDERUNG" && !endsAtDate) {
    return serviceFail(400, "LOCK_DEADLINE_REQUIRED");
  }

  // Mindestdauer und absolutes Sperr-Ende schliessen einander aus — dieselbe Regel wie beim Ändern
  // (updateLockRequest). Beides zugleich hiesse: beim Erfüllen gewinnt stumm `lockEndsAt`, und die
  // Stundenangabe verschwindet wirkungslos.
  if (minDurationHours != null && lockEndsAt != null) return serviceFail(400, "LOCK_DURATION_OR_END");

  // Absolutes Sperr-Ende (nur ANFORDERUNG, Alternative zu minDurationHours). Wird beim Fulfill 1:1 zur SPERRZEIT.
  let lockEndsAtDate: Date | null = null;
  if (art === "ANFORDERUNG" && lockEndsAt) {
    lockEndsAtDate = new Date(lockEndsAt);
    if (Number.isNaN(lockEndsAtDate.getTime())) return serviceFail(400, "LOCK_INVALID_LOCK_END");
  }

  // Siehe checkLockEnd(). Geprüft wird das Sperr-Ende: bei der SPERRZEIT ihr `endsAt`, bei der
  // ANFORDERUNG das absolute `lockEndsAt` (das beim Erfüllen 1:1 zum Sperr-Ende wird). Die
  // ANFORDERUNGS-Frist (`endsAt`) bleibt aussen vor — sie ist eine Einschliess-Frist, kein
  // Sperr-Ende, und aus `fristH` ohnehin ab `wirksamAb` gerechnet.
  const effectiveLockEndsAt = art === "SPERRZEIT" ? endsAtDate : lockEndsAtDate;
  const lockEndError = checkLockEnd(effectiveLockEndsAt, wirksamAb, now);
  if (lockEndError) return serviceFail(400, lockEndError);

  if (deviceId && art === "ANFORDERUNG") {
    const device = await validateDeviceOwnership(deviceId, userId);
    if (!device) return serviceFail(400, "INVALID_DEVICE");
  }

  // Wrap state-check + withdraw + create in transaction to prevent TOCTOU race
  let anforderung;
  // Wurf- und Fang-Seite hängen an derselben Tabelle — siehe kontrolleService.
  const { table: ERRORS, fail } = serviceErrors({
    ALREADY_LOCKED: { status: 400, error: "USER_ALREADY_LOCKED" },
    NOT_LOCKED: { status: 400, error: "USER_NOT_LOCKED" },
  });
  try {
    anforderung = await prisma.$transaction(async (tx) => {
      // tx zwingend durchreichen: der Zustands-Check muss in DERSELBEN Transaktion lesen (TOCTOU).
      const isLocked = await getIsLocked(userId, tx);

      // Der Lock-Zustand wird nur gegen eine SOFORT wirksame Direktive geprüft. Eine TERMINIERTE
      // sagt nichts über jetzt, sondern über später: „schliess dich morgen früh ein" ist auch dann
      // sinnvoll, wenn der Sub gerade noch verschlossen ist. Ob die Auslösung dann noch passt,
      // entscheidet der Poller (processDueVerschlussAnforderungen) — er zieht sie als `obsolete`
      // zurück, statt eine unpassende Anweisung zuzustellen.
      if (!wirksamAb) {
        if (art === "ANFORDERUNG" && isLocked) throw fail("ALREADY_LOCKED");
        if (art === "SPERRZEIT" && !isLocked) throw fail("NOT_LOCKED");
      }

      // Nur die SPERRZEIT ist exklusiv: eine neue Sperre ERSETZT die bestehende, sonst hätte die
      // Keyholderin zwei konkurrierende Enden, von denen `foldActiveLockPeriods` stumm das spätere
      // durchsetzte — eine Verkürzung wäre wirkungslos geblieben. ANFORDERUNGen dürfen dagegen
      // koexistieren: mehrere (typisch terminierte) Einschliess-Anweisungen sind eine Pipeline, und
      // ein Verschluss erfüllt sie alle auf einmal (siehe POST /api/entries).
      if (art === "SPERRZEIT") {
        await tx.verschlussAnforderung.updateMany({
          where: { userId, art, fulfilledAt: null, withdrawnAt: null },
          data: { withdrawnAt: new Date(), endedReason: LOCK_ENDED_REASON.keyholder }, // von einer neuen Direktive ersetzt
        });
      }

      const effectiveMinDurationHours = art === "ANFORDERUNG" ? (minDurationHours || null) : null;
      const effectiveCleaning = effectiveCleaningAllowed(cleaningAllowed, {
        isLockPeriod: art === "SPERRZEIT", minDurationHours: effectiveMinDurationHours, lockEndsAt: lockEndsAtDate,
      });

      return tx.verschlussAnforderung.create({
        data: {
          userId,
          art,
          message: message?.trim() || null,
          endsAt: endsAtDate,
          minDurationHours: effectiveMinDurationHours,
          lockEndsAt: lockEndsAtDate,
          deviceId: art === "ANFORDERUNG" ? (deviceId || null) : null,
          cleaningAllowed: effectiveCleaning,
          createdBy: actorColumn(actor),
          wirksamAb,
          benachrichtigtAt, // sofort = jetzt benachrichtigt; geplant = Poller
        },
      });
    });
  } catch (e: unknown) {
    const mapped = mapServiceError(e, ERRORS);
    if (mapped) return mapped;
    throw e;
  }

  // Sofort benachrichtigen; bei geplanter Auslösung übernimmt der Poller bei Fälligkeit.
  if (!wirksamAb) {
    await sendVerschlussAnforderungNotifications({ userId, user, art, message, endsAtDate, minDurationHours, lockEndsAtDate, requestId: anforderung.id, actor });
  }

  // Instant-Push: Heimdall re-pullt die Config (neue/geänderte Sperre) für eine LIVE Box sofort.
  void notifyHeimdallForUserId(userId);
  return { ok: true, data: { id: anforderung.id, scheduledFor: wirksamAb?.toISOString() ?? null } };
}

/** Wraps email body HTML in the standard frame + "Zum Dashboard →" button. */
/** Sends the e-mail (ANFORDERUNG/SPERRZEIT) + push to the user. Fire-and-forget for push.
 *  Reused by the immediate path in createVerschlussAnforderung and by the delayed-trigger poller. */
export async function sendVerschlussAnforderungNotifications(opts: {
  userId: string;
  user: { email: string | null; username: string; locale: string };
  art: "ANFORDERUNG" | "SPERRZEIT";
  message?: string | null;
  endsAtDate: Date | null;
  minDurationHours?: number | null;
  /** ANFORDERUNG mit absolutem Sperr-Ende (statt minDurationHours): fürs „Gesperrt bis" in Mail/Push. */
  lockEndsAtDate?: Date | null;
  /** Die Zeile, auf die die Nachricht im Posteingang zeigt. */
  requestId: string;
  /**
   * WER die Direktive ANGEORDNET hat — nicht, wer die Zustellung ausgelöst hat.
   *
   * Dieselbe Person auf allen drei Wegen hierher (Anlegen, „sofort"-Ziehen per `edit_lock_request`,
   * Poller): der Satz „schliess dich ein" gehört dem, der ihn gesetzt hat. Deshalb kommt der Wert
   * überall aus `VerschlussAnforderung.createdBy` und nicht aus der Sitzung des Auslösers — sonst
   * trüge dieselbe Meldung je nach Zustellweg einen anderen Absender.
   *
   * Pflichtfeld: `null` (Altzeile ohne Autor → System-Zeile) ist eine ENTSCHEIDUNG und soll von
   * einem neuen Aufrufer getroffen werden müssen, statt still durchzurutschen.
   */
  actor: MessageActor;
}) {
  const { userId, user, art, message, endsAtDate, minDurationHours, lockEndsAtDate, requestId, actor } = opts;

  // Die Anforderungs-Nachricht des Keyholders wird NICHT mitkopiert: der Posteingang zeigt auf die
  // Direktive und liest sie beim Anzeigen frisch von dort. Eine spätere Korrektur über
  // `edit_lock_request` bliebe sonst neben einer veralteten Kopie stehen.
  // Wie bei der Kontrolle: Mail/Push sind hier nicht abschaltbar — eine Sperrzeit ist eine
  // Direktive, keine Nachricht.
  const badge = await recordMessageAndBadge({
    subjectUserId: userId,
    bodyKey: art === "SPERRZEIT" ? "lockPeriodSetBody" : "lockRequestBody",
    actor,
    ref: { type: "lockRequest", id: requestId },
    once: true,
  });
  const t = await emailT(user.locale);
  const messageHtml = optionalNoticeBoxHtml(t("lockNoticeLabel"), message);
  const greeting = emailGreeting(t, user.username);

  if (art === "SPERRZEIT" && user.email) {
    const bisHtml = endsAtDate
      ? `<p><strong>${t("lockedUntilLabel")}</strong> ${formatDateTime(endsAtDate)}</p>`
      : `<p><strong>${t("lockDurationLabel")}</strong> ${t("lockIndefinite")}</p>`;
    await sendMailSafe(
      user.email,
      `${APP_NAME} – ${t("lockPeriodSetSubject")}`,
      dashboardEmailHtml(t("lockPeriodSetSubject"),
        `${greeting}
        <p>${escHtml(t("lockPeriodSetBody"))}</p>
        ${messageHtml}
        ${bisHtml}`, t("dashboardButton")),
    );
  }

  if (art === "ANFORDERUNG" && user.email) {
    const deadlineHtml = endsAtDate
      ? `<p><strong>${t("lockUntilLabel")}</strong> ${formatDateTime(endsAtDate)}</p>`
      : "";
    const dauerHtml = minDurationHours
      ? `<p><strong>${t("lockMinWearLabel")}</strong> ${escHtml(formatDurationHours(minDurationHours, user.locale))}</p>`
      : "";
    const sperrBisHtml = lockEndsAtDate
      ? `<p><strong>${t("lockedUntilLabel")}</strong> ${formatDateTime(lockEndsAtDate)}</p>`
      : "";
    await sendMailSafe(
      user.email,
      `${APP_NAME} – ${t("lockRequestSubject")}`,
      dashboardEmailHtml(t("lockRequestSubject"),
        `${greeting}
        <p>${escHtml(t("lockRequestBody"))}</p>
        ${messageHtml}
        ${deadlineHtml}
        ${dauerHtml}
        ${sperrBisHtml}`, t("dashboardButton")),
    );
  }

  // Push (fire-and-forget)
  const pushTitle = art === "ANFORDERUNG" ? t("lockPushRequestTitle") : t("lockPushPeriodTitle");
  const pushParts: string[] = [];
  if (art === "ANFORDERUNG") {
    pushParts.push(t("lockPushRequestBody"));
    if (endsAtDate) pushParts.push(t("lockPushDeadline", { date: formatDateTime(endsAtDate) }));
    if (lockEndsAtDate) pushParts.push(t("lockPushUntil", { date: formatDateTime(lockEndsAtDate) }));
  } else {
    pushParts.push(endsAtDate ? t("lockPushUntil", { date: formatDateTime(endsAtDate) }) : t("lockIndefinite"));
  }
  if (message?.trim()) pushParts.push(message.trim());
  firePush(userId, pushTitle, pushParts.join(" · "), "/dashboard", badge);
}

/**
 * Changes the end of an active Sperrzeit (extend or shorten). `endsAt = null` → indefinite.
 * Shared by PATCH /api/admin/verschluss-anforderung/[id] (action "setEnd") and the MCP edit_lock_period tool.
 *
 * `notified` sagt dem Aufrufer, ob der Sub davon erfahren hat — die MCP-Antwort darf nicht
 * behaupten, es sei eine Mail rausgegangen, wenn keine rausging.
 */
export async function updateLockPeriodEnd(
  id: string,
  endsAt: Date | null,
  actor: MessageActor,
): Promise<ServiceResult<{ id: string; userId: string; notified: boolean }>> {
  const va = await prisma.verschlussAnforderung.findUnique({
    where: { id },
    select: { userId: true, art: true, withdrawnAt: true, wirksamAb: true, benachrichtigtAt: true },
  });
  if (!va) return serviceFail(404, "LOCK_PERIOD_NOT_FOUND");
  if (va.art !== "SPERRZEIT") return serviceFail(400, "LOCK_PERIOD_ONLY_HAS_END");
  if (va.withdrawnAt) return serviceFail(400, "LOCK_PERIOD_ALREADY_WITHDRAWN");
  const lockEndError = checkLockEnd(endsAt, va.wirksamAb, new Date());
  if (lockEndError) return serviceFail(400, lockEndError);

  await prisma.verschlussAnforderung.update({ where: { id }, data: { endsAt } });

  // Bei einer noch nicht ausgelösten Sperrzeit schweigen: der Poller meldet sie bei Fälligkeit, und
  // zwar mit dem hier gesetzten Ende (er liest die Zeile dann frisch). Der Sub erfährt also das
  // korrigierte Datum — nur eben zum richtigen Zeitpunkt, nicht drei Wochen zu früh.
  const notified = !isHiddenFromSub(va);
  if (notified) {
    // Die ÄNDERUNG trägt den Namen dessen, der sie vorgenommen hat — nicht den des ursprünglichen
    // Anordnenden. Das ist der Unterschied zur Zustellung der Direktive selbst (siehe dort).
    const inbox = { ref: { type: "lockRequest", id }, actor } as const;
    await notifyUser(va.userId, endsAt
      ? { subjectKey: "lockPeriodChangedSubject", messageKey: "lockPeriodChangedMessage", params: { date: formatDateTime(endsAt) }, inbox, alwaysNotify: true }
      : { subjectKey: "lockPeriodChangedSubject", messageKey: "lockPeriodChangedMessageIndefinite", inbox, alwaysNotify: true });
  }
  void notifyHeimdallForUserId(va.userId);
  return { ok: true, data: { id, userId: va.userId, notified } };
}

/**
 * Änderbare Felder einer offenen Einschliess-ANFORDERUNG. `undefined` = unverändert; `null` löscht
 * (Nachricht, Gerät, Sperr-Vorgabe) bzw. macht die Auslösung sofort (`wirksamAb`).
 */
export interface UpdateLockRequestParams {
  message?: string | null;
  /** Frist zum Einschliessen (absolut). Kein `null`: eine Anforderung ohne Frist gibt es nicht. */
  endsAt?: Date;
  /** Mindest-Tragedauer (h) nach dem Einschliessen. Schliesst `lockEndsAt` aus. */
  minDurationHours?: number | null;
  /** Absolutes Sperr-Ende nach dem Einschliessen. Schliesst `minDurationHours` aus. */
  lockEndsAt?: Date | null;
  deviceId?: string | null;
  cleaningAllowed?: boolean;
  /** Geplanter Auslöse-Zeitpunkt. `null` = sofort (löst die Zustellung hier aus). */
  wirksamAb?: Date | null;
}

/**
 * Das Reinigungs-Flag wirkt nur über eine SPERRZEIT: bei der Sperrzeit selbst immer, bei einer
 * ANFORDERUNG nur, wenn aus ihr eine entsteht (Mindestdauer ODER absolutes Sperr-Ende). Ohne
 * Sperr-Vorgabe hätte es nichts zu erlauben und stünde als leeres Versprechen in der Zeile.
 */
function effectiveCleaningAllowed(flag: boolean | null | undefined, spec: { isLockPeriod: boolean; minDurationHours: number | null; lockEndsAt: Date | null }): boolean {
  return Boolean(flag && (spec.isLockPeriod || spec.minDurationHours !== null || spec.lockEndsAt !== null));
}

/** Das Ergebnis von {@link mergeLockRequestPatch} — die Zeile, wie sie nach dem Patch aussieht. */
export interface MergedLockRequest {
  message: string | null;
  endsAt: Date | null;
  minDurationHours: number | null;
  lockEndsAt: Date | null;
  deviceId: string | null;
  cleaningAllowed: boolean;
  wirksamAb: Date | null;
}

/**
 * Führt Bestand und Patch zur Ziel-Zeile zusammen — PURE, damit die dryRun-Vorschau von
 * `edit_lock_request` exakt das zeigt, was der Commit schreibt. Rechnete die Vorschau selbst nach,
 * verspräche sie irgendwann etwas anderes als das, was passiert (gefunden beim Reinigungs-Flag ohne
 * Sperr-Vorgabe: die Vorschau sagte `true`, der Commit schrieb `false`).
 *
 * Konvention: `undefined` = unverändert, `null` = löschen. Mindestdauer und absolutes Sperr-Ende
 * verdrängen einander — beim Erfüllen gewinnt sonst stumm das absolute Ende, und ein Patch auf die
 * Mindestdauer bliebe wirkungslos.
 */
export function mergeLockRequestPatch(
  current: { message: string | null; endsAt: Date | null; minDurationHours: number | null; lockEndsAt: Date | null; deviceId: string | null; cleaningAllowed: boolean; wirksamAb: Date | null },
  patch: UpdateLockRequestParams,
): MergedLockRequest {
  const minDurationHours = patch.minDurationHours !== undefined ? patch.minDurationHours : (patch.lockEndsAt != null ? null : current.minDurationHours);
  const lockEndsAt = patch.lockEndsAt !== undefined ? patch.lockEndsAt : (patch.minDurationHours != null ? null : current.lockEndsAt);
  return {
    message: patch.message !== undefined ? (patch.message?.trim() || null) : current.message,
    endsAt: patch.endsAt ?? current.endsAt,
    minDurationHours,
    lockEndsAt,
    deviceId: patch.deviceId !== undefined ? patch.deviceId : current.deviceId,
    cleaningAllowed: effectiveCleaningAllowed(patch.cleaningAllowed ?? current.cleaningAllowed, { isLockPeriod: false, minDurationHours, lockEndsAt }),
    wirksamAb: patch.wirksamAb !== undefined ? patch.wirksamAb : current.wirksamAb,
  };
}

/**
 * Ändert eine offene Einschliess-ANFORDERUNG (Frist, Nachricht, Gerät, Sperr-Vorgabe, Auslösezeit).
 * Genutzt vom MCP-Tool `edit_lock_request`; das Admin-UI kennt bislang nur Anlegen + Zurückziehen.
 *
 * Warum überhaupt änderbar: eine Anforderung zurückzuziehen und neu zu stellen ist für den Sub
 * nicht dasselbe — er sieht dann eine Rücknahme und eine zweite Anweisung, und eine terminierte
 * verlöre ihre Verborgenheit. Eine Korrektur soll eine Korrektur bleiben.
 *
 * `notified` sagt, ob der Sub davon erfahren hat: eine terminierte, noch nicht ausgelöste Änderung
 * bleibt stumm (er kennt die Anforderung ja nicht). Wird die Auslösung dabei auf „sofort" gezogen,
 * geht stattdessen die reguläre Anforderungs-Zustellung raus — dieselbe, die sonst der Poller
 * verschickt.
 */
export async function updateLockRequest(
  id: string,
  patch: UpdateLockRequestParams,
  actor: MessageActor,
): Promise<ServiceResult<{ id: string; userId: string; notified: boolean; deliveredToPoller: boolean }>> {
  const va = await prisma.verschlussAnforderung.findUnique({
    where: { id },
    include: { user: { select: { id: true, email: true, username: true, locale: true } } },
  });
  if (!va || va.art !== "ANFORDERUNG") return serviceFail(404, "LOCK_REQUEST_NOT_FOUND");
  if (va.fulfilledAt || va.withdrawnAt) return serviceFail(400, "LOCK_REQUEST_NOT_EDITABLE");
  if (patch.minDurationHours != null && patch.lockEndsAt != null) return serviceFail(400, "LOCK_DURATION_OR_END");

  const now = new Date();
  const next = mergeLockRequestPatch(va, patch);
  // Die Frist selbst bleibt ungeprüft — sie ist eine Einschliess-Frist, kein Sperr-Ende, und darf
  // (wie beim Anlegen) auch vor der Auslösung liegen. Nur „gar keine Frist" ist keine Anforderung.
  if (!next.endsAt) return serviceFail(400, "LOCK_DEADLINE_REQUIRED");
  const lockEndError = checkLockEnd(next.lockEndsAt, next.wirksamAb, now);
  if (lockEndError) return serviceFail(400, lockEndError);

  if (next.deviceId && next.deviceId !== va.deviceId && !(await validateDeviceOwnership(next.deviceId, va.userId))) {
    return serviceFail(400, "INVALID_DEVICE");
  }

  // Direkt zustellen NUR, wenn die Anforderung ab jetzt SOFORT gilt (`wirksamAb === null`). Solche
  // Zeilen fasst der Poller nie an (er filtert `wirksamAb != null`), ein Direktversand kann also mit
  // ihm nicht kollidieren. Dieselbe Regel wie beim Anlegen: an einen bereits verschlossenen Sub geht
  // keine Einschliess-Anforderung raus.
  //
  // Eine noch verborgene Zeile mit bereits VERSTRICHENEM `wirksamAb` ist dagegen poller-fällig — die
  // überlassen wir bewusst dem Poller als EINZIGEM Zusteller. Sendeten Edit UND Poller, bekäme der Sub
  // zwei Benachrichtigungen (der Poller hat die Zeile evtl. schon vor unserem Schreiben in sein
  // `due`-Array geladen und stempelt `benachrichtigtAt` erst NACH dem Senden). Der Poller liest den
  // frischen Stand beim nächsten Tick (≤1 Min) und stellt genau einmal zu.
  const wasHidden = isHiddenFromSub(va);
  const deliverNow = wasHidden && next.wirksamAb === null;
  if (deliverNow && (await getIsLocked(va.userId))) return serviceFail(400, "USER_ALREADY_LOCKED");

  await prisma.verschlussAnforderung.update({
    where: { id },
    data: { ...next, ...(deliverNow ? { benachrichtigtAt: now } : {}) },
  });

  if (deliverNow) {
    await sendVerschlussAnforderungNotifications({
      userId: va.userId, user: va.user, art: "ANFORDERUNG",
      message: next.message, endsAtDate: next.endsAt,
      minDurationHours: next.minDurationHours, lockEndsAtDate: next.lockEndsAt,
      requestId: va.id,
      // Die Anforderung selbst nennt ihren ANORDNENDEN, nicht den, der sie vorgezogen hat — genau
      // wie auf dem Poller-Weg, der dieselbe Meldung verschickt. OHNE Ausweichen auf `actor`: eine
      // Altzeile ohne Autor bliebe sonst je nach Zustellweg mal „System" (Poller) und mal der
      // Bearbeiter — genau der wechselnde Absender, den der Vertrag oben ausschliesst.
      actor: va.createdBy,
    });
  } else if (!wasHidden) {
    await notifyUser(va.userId, {
      subjectKey: "lockRequestChangedSubject",
      messageKey: "lockRequestChangedMessage",
      params: { date: formatDateTime(next.endsAt) },
      // Die ÄNDERUNG dagegen gehört dem, der sie vorgenommen hat.
      inbox: { ref: { type: "lockRequest", id: va.id }, actor },
      alwaysNotify: true,
    });
  }
  // Verborgen + noch nicht sofort fällig: stumm. Der Poller stellt bei Fälligkeit den frischen Stand zu.

  void notifyHeimdallForUserId(va.userId);
  // `deliveredToPoller` = verborgen, aber poller-fällig: WIR haben nicht benachrichtigt, der Poller
  // wird es gleich tun. `notified` bleibt bewusst false (diese Antwort behauptet keine erfolgte
  // Zustellung), das MCP-Tool formuliert daraus die passende Meldung.
  const deliveredToPoller = wasHidden && !deliverNow && next.wirksamAb !== null && next.wirksamAb <= now;
  return { ok: true, data: { id, userId: va.userId, notified: deliverNow || !wasHidden, deliveredToPoller } };
}

/** Betreff + Text der Withdraw-Benachrichtigung — geteilt von Service (MCP, per art) und
 *  Admin-Route (per id), damit die Meldung nicht divergiert. */
export function verschlussWithdrawNotice(art: "ANFORDERUNG" | "SPERRZEIT", actor: MessageActor, refId?: string): NotifyContent {
  // Ohne `refId` (Rückzug per Art, der mehrere Zeilen treffen kann) bleibt die Nachricht ohne Bezug:
  // auf eine von mehreren zurückgezogenen Direktiven zu zeigen, wäre eine willkürliche Auswahl.
  // Der ABSENDER bleibt auch dort eindeutig: der Rückzug ist EIN Knopfdruck EINER Person, egal wie
  // viele Zeilen er trifft — er nennt den Zurückziehenden, nicht die Anordnenden.
  const inbox: NotifyInbox = { actor, ...(refId ? { ref: { type: "lockRequest" as const, id: refId } } : {}) };
  return art === "SPERRZEIT"
    ? { subjectKey: "lockPeriodWithdrawnSubject", messageKey: "lockPeriodWithdrawnMessage", inbox }
    : { subjectKey: "lockRequestWithdrawnSubject", messageKey: "lockRequestWithdrawnMessage", inbox };
}

/** Die Felder, die {@link carryOverLockPeriodOnAlreadyLocked} von der fälligen Anforderung braucht. */
export interface DueLockRequest extends LockPeriodFromRequest {
  id: string;
  userId: string;
  message: string | null;
  cleaningAllowed: boolean;
  /** Wer die Anforderung angeordnet hat — wird an die daraus entstehende Sperrzeit VERERBT und ist
   *  der Absender ihrer Meldung. Der Poller kennt sonst niemanden, den er nennen könnte. */
  createdBy: string | null;
}

/**
 * Eine TERMINIERTE Einschliess-Anforderung wird fällig — und der Sub ist bereits verschlossen.
 *
 * Bisher endete das als `obsolete`: die Anforderung war gegenstandslos, weil ihr Ziel schon erreicht
 * war. Mit ihr verfiel aber auch die SPERRZEIT, die sie mitbrachte — die entsteht sonst erst beim
 * ERFÜLLEN (`entryFulfilment.ts`), und dieser Pfad wird nie erreicht, wenn der Sub schon zu ist. Der
 * Keyholder verlor damit die Sperre ausgerechnet in dem Fall, in dem der Sub alles richtig gemacht
 * hat. Also: Anforderung als ERFÜLLT verbuchen (sie WURDE erfüllt) und die Sperrzeit trotzdem
 * anlegen. Ein `late_lock` entsteht dadurch nicht — nicht wegen `fulfilledAt` (das hilft nur,
 * solange die Frist noch läuft; ein absolutes `endsAt` darf vor dem Auslöse-Zeitpunkt liegen),
 * sondern weil das Strafbuch eine nie zugestellte Anforderung gar nicht erst als verspätet zählt.
 *
 * Die Sperrzeit zählt ab `now`, dem Auslöse-Zeitpunkt (siehe {@link lockPeriodEndFromRequest}), und
 * ist sofort aktiv (`wirksamAb: null` ⇒ nicht vor dem Sub verborgen). Sie zieht — wie der
 * Erfüllungs-Pfad und anders als `createVerschlussAnforderung` — KEINE bestehende Sperrzeit zurück:
 * welche von mehreren gilt, entscheidet `foldActiveLockPeriods`.
 *
 * Liefert die neue Sperrzeit, oder `null`, wenn es nichts zu übernehmen gab (keine Sperrzeit an der
 * Anforderung, oder ihr absolutes Ende liegt schon in der Vergangenheit) — dann bleibt es beim
 * bisherigen Rückzug als `obsolete`. Benachrichtigt wird NICHT hier: die Meldung gehört hinter den
 * Commit, der Aufrufer schickt sie (Notifications sind nicht transaktional).
 */
export async function carryOverLockPeriodOnAlreadyLocked(
  va: DueLockRequest,
  now: Date,
): Promise<{ lockPeriodId: string; endsAt: Date; message: string | null; createdBy: string | null } | null> {
  // Ein Ende in der Vergangenheit trifft nur den absoluten Fall (`lockEndsAt`) — ein aus `minDurationHours`
  // gerechnetes liegt per Konstruktion vorn. Eine tote Sperre anzulegen hilft niemandem.
  const endsAt = lockPeriodEndFromRequest(va, now);
  if (!endsAt || endsAt <= now) return null;

  const lockPeriod = await prisma.$transaction(async (tx) => {
    const created = await tx.verschlussAnforderung.create({
      data: {
        userId: va.userId,
        art: "SPERRZEIT",
        message: va.message,
        endsAt,
        cleaningAllowed: va.cleaningAllowed,
        // Die Sperre ist die Anordnung DERSELBEN Person, nur später wirksam — der Autor wandert mit,
        // damit ihre Meldung (und jede spätere Änderung daran) denselben Absender nennt.
        createdBy: va.createdBy,
        // Sofort gültig ⇒ nicht vor dem Sub verborgen. `benachrichtigtAt` bleibt null wie bei der
        // Sperrzeit aus dem Erfüllungs-Pfad: der Stempel meint „Mail/Push ging raus", und der Versand
        // liegt hinter dem Commit — ihn vorab zu setzen behauptete eine Zustellung, die scheitern kann.
        wirksamAb: null,
      },
      select: { id: true, message: true, createdBy: true },
    });
    await tx.verschlussAnforderung.update({ where: { id: va.id }, data: { fulfilledAt: now } });
    return created;
  });

  void notifyHeimdallForUserId(va.userId);
  // Text UND Absender aus der GESCHRIEBENEN Zeile, nicht aus der Quelle: die Meldung gehört zur
  // SPERRZEIT, also zitiert sie das, was wirklich in ihr steht. Heute derselbe Wert wie an der
  // Anforderung (die Zeile erbt beides), und genau deshalb kostet die Regel hier nichts —
  // auseinanderlaufen könnten sie erst, wenn jemand die Vererbung ändert, und dann liest der
  // Aufrufer weiter richtig, statt still die Quelle zu nennen.
  return { lockPeriodId: lockPeriod.id, endsAt, message: lockPeriod.message, createdBy: lockPeriod.createdBy };
}

/**
 * Zieht EINE VerschlussAnforderung per id zurück — der Keyholder klickt in der Admin-Liste eine
 * bestimmte Zeile weg (auch eine noch terminierte, die dort als „geplant für …" steht).
 *
 * Dieselben Regeln wie die art-basierte Variante, und deshalb im Service statt in der Route: die
 * Route benachrichtigte bedingungslos (verriet also geplante Direktiven) und pushte nie an Heimdall
 * (eine LIVE Box behielt die zurückgezogene Sperre bis zu ihrem nächsten Pull).
 */
export async function withdrawVerschlussAnforderungById(
  id: string,
  actor: MessageActor,
): Promise<ServiceResult<{ userId: string; notified: boolean }>> {
  const va = await prisma.verschlussAnforderung.findUnique({
    where: { id },
    select: { userId: true, art: true, withdrawnAt: true, wirksamAb: true, benachrichtigtAt: true },
  });
  if (!va) return serviceFail(404, "NOT_FOUND");
  if (va.withdrawnAt) return serviceFail(400, "LOCK_PERIOD_ALREADY_WITHDRAWN");

  await prisma.verschlussAnforderung.update({ where: { id }, data: { withdrawnAt: new Date(), endedReason: LOCK_ENDED_REASON.keyholder } });

  const notified = !isHiddenFromSub(va);
  if (notified) await notifyUser(va.userId, verschlussWithdrawNotice(va.art as "ANFORDERUNG" | "SPERRZEIT", actor, id));
  void notifyHeimdallForUserId(va.userId);
  return { ok: true, data: { userId: va.userId, notified } };
}

/**
 * Zieht offene VerschlussAnforderung(en) einer Art zurück (ANFORDERUNG = Einschliess-Anforderung,
 * SPERRZEIT = aktive Sperre). Geteilt von der MCP `withdraw`.
 *
 * Storniert AUCH terminierte, noch nicht ausgelöste Direktiven — das ist gewollt (der Keyholder
 * sieht sie in `scheduledDirectives` und kann sie aus der Pipeline nehmen), deshalb kein
 * `wirksamAb`-Filter in der Where-Klausel.
 *
 * Benachrichtigt aber NUR, wenn der Sub von mindestens einer der stornierten Direktiven wusste.
 * Sonst meldete man ihm die Aufhebung von etwas, dessen Existenz er nie erfahren sollte — und
 * verriete damit genau die geplante Direktive, die verborgen bleiben soll.
 *
 * `hidden` (Teilmenge von `count`) zählt die stornierten TERMINIERTEN, noch nicht ausgelösten. Ein
 * blosses `count: 2` verschwiege der Keyholderin, dass sie neben der laufenden Sperrzeit auch eine
 * geplante mitgenommen hat — und mehrere offene sind normal (siehe `foldActiveLockPeriods`).
 *
 * `rows` sind die tatsächlich stornierten Zeilen, gelesen INNERHALB derselben Transaktion. Der
 * Aufrufer soll sie benennen können (MCP `withdraw` → `withdrawnItems`), ohne sie ein zweites Mal
 * zu suchen: eine eigene Abfrage draussen müsste diese Where-Klausel nachbauen, läge ausserhalb der
 * Transaktion und könnte deshalb eine andere Menge sehen als die, die hier storniert wurde — genau
 * die Abweichung zwischen Liste und Zähler, die das Feld verhindern soll.
 */
export interface WithdrawnDirective {
  id: string;
  wirksamAb: Date | null;
  benachrichtigtAt: Date | null;
  endsAt: Date | null;
  message: string | null;
}

export async function withdrawVerschlussAnforderung(
  userId: string,
  art: "ANFORDERUNG" | "SPERRZEIT",
  actor: MessageActor,
): Promise<ServiceResult<{ count: number; hidden: number; notified: boolean; rows: WithdrawnDirective[] }>> {
  const now = new Date();
  const where = art === "ANFORDERUNG"
    ? { userId, art, fulfilledAt: null, withdrawnAt: null }
    : { userId, art, withdrawnAt: null, OR: [{ endsAt: null }, { endsAt: { gt: now } }] };

  // Lesen und Zurückziehen in EINER Transaktion: löste der Poller genau dazwischen aus, stempelte er
  // `benachrichtigtAt` nach unserem Lesen — wir schwiegen, obwohl der Sub die Sperrzeit gerade
  // gemeldet bekommen hat, und er hielte sie für weiter aktiv.
  const { rows, hidden, notified } = await prisma.$transaction(async (tx) => {
    const rows: WithdrawnDirective[] = await tx.verschlussAnforderung.findMany({
      where,
      select: { id: true, wirksamAb: true, benachrichtigtAt: true, endsAt: true, message: true },
    });
    if (rows.length === 0) return { rows, hidden: 0, notified: false };
    await tx.verschlussAnforderung.updateMany({
      where: { id: { in: rows.map((r) => r.id) } },
      data: { withdrawnAt: now, endedReason: LOCK_ENDED_REASON.keyholder },
    });
    const hiddenRows = rows.filter(isHiddenFromSub);
    return { rows, hidden: hiddenRows.length, notified: hiddenRows.length < rows.length };
  });

  const count = rows.length;
  if (notified) await notifyUser(userId, verschlussWithdrawNotice(art, actor));
  if (count > 0) void notifyHeimdallForUserId(userId); // Instant-Push: der Rückzug erreicht eine LIVE Box sofort
  return { ok: true, data: { count, hidden, notified, rows } };
}
