import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendMail, escHtml, appBaseUrl } from "@/lib/mail";
import { emailT, emailGreeting } from "@/lib/emailI18n";
import { checkRateLimit } from "@/lib/rate-limit";
import { hashToken } from "@/lib/oauth";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ??
    req.headers.get("x-real-ip") ?? "unknown";

  const rl = await checkRateLimit(`fp:${ip}`, 5, 60 * 60 * 1000);
  if (rl.limited) {
    return NextResponse.json({ ok: true }); // silent — don't reveal rate limiting
  }

  const { username } = await req.json();
  if (!username) return NextResponse.json({ error: "Username fehlt" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { username } });

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
  await sendMail(
    user.email,
    `KG-Tracker – ${t("passwordResetSubject")}`,
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
