import { prisma } from "@/lib/prisma";
import { sendMail, escHtml, dashboardEmailHtml } from "@/lib/mail";
import { sendPushToUser } from "@/lib/push";

/**
 * Generischer Benachrichtigungs-Helper für einfache Status-Meldungen an den Nutzer
 * (E-Mail + Push). Eine Klartext-Message wird sowohl im Mail-Body als auch im Push verwendet.
 * Push ist fire-and-forget; ohne hinterlegte E-Mail wird nur Push versendet.
 *
 * Für reichhaltige, mehrzeilige Benachrichtigungen (z.B. Verschluss/Orgasmus mit Fenster + Frist)
 * gibt es weiterhin die spezialisierten send…Notifications-Helfer in den jeweiligen Services.
 */
export async function notifyUser(
  userId: string,
  opts: { subject: string; message: string; url?: string },
): Promise<void> {
  const { subject, message, url = "/dashboard" } = opts;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, username: true } });
  if (!user) return;

  if (user.email) {
    await sendMail(
      user.email,
      `KG-Tracker – ${subject}`,
      dashboardEmailHtml(subject, `<p>Hallo ${escHtml(user.username)},</p><p>${escHtml(message)}</p>`),
    );
  }
  sendPushToUser(userId, subject, message, url).catch(() => { /* ignore push errors */ });
}
