import { prisma } from "@/lib/prisma";
import { sendMail, escHtml, noticeBoxHtml, dashboardEmailHtml } from "@/lib/mail";
import { notifyUser, type NotifyContent } from "@/lib/notify";
import { notifyHeimdallForUserId } from "@/lib/heimdallNotify";
import { emailT, emailGreeting } from "@/lib/emailI18n";
import { validateDeviceOwnership, getIsLocked } from "@/lib/queries";
import { formatDateTime } from "@/lib/utils";
import { firePush } from "@/lib/push";
import { computeDelayedTrigger } from "@/lib/delayedTrigger";
import { serviceErrors, mapServiceError, type ServiceResult } from "@/lib/serviceResult";

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

  if (!userId) return { ok: false, status: 400, error: "userId fehlt" };
  if (art !== "ANFORDERUNG" && art !== "SPERRZEIT") {
    return { ok: false, status: 400, error: "art muss ANFORDERUNG oder SPERRZEIT sein" };
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { ok: false, status: 404, error: "User nicht gefunden" };
  if (art === "ANFORDERUNG" && !user.email) {
    return { ok: false, status: 400, error: "User hat keine E-Mail-Adresse" };
  }

  const now = new Date();

  // Parsen/Validieren des Client-Datums gehört hierher (an den Rand), nicht in die Zeit-Policy.
  let wirksamAbParsed: Date | null = null;
  if (wirksamAbAt) {
    wirksamAbParsed = new Date(wirksamAbAt);
    if (Number.isNaN(wirksamAbParsed.getTime())) {
      return { ok: false, status: 400, error: "Ungültiger Versandzeitpunkt" };
    }
  }
  const { wirksamAb, benachrichtigtAt } = computeDelayedTrigger(now, { delayMinutes, wirksamAbAt: wirksamAbParsed });

  // endetAt berechnen (Frist zum Einschliessen / Sperrzeit-Ende).
  // Absolute endetAt-Angaben bleiben absolut; relative Frist (fristH) zählt ab dem geplanten
  // Versand (wirksamAb), nicht ab Erstellung.
  let endetAtDate: Date | null = null;
  if (endetAt) {
    endetAtDate = new Date(endetAt);
    if (Number.isNaN(endetAtDate.getTime())) return { ok: false, status: 400, error: "Ungültiger Zeitpunkt" };
  } else if (fristH) {
    endetAtDate = new Date((wirksamAb ?? now).getTime() + fristH * 60 * 60 * 1000);
  }
  if (art === "ANFORDERUNG" && !endetAtDate) {
    return { ok: false, status: 400, error: "Frist zum Einschliessen ist erforderlich" };
  }

  // Absolutes Sperr-Ende (nur ANFORDERUNG, Alternative zu dauerH). Wird beim Fulfill 1:1 zur SPERRZEIT.
  let sperrEndetAtDate: Date | null = null;
  if (art === "ANFORDERUNG" && sperrEndetAt) {
    sperrEndetAtDate = new Date(sperrEndetAt);
    if (Number.isNaN(sperrEndetAtDate.getTime())) return { ok: false, status: 400, error: "Ungültiges Sperr-Ende" };
  }

  if (deviceId && art === "ANFORDERUNG") {
    const device = await validateDeviceOwnership(deviceId, userId);
    if (!device) return { ok: false, status: 400, error: "Ungültiges Gerät" };
  }

  // Wrap state-check + withdraw + create in transaction to prevent TOCTOU race
  let anforderung;
  // Wurf- und Fang-Seite hängen an derselben Tabelle — siehe kontrolleService.
  const { table: ERRORS, fail } = serviceErrors({
    ALREADY_LOCKED: { status: 400, error: "User ist bereits verschlossen" },
    NOT_LOCKED: { status: 400, error: "User ist nicht verschlossen" },
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
 */
export async function updateSperrzeitEnde(
  id: string,
  endetAt: Date | null,
): Promise<ServiceResult<{ id: string; userId: string }>> {
  const va = await prisma.verschlussAnforderung.findUnique({
    where: { id },
    select: { userId: true, art: true, withdrawnAt: true },
  });
  if (!va) return { ok: false, status: 404, error: "Sperrzeit nicht gefunden" };
  if (va.art !== "SPERRZEIT") return { ok: false, status: 400, error: "Nur Sperrzeiten haben ein Ende" };
  if (va.withdrawnAt) return { ok: false, status: 400, error: "Sperrzeit ist bereits aufgehoben" };
  if (endetAt && endetAt.getTime() <= Date.now()) {
    return { ok: false, status: 400, error: "Das neue Ende muss in der Zukunft liegen" };
  }

  await prisma.verschlussAnforderung.update({ where: { id }, data: { endetAt } });
  await notifyUser(va.userId, endetAt
    ? { subjectKey: "lockPeriodChangedSubject", messageKey: "lockPeriodChangedMessage", params: { date: formatDateTime(endetAt) } }
    : { subjectKey: "lockPeriodChangedSubject", messageKey: "lockPeriodChangedMessageIndefinite" });
  void notifyHeimdallForUserId(va.userId);
  return { ok: true, data: { id, userId: va.userId } };
}

/** Betreff + Text der Withdraw-Benachrichtigung — geteilt von Service (MCP, per art) und
 *  Admin-Route (per id), damit die Meldung nicht divergiert. */
export function verschlussWithdrawNotice(art: "ANFORDERUNG" | "SPERRZEIT"): NotifyContent {
  return art === "SPERRZEIT"
    ? { subjectKey: "lockPeriodWithdrawnSubject", messageKey: "lockPeriodWithdrawnMessage" }
    : { subjectKey: "lockRequestWithdrawnSubject", messageKey: "lockRequestWithdrawnMessage" };
}

/**
 * Zieht offene VerschlussAnforderung(en) einer Art zurück (ANFORDERUNG = Einschliess-Anforderung,
 * SPERRZEIT = aktive Sperre) und benachrichtigt den Nutzer. Geteilt von der MCP `withdraw`.
 */
export async function withdrawVerschlussAnforderung(
  userId: string,
  art: "ANFORDERUNG" | "SPERRZEIT",
): Promise<ServiceResult<{ count: number }>> {
  const now = new Date();
  const where = art === "ANFORDERUNG"
    ? { userId, art, fulfilledAt: null, withdrawnAt: null }
    : { userId, art, withdrawnAt: null, OR: [{ endetAt: null }, { endetAt: { gt: now } }] };
  const res = await prisma.verschlussAnforderung.updateMany({ where, data: { withdrawnAt: now } });
  if (res.count > 0) {
    await notifyUser(userId, verschlussWithdrawNotice(art));
    void notifyHeimdallForUserId(userId); // Instant-Push: der Rückzug erreicht eine LIVE Box sofort
  }
  return { ok: true, data: { count: res.count } };
}
