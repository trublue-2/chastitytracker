import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendMail, escHtml } from "@/lib/mail";
import crypto from "crypto";

// IP-based rate limit: max 5 requests per hour
const resetBucket = new Map<string, { count: number; resetAt: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of resetBucket) if (v.resetAt < now) resetBucket.delete(k);
}, 30 * 60 * 1000);

function isResetRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = resetBucket.get(ip);
  if (!entry || entry.resetAt < now) {
    resetBucket.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return false;
  }
  entry.count++;
  return entry.count > 5;
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ??
    req.headers.get("x-real-ip") ?? "unknown";
  if (isResetRateLimited(ip)) {
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

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1h

  await prisma.passwordResetToken.create({
    data: { token, userId: user.id, expiresAt },
  });

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const resetUrl = `${baseUrl}/reset-password?token=${token}`;

  await sendMail(
    user.email,
    "KG-Tracker – Passwort zurücksetzen",
    `
    <p>Hallo ${escHtml(user.username)},</p>
    <p>du hast eine Passwort-Zurücksetzung angefordert.</p>
    <p><a href="${resetUrl}">Passwort jetzt zurücksetzen</a></p>
    <p>Der Link ist 1 Stunde gültig.</p>
    <p>Falls du diese Anfrage nicht gestellt hast, kannst du diese Mail ignorieren.</p>
    `
  );

  return NextResponse.json({ ok: true });
}
