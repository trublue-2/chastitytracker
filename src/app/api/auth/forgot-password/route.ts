import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mail";
import crypto from "crypto";

export async function POST(req: Request) {
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
    <p>Hallo ${user.username},</p>
    <p>du hast eine Passwort-Zurücksetzung angefordert.</p>
    <p><a href="${resetUrl}">Passwort jetzt zurücksetzen</a></p>
    <p>Der Link ist 1 Stunde gültig.</p>
    <p>Falls du diese Anfrage nicht gestellt hast, kannst du diese Mail ignorieren.</p>
    `
  );

  return NextResponse.json({ ok: true });
}
