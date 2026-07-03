import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { hashToken } from "@/lib/oauth";
import { passwordErrorCode } from "@/lib/constants";

export async function POST(req: Request) {
  const { token, password } = await req.json();
  if (!token || !password) return NextResponse.json({ error: "missingFields" }, { status: 400 });
  const pwErr = passwordErrorCode(password);
  if (pwErr) return NextResponse.json({ error: pwErr }, { status: 400 });

  // L1: Token wird nur als SHA-256-Hash gespeichert — eingehenden Klartext-Token hashen und so suchen.
  const tokenHash = hashToken(token);
  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { token: tokenHash },
    include: { user: true },
  });

  if (!resetToken || resetToken.expiresAt < new Date()) {
    return NextResponse.json({ error: "tokenInvalid" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.$transaction([
    prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.delete({ where: { token: tokenHash } }),
  ]);

  return NextResponse.json({ ok: true });
}
