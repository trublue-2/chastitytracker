import { prisma } from "@/lib/prisma";
import { sendMail, escHtml, noticeBoxHtml, dashboardEmailHtml } from "@/lib/mail";
import { notifyUser, type NotifyContent } from "@/lib/notify";
import { notifyHeimdallForUserId } from "@/lib/heimdallNotify";
import { emailT, emailGreeting } from "@/lib/emailI18n";
import { validateDeviceOwnership, getIsLocked } from "@/lib/queries";
import { formatDateTime } from "@/lib/utils";
import { firePush } from "@/lib/push";
import { computeDelayedTrigger, isHiddenFromSub } from "@/lib/delayedTrigger";
import { serviceErrors, mapServiceError, serviceFail, type ServiceResult } from "@/lib/serviceResult";

export interface CreateVerschlussAnforderungParams {
  userId: string;
  art: "ANFORDERUNG" | "SPERRZEIT";
  nachricht?: string | null;
  /** Absolute end (ISO string or Date). Takes precedence over fristH. */
  endetAt?: string | Date | null;
  /** Relative deadline/duration in hours, used when endetAt is absent. */
  fristH?: number | null;
  /** ANFORDERUNG only: min wearing duration (h) → inherited by the auto-created SPERRZEIT on lock. */
  dauerH?: number | null;
  /** ANFORDERUNG only: absolute lock end (wall clock, ISO string or Date). Taken 1:1 as the
   *  auto-created SPERRZEIT.endetAt on fulfill — a late lock does NOT shift it. Alternative to dauerH. */
  sperrEndetAt?: string | Date | null;
  deviceId?: string | null;
  reinigungErlaubt?: boolean;
  /** Verzögerte Auslösung in Minuten (>0). Fehlt/0 = sofort (sofern kein wirksamAbAt). */
  delayMinutes?: number | null;
  /** Absoluter Versandzeitpunkt (ISO-String oder Date). Hat Vorrang vor delayMinutes. */
  wirksamAbAt?: string | Date | null;
}

/**
 * Creates a VerschlussAnforderung (ANFORDERUNG) or Sperrzeit (SPERRZEIT) for a user.
 * Single source of truth shared by POST /api/admin/verschluss-anforderung and the MCP write tool.
 * Validates state in a transaction (TOCTOU-safe), withdraws an existing open one of the same art,
 * and sends the user an e-mail + push notification — identical behaviour from UI or MCP.
 */
