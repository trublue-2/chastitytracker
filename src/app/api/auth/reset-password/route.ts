import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  const { token, password } = await req.json();
  if (!token || !password) return NextResponse.json({ error: "Fehlende Felder" }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: "Passwort zu kurz (min. 8 Zeichen)" }, { status: 400 });
  if (Buffer.byteLength(password, "utf8") > 72) return NextResponse.json({ error: "Passwort zu lang (max. 72 Zeichen)" }, { status: 400 });

  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!resetToken || resetToken.expiresAt < new Date()) {
    return NextResponse.json({ error: "Token ungültig oder abgelaufen" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.$transaction([
    prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.delete({ where: { token } }),
  ]);

  return NextResponse.json({ ok: true });
}
