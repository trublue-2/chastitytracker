import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/shared/prisma";
import { sendMailSafe, escHtml, appBaseUrl } from "@/lib/messages/mail";
import { emailT, emailGreeting } from "@/lib/messages/emailI18n";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { clientIp } from "@/lib/auth/clientIp";
import { hashToken } from "@/lib/auth/oauth";
import crypto from "crypto";
import { APP_NAME } from "@/lib/shared/constants";
import { findUserByLogin } from "@/lib/auth/loginIdentity";

export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);

  const rl = await checkRateLimit(`fp:${ip}`, 5, 60 * 60 * 1000);
  if (rl.limited) {
    return NextResponse.json({ ok: true }); // silent — don't reveal rate limiting
  }

  // Im Feld steht Benutzername ODER E-Mail — aufgelöst wie bei der Anmeldung (`findUserByLogin`).
  const { username } = await req.json();
  if (!username) return NextResponse.json({ error: "Username fehlt" }, { status: 400 });

  const user = await findUserByLogin(username);

  // Immer gleiche Antwort – kein User-Enumeration
  if (!user?.email) {
    return NextResponse.json({ ok: true });
  }

  // Alte Tokens löschen
  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });

  const token = crypto.randomBytes(32).toString("hex"); // Klartext nur im Mail-Link
  // L1: nur den Hash speichern — bei DB-Leak ist der gespeicherte Wert nicht direkt nutzbar.
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1h

  await prisma.passwordResetToken.create({
    data: { token: tokenHash, userId: user.id, expiresAt },
  });

  const resetUrl = `${appBaseUrl()}/reset-password?token=${token}`;

  const t = await emailT(user.locale);
  // Nicht abwarten: der SMTP-Versand dauert Sekunden, und genau diese Zeit verriete, ob es den
  // Nutzer gibt (die Antwort ist sonst für Bekannte und Unbekannte gleich). `sendMailSafe` wirft nie
  // und protokolliert einen Fehlschlag selbst.
  void sendMailSafe(
    user.email,
    `${APP_NAME} – ${t("passwordResetSubject")}`,
    `
    ${emailGreeting(t, user.username)}
    <p>${escHtml(t("passwordResetIntro"))}</p>
    <p><a href="${resetUrl}">${escHtml(t("passwordResetLinkText"))}</a></p>
    <p>${escHtml(t("passwordResetValidity"))}</p>
    <p>${escHtml(t("passwordResetIgnore"))}</p>
    `
  );

  return NextResponse.json({ ok: true });
}