export async function createVerschlussAnforderung(
  params: CreateVerschlussAnforderungParams,
): Promise<ServiceResult<{ id: string; scheduledFor: string | null }>> {
  const { userId, art, nachricht, endetAt, fristH, dauerH, sperrEndetAt, deviceId, reinigungErlaubt, delayMinutes, wirksamAbAt } = params;

  if (!userId) return serviceFail(400, "USER_ID_REQUIRED");
  if (art !== "ANFORDERUNG" && art !== "SPERRZEIT") {
    return serviceFail(400, "LOCK_INVALID_ART");
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return serviceFail(404, "USER_NOT_FOUND");
  if (art === "ANFORDERUNG" && !user.email) {
    return serviceFail(400, "USER_NO_EMAIL");
  }

  const now = new Date();

  // Parsen/Validieren des Client-Datums gehört hierher (an den Rand), nicht in die Zeit-Policy.
  let wirksamAbParsed: Date | null = null;
  if (wirksamAbAt) {
    wirksamAbParsed = new Date(wirksamAbAt);
    if (Number.isNaN(wirksamAbParsed.getTime())) {
      return serviceFail(400, "LOCK_INVALID_SEND_TIME");
    }
  }
  const { wirksamAb, benachrichtigtAt } = computeDelayedTrigger(now, { delayMinutes, wirksamAbAt: wirksamAbParsed });

  // endetAt berechnen (Frist zum Einschliessen / Sperrzeit-Ende).
  // Absolute endetAt-Angaben bleiben absolut; relative Frist (fristH) zählt ab dem geplanten
  // Versand (wirksamAb), nicht ab Erstellung.
  let endetAtDate: Date | null = null;
  if (endetAt) {
    endetAtDate = new Date(endetAt);
    if (Number.isNaN(endetAtDate.getTime())) return serviceFail(400, "INVALID_DATETIME");
  } else if (fristH) {
    endetAtDate = new Date((wirksamAb ?? now).getTime() + fristH * 60 * 60 * 1000);
  }
  if (art === "ANFORDERUNG" && !endetAtDate) {
    return serviceFail(400, "LOCK_DEADLINE_REQUIRED");
  }

  // Absolutes Sperr-Ende (nur ANFORDERUNG, Alternative zu dauerH). Wird beim Fulfill 1:1 zur SPERRZEIT.
  let sperrEndetAtDate: Date | null = null;
  if (art === "ANFORDERUNG" && sperrEndetAt) {
    sperrEndetAtDate = new Date(sperrEndetAt);
    if (Number.isNaN(sperrEndetAtDate.getTime())) return serviceFail(400, "LOCK_INVALID_LOCK_END");
  }

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

      if (art === "ANFORDERUNG" && isLocked) throw fail("ALREADY_LOCKED");
      if (art === "SPERRZEIT" && !isLocked) throw fail("NOT_LOCKED");

      await tx.verschlussAnforderung.updateMany({
        where: { userId, art, fulfilledAt: null, withdrawnAt: null },
        data: { withdrawnAt: new Date() },
      });

      // reinigungErlaubt: SPERRZEIT always, ANFORDERUNG nur wenn eine SPERRZEIT entsteht — also mit
      // dauerH ODER absolutem sperrEndetAt (beide werden auf die auto-erzeugte SPERRZEIT vererbt).
      const effectiveDauerH = art === "ANFORDERUNG" ? (dauerH || null) : null;
      const effectiveReinigung = Boolean(
        reinigungErlaubt && (art === "SPERRZEIT" || effectiveDauerH !== null || sperrEndetAtDate !== null),
      );

      return tx.verschlussAnforderung.create({
        data: {
          userId,
          art,
          nachricht: nachricht?.trim() || null,
          endetAt: endetAtDate,
          dauerH: effectiveDauerH,
          sperrEndetAt: sperrEndetAtDate,
          deviceId: art === "ANFORDERUNG" ? (deviceId || null) : null,
          reinigungErlaubt: effectiveReinigung,
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
    await sendVerschlussAnforderungNotifications({ userId, user, art, nachricht, endetAtDate, dauerH, sperrEndetAtDate });
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
  nachricht?: string | null;
  endetAtDate: Date | null;
  dauerH?: number | null;
  /** ANFORDERUNG mit absolutem Sperr-Ende (statt dauerH): fürs „Gesperrt bis" in Mail/Push. */
  sperrEndetAtDate?: Date | null;
}) {
  const { userId, user, art, nachricht, endetAtDate, dauerH, sperrEndetAtDate } = opts;
  const t = await emailT(user.locale);
  const nachrichtHtml = nachricht?.trim() ? noticeBoxHtml(t("lockNoticeLabel"), nachricht.trim()) : "";
  const greeting = emailGreeting(t, user.username);

  if (art === "SPERRZEIT" && user.email) {
    const bisHtml = endetAtDate
      ? `<p><strong>${t("lockedUntilLabel")}</strong> ${formatDateTime(endetAtDate)}</p>`
      : `<p><strong>${t("lockDurationLabel")}</strong> ${t("lockIndefinite")}</p>`;
    await sendMail(
      user.email,
      `KG-Tracker – ${t("lockPeriodSetSubject")}`,
      dashboardEmailHtml(t("lockPeriodSetSubject"),
        `${greeting}
        <p>${escHtml(t("lockPeriodSetBody"))}</p>
        ${nachrichtHtml}
        ${bisHtml}`, t("dashboardButton")),
    );
  }

  if (art === "ANFORDERUNG" && user.email) {
    const deadlineHtml = endetAtDate
      ? `<p><strong>${t("lockUntilLabel")}</strong> ${formatDateTime(endetAtDate)}</p>`
      : "";
    const dauerHtml = dauerH
      ? `<p><strong>${t("lockMinWearLabel")}</strong> ${dauerH >= 24 ? `${Math.floor(dauerH / 24)}${t("dayUnitShort")} ${dauerH % 24 > 0 ? `${dauerH % 24}h` : ""}`.trim() : `${dauerH}h`}</p>`
      : "";
    const sperrBisHtml = sperrEndetAtDate
      ? `<p><strong>${t("lockedUntilLabel")}</strong> ${formatDateTime(sperrEndetAtDate)}</p>`
      : "";
    await sendMail(
      user.email,
      `KG-Tracker – ${t("lockRequestSubject")}`,
      dashboardEmailHtml(t("lockRequestSubject"),
        `${greeting}
        <p>${escHtml(t("lockRequestBody"))}</p>
        ${nachrichtHtml}
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
    if (endetAtDate) pushParts.push(t("lockPushDeadline", { date: formatDateTime(endetAtDate) }));
    if (sperrEndetAtDate) pushParts.push(t("lockPushUntil", { date: formatDateTime(sperrEndetAtDate) }));
  } else {
    pushParts.push(endetAtDate ? t("lockPushUntil", { date: formatDateTime(endetAtDate) }) : t("lockIndefinite"));
  }
  if (nachricht?.trim()) pushParts.push(nachricht.trim());
  firePush(userId, pushTitle, pushParts.join(" · "), "/dashboard");
}

/**
 * Changes the end of an active Sperrzeit (extend or shorten). `endetAt = null` → indefinite.
 * Shared by PATCH /api/admin/verschluss-anforderung/[id] (action "setEnd") and the MCP edit_lock_period tool.
 *
 * `notified` sagt dem Aufrufer, ob der Sub davon erfahren hat — die MCP-Antwort darf nicht
 * behaupten, es sei eine Mail rausgegangen, wenn keine rausging.
 */
export async function updateSperrzeitEnde(
  id: string,
  endetAt: Date | null,
): Promise<ServiceResult<{ id: string; userId: string; notified: boolean }>> {
  const va = await prisma.verschlussAnforderung.findUnique({
    where: { id },
    select: { userId: true, art: true, withdrawnAt: true, wirksamAb: true, benachrichtigtAt: true },
  });
  if (!va) return serviceFail(404, "LOCK_PERIOD_NOT_FOUND");
  if (va.art !== "SPERRZEIT") return serviceFail(400, "LOCK_PERIOD_ONLY_HAS_END");
  if (va.withdrawnAt) return serviceFail(400, "LOCK_PERIOD_ALREADY_WITHDRAWN");
  if (endetAt && endetAt.getTime() <= Date.now()) {
    return serviceFail(400, "LOCK_PERIOD_END_MUST_BE_FUTURE");
  }

  await prisma.verschlussAnforderung.update({ where: { id }, data: { endetAt } });

  // Bei einer noch nicht ausgelösten Sperrzeit schweigen: der Poller meldet sie bei Fälligkeit, und
  // zwar mit dem hier gesetzten Ende (er liest die Zeile dann frisch). Der Sub erfährt also das
  // korrigierte Datum — nur eben zum richtigen Zeitpunkt, nicht drei Wochen zu früh.
  const notified = !isHiddenFromSub(va);
  if (notified) {
    await notifyUser(va.userId, endetAt
      ? { subjectKey: "lockPeriodChangedSubject", messageKey: "lockPeriodChangedMessage", params: { date: formatDateTime(endetAt) } }
      : { subjectKey: "lockPeriodChangedSubject", messageKey: "lockPeriodChangedMessageIndefinite" });
  }
  void notifyHeimdallForUserId(va.userId);
  return { ok: true, data: { id, userId: va.userId, notified } };
}

/** Betreff + Text der Withdraw-Benachrichtigung — geteilt von Service (MCP, per art) und
 *  Admin-Route (per id), damit die Meldung nicht divergiert. */
export function verschlussWithdrawNotice(art: "ANFORDERUNG" | "SPERRZEIT"): NotifyContent {
  return art === "SPERRZEIT"
    ? { subjectKey: "lockPeriodWithdrawnSubject", messageKey: "lockPeriodWithdrawnMessage" }
    : { subjectKey: "lockRequestWithdrawnSubject", messageKey: "lockRequestWithdrawnMessage" };
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
): Promise<ServiceResult<{ userId: string; notified: boolean }>> {
  const va = await prisma.verschlussAnforderung.findUnique({
    where: { id },
    select: { userId: true, art: true, withdrawnAt: true, wirksamAb: true, benachrichtigtAt: true },
  });
  if (!va) return serviceFail(404, "NOT_FOUND");
  if (va.withdrawnAt) return serviceFail(400, "LOCK_PERIOD_ALREADY_WITHDRAWN");

  await prisma.verschlussAnforderung.update({ where: { id }, data: { withdrawnAt: new Date() } });

  const notified = !isHiddenFromSub(va);
  if (notified) await notifyUser(va.userId, verschlussWithdrawNotice(va.art as "ANFORDERUNG" | "SPERRZEIT"));
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
 */
export async function withdrawVerschlussAnforderung(
  userId: string,
  art: "ANFORDERUNG" | "SPERRZEIT",
): Promise<ServiceResult<{ count: number; notified: boolean }>> {
  const now = new Date();
  const where = art === "ANFORDERUNG"
    ? { userId, art, fulfilledAt: null, withdrawnAt: null }
    : { userId, art, withdrawnAt: null, OR: [{ endetAt: null }, { endetAt: { gt: now } }] };

  // Lesen und Zurückziehen in EINER Transaktion: löste der Poller genau dazwischen aus, stempelte er
  // `benachrichtigtAt` nach unserem Lesen — wir schwiegen, obwohl der Sub die Sperrzeit gerade
  // gemeldet bekommen hat, und er hielte sie für weiter aktiv.
  const { count, notified } = await prisma.$transaction(async (tx) => {
    const rows = await tx.verschlussAnforderung.findMany({ where, select: { id: true, wirksamAb: true, benachrichtigtAt: true } });
    if (rows.length === 0) return { count: 0, notified: false };
    await tx.verschlussAnforderung.updateMany({
      where: { id: { in: rows.map((r) => r.id) } },
      data: { withdrawnAt: now },
    });
    return { count: rows.length, notified: rows.some((r) => !isHiddenFromSub(r)) };
  });

  if (notified) await notifyUser(userId, verschlussWithdrawNotice(art));
  if (count > 0) void notifyHeimdallForUserId(userId); // Instant-Push: der Rückzug erreicht eine LIVE Box sofort
  return { ok: true, data: { count, notified } };
}
