import { prisma } from "@/lib/prisma";
import { sendMail, escHtml } from "@/lib/mail";
import { formatDateTime } from "@/lib/utils";
import { sendPushToUser } from "@/lib/push";
import { ORGASMUS_ANFORDERUNG_ARTEN, ORGASMUS_ARTEN } from "@/lib/constants";
import { notifyUser } from "@/lib/notify";
import type { ServiceResult } from "@/lib/serviceResult";

export interface CreateOrgasmusAnforderungParams {
  userId: string;
  art: "ANWEISUNG" | "GELEGENHEIT";
  nachricht?: string | null;
  /** Window start (ISO string or Date). */
  beginntAt: string | Date;
  /** Window end (ISO string or Date). Must be after beginntAt. */
  endetAt: string | Date;
  /** Required orgasm type base (from ORGASMUS_ARTEN); null/undefined = any orgasm counts. */
  vorgegebeneArt?: string | null;
  /** Whether opening to perform the orgasm during the window is permitted (no Sperre break / penalty). */
  oeffnenErlaubt?: boolean;
}

/**
 * Creates an OrgasmusAnforderung (keyholder orgasm directive) for a user.
 * Single source of truth shared by POST /api/admin/orgasmus-anforderung and the MCP request_orgasm tool.
 * Withdraws an existing open directive (one active at a time) and notifies the user by e-mail + push —
 * identical behaviour whether triggered from the admin UI or the MCP.
 */
export async function createOrgasmusAnforderung(
  params: CreateOrgasmusAnforderungParams,
): Promise<ServiceResult<{ id: string }>> {
  const { userId, art, nachricht, beginntAt, endetAt, vorgegebeneArt, oeffnenErlaubt } = params;

  if (!userId) return { ok: false, status: 400, error: "userId fehlt" };
  if (!(ORGASMUS_ANFORDERUNG_ARTEN as readonly string[]).includes(art)) {
    return { ok: false, status: 400, error: "art muss ANWEISUNG oder GELEGENHEIT sein" };
  }
  if (!beginntAt || !endetAt) {
    return { ok: false, status: 400, error: "Start und Ende des Fensters sind erforderlich" };
  }
  const beginnt = new Date(beginntAt);
  const endet = new Date(endetAt);
  if (Number.isNaN(beginnt.getTime()) || Number.isNaN(endet.getTime())) {
    return { ok: false, status: 400, error: "Ungültiger Zeitpunkt" };
  }
  if (endet <= beginnt) {
    return { ok: false, status: 400, error: "Ende muss nach dem Start liegen" };
  }
  if (vorgegebeneArt && !(ORGASMUS_ARTEN as readonly string[]).includes(vorgegebeneArt)) {
    return { ok: false, status: 400, error: "Ungültige Orgasmus-Art" };
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { ok: false, status: 404, error: "User nicht gefunden" };

  // Withdraw existing open request + create the new one atomically (one active at a time).
  const anforderung = await prisma.$transaction(async (tx) => {
    await tx.orgasmusAnforderung.updateMany({
      where: { userId, fulfilledAt: null, withdrawnAt: null },
      data: { withdrawnAt: new Date() },
    });
    return tx.orgasmusAnforderung.create({
      data: {
        userId,
        art,
        nachricht: nachricht?.trim() || null,
        beginntAt: beginnt,
        endetAt: endet,
        vorgegebeneArt: vorgegebeneArt || null,
        oeffnenErlaubt: Boolean(oeffnenErlaubt),
      },
    });
  });

  await sendOrgasmusAnforderungNotifications({
    userId, user, art, nachricht, beginnt, endet, vorgegebeneArt, oeffnenErlaubt: Boolean(oeffnenErlaubt),
  });

  return { ok: true, data: { id: anforderung.id } };
}

/** Withdraws the user's currently open orgasm directive(s) (not yet fulfilled/withdrawn). */
export async function withdrawOrgasmusAnforderung(userId: string): Promise<ServiceResult<{ count: number }>> {
  const res = await prisma.orgasmusAnforderung.updateMany({
    where: { userId, fulfilledAt: null, withdrawnAt: null },
    data: { withdrawnAt: new Date() },
  });
  if (res.count > 0) {
    await notifyUser(userId, {
      subject: "Orgasmus-Anweisung zurückgezogen",
      message: "Der Keyholder hat die offene Orgasmus-Anweisung/-Gelegenheit zurückgezogen.",
    });
  }
  return { ok: true, data: { count: res.count } };
}

/** Sends the directive e-mail + push to the user. Push is fire-and-forget. */
async function sendOrgasmusAnforderungNotifications(opts: {
  userId: string;
  user: { email: string | null; username: string };
  art: "ANWEISUNG" | "GELEGENHEIT";
  nachricht?: string | null;
  beginnt: Date;
  endet: Date;
  vorgegebeneArt?: string | null;
  oeffnenErlaubt: boolean;
}) {
  const { userId, user, art, nachricht, beginnt, endet, vorgegebeneArt, oeffnenErlaubt } = opts;
  const istAnweisung = art === "ANWEISUNG";
  const betreff = istAnweisung ? "Orgasmus angewiesen" : "Orgasmus-Gelegenheit";
  const einleitung = istAnweisung
    ? "Der Keyholder weist dich an, in diesem Zeitfenster einen Orgasmus zu erfassen."
    : "Der Keyholder gibt dir in diesem Zeitfenster die Gelegenheit für einen Orgasmus.";

  if (user.email) {
    const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    const nachrichtHtml = nachricht?.trim()
      ? `<div style="background:#fef9c3;border:1px solid #fde047;border-radius:10px;padding:14px 18px;margin:16px 0"><p style="margin:0 0 4px 0;font-size:13px;font-weight:bold;color:#713f12">Nachricht des Keyholders:</p><p style="margin:0;font-size:15px;color:#422006">${escHtml(nachricht.trim())}</p></div>`
      : "";
    const artHtml = vorgegebeneArt ? `<p><strong>Vorgegebene Art:</strong> ${escHtml(vorgegebeneArt)}</p>` : "";
    const oeffnenHtml = oeffnenErlaubt ? `<p><strong>Öffnen erlaubt:</strong> Du darfst dich in diesem Fenster zum Orgasmus öffnen.</p>` : "";
    await sendMail(
      user.email,
      `KG-Tracker – ${betreff}`,
      `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2 style="color:#1e293b">${escHtml(betreff)}</h2>
          <p>Hallo ${escHtml(user.username)},</p>
          <p>${escHtml(einleitung)}</p>
          ${nachrichtHtml}
          <p><strong>Fenster:</strong> ${formatDateTime(beginnt)} – ${formatDateTime(endet)}</p>
          ${artHtml}
          ${oeffnenHtml}
          <p>
            <a href="${baseUrl}/dashboard" style="display:inline-block;background:#be185d;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:bold">
              Zum Dashboard →
            </a>
          </p>
        </div>
        `
    );
  }

  const pushParts: string[] = [`Fenster: ${formatDateTime(beginnt)} – ${formatDateTime(endet)}`];
  if (vorgegebeneArt) pushParts.push(vorgegebeneArt);
  if (nachricht?.trim()) pushParts.push(nachricht.trim());
  sendPushToUser(userId, betreff, pushParts.join(" · "), "/dashboard").catch(() => { /* ignore push errors */ });
}
