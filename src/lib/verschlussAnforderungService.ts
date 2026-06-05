import { prisma } from "@/lib/prisma";
import { sendMail, escHtml } from "@/lib/mail";
import { validateDeviceOwnership } from "@/lib/queries";
import { formatDateTime } from "@/lib/utils";
import { sendPushToUser } from "@/lib/push";
import type { ServiceResult } from "@/lib/serviceResult";

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
  deviceId?: string | null;
  reinigungErlaubt?: boolean;
}

/**
 * Creates a VerschlussAnforderung (ANFORDERUNG) or Sperrzeit (SPERRZEIT) for a user.
 * Single source of truth shared by POST /api/admin/verschluss-anforderung and the MCP write tool.
 * Validates state in a transaction (TOCTOU-safe), withdraws an existing open one of the same art,
 * and sends the user an e-mail + push notification — identical behaviour from UI or MCP.
 */
export async function createVerschlussAnforderung(
  params: CreateVerschlussAnforderungParams,
): Promise<ServiceResult<{ id: string }>> {
  const { userId, art, nachricht, endetAt, fristH, dauerH, deviceId, reinigungErlaubt } = params;

  if (!userId) return { ok: false, status: 400, error: "userId fehlt" };
  if (art !== "ANFORDERUNG" && art !== "SPERRZEIT") {
    return { ok: false, status: 400, error: "art muss ANFORDERUNG oder SPERRZEIT sein" };
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { ok: false, status: 404, error: "User nicht gefunden" };
  if (art === "ANFORDERUNG" && !user.email) {
    return { ok: false, status: 400, error: "User hat keine E-Mail-Adresse" };
  }

  // endetAt berechnen (Frist zum Einschliessen / Sperrzeit-Ende)
  let endetAtDate: Date | null = null;
  if (endetAt) {
    endetAtDate = new Date(endetAt);
    if (Number.isNaN(endetAtDate.getTime())) return { ok: false, status: 400, error: "Ungültiger Zeitpunkt" };
  } else if (fristH) {
    endetAtDate = new Date(Date.now() + fristH * 60 * 60 * 1000);
  }
  if (art === "ANFORDERUNG" && !endetAtDate) {
    return { ok: false, status: 400, error: "Frist zum Einschliessen ist erforderlich" };
  }

  if (deviceId && art === "ANFORDERUNG") {
    const device = await validateDeviceOwnership(deviceId, userId);
    if (!device) return { ok: false, status: 400, error: "Ungültiges Gerät" };
  }

  // Wrap state-check + withdraw + create in transaction to prevent TOCTOU race
  let anforderung;
  try {
    anforderung = await prisma.$transaction(async (tx) => {
      const latest = await tx.entry.findFirst({
        where: { userId, type: { in: ["VERSCHLUSS", "OEFFNEN"] } },
        orderBy: { startTime: "desc" },
      });
      const isLocked = latest?.type === "VERSCHLUSS";

      if (art === "ANFORDERUNG" && isLocked) throw Object.assign(new Error(), { _code: "ALREADY_LOCKED" });
      if (art === "SPERRZEIT" && !isLocked) throw Object.assign(new Error(), { _code: "NOT_LOCKED" });

      await tx.verschlussAnforderung.updateMany({
        where: { userId, art, fulfilledAt: null, withdrawnAt: null },
        data: { withdrawnAt: new Date() },
      });

      // reinigungErlaubt: SPERRZEIT always, ANFORDERUNG only with dauerH (inherited by auto-created SPERRZEIT)
      const effectiveDauerH = art === "ANFORDERUNG" ? (dauerH || null) : null;
      const effectiveReinigung = Boolean(
        reinigungErlaubt && (art === "SPERRZEIT" || effectiveDauerH !== null),
      );

      return tx.verschlussAnforderung.create({
        data: {
          userId,
          art,
          nachricht: nachricht?.trim() || null,
          endetAt: endetAtDate,
          dauerH: effectiveDauerH,
          deviceId: art === "ANFORDERUNG" ? (deviceId || null) : null,
          reinigungErlaubt: effectiveReinigung,
        },
      });
    });
  } catch (e: unknown) {
    const code = (e as { _code?: string })?._code;
    if (code === "ALREADY_LOCKED") return { ok: false, status: 400, error: "User ist bereits verschlossen" };
    if (code === "NOT_LOCKED") return { ok: false, status: 400, error: "User ist nicht verschlossen" };
    throw e;
  }

  await sendVerschlussAnforderungNotifications({ userId, user, art, nachricht, endetAtDate, dauerH });

  return { ok: true, data: { id: anforderung.id } };
}

/** Wraps email body HTML in the standard frame + "Zum Dashboard →" button. */
function dashboardEmailHtml(heading: string, innerHtml: string): string {
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  return `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#1e293b">${heading}</h2>
        ${innerHtml}
        <p>
          <a href="${baseUrl}/dashboard" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:bold">
            Zum Dashboard →
          </a>
        </p>
      </div>
      `;
}

/** Sends the e-mail (ANFORDERUNG/SPERRZEIT) + push to the user. Fire-and-forget for push. */
async function sendVerschlussAnforderungNotifications(opts: {
  userId: string;
  user: { email: string | null; username: string };
  art: "ANFORDERUNG" | "SPERRZEIT";
  nachricht?: string | null;
  endetAtDate: Date | null;
  dauerH?: number | null;
}) {
  const { userId, user, art, nachricht, endetAtDate, dauerH } = opts;
  const nachrichtHtml = nachricht?.trim()
    ? `<div style="background:#fef9c3;border:1px solid #fde047;border-radius:10px;padding:14px 18px;margin:16px 0"><p style="margin:0 0 4px 0;font-size:13px;font-weight:bold;color:#713f12">Nachricht des Admins:</p><p style="margin:0;font-size:15px;color:#422006">${escHtml(nachricht.trim())}</p></div>`
    : "";

  if (art === "SPERRZEIT" && user.email) {
    const bisHtml = endetAtDate
      ? `<p><strong>Gesperrt bis:</strong> ${formatDateTime(endetAtDate)}</p>`
      : `<p><strong>Dauer:</strong> Unbefristet</p>`;
    await sendMail(
      user.email,
      "KG-Tracker – Sperrzeit gesetzt",
      dashboardEmailHtml("Sperrzeit gesetzt",
        `<p>Hallo ${escHtml(user.username)},</p>
        <p>Der Admin hat eine Sperrzeit gesetzt. Du darfst dich in dieser Zeit nicht öffnen.</p>
        ${nachrichtHtml}
        ${bisHtml}`),
    );
  }

  if (art === "ANFORDERUNG" && user.email) {
    const deadlineHtml = endetAtDate
      ? `<p><strong>Bitte einschliessen bis:</strong> ${formatDateTime(endetAtDate)}</p>`
      : "";
    const dauerHtml = dauerH
      ? `<p><strong>Mindest-Tragedauer nach Einschliessen:</strong> ${dauerH >= 24 ? `${Math.floor(dauerH / 24)}T ${dauerH % 24 > 0 ? `${dauerH % 24}h` : ""}`.trim() : `${dauerH}h`}</p>`
      : "";
    await sendMail(
      user.email,
      "KG-Tracker – Einschliessen angefordert",
      dashboardEmailHtml("Einschliessen angefordert",
        `<p>Hallo ${escHtml(user.username)},</p>
        <p>Der Admin hat dich aufgefordert, dich einzuschliessen.</p>
        ${nachrichtHtml}
        ${deadlineHtml}
        ${dauerHtml}`),
    );
  }

  // Push (fire-and-forget)
  const pushTitle = art === "ANFORDERUNG" ? "Bitte einschliessen" : "Sperrzeit gesetzt";
  const pushParts: string[] = [];
  if (art === "ANFORDERUNG") {
    pushParts.push("Der Admin fordert dich auf, dich einzuschliessen.");
    if (endetAtDate) pushParts.push(`Frist: ${formatDateTime(endetAtDate)}`);
  } else {
    pushParts.push(endetAtDate ? `Bis: ${formatDateTime(endetAtDate)}` : "Unbefristet");
  }
  if (nachricht?.trim()) pushParts.push(nachricht.trim());
  sendPushToUser(userId, pushTitle, pushParts.join(" · "), "/dashboard").catch(() => { /* ignore push errors */ });
}
