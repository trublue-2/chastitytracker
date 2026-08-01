import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { hashToken } from "@/lib/oauth";
import { passwordErrorCode } from "@/lib/constants";
import { buildAdminPasswordChangeRows } from "@/lib/passwordAudit";

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
  // Der Nachweis wird VOR der Transaktion gebaut (er liest) und IN ihr geschrieben: Ein Reset per
  // Postfach-Token ohne Nachweis ist genau der Vorgang, den das Strafbuch sehen soll — er darf
  // nicht durch einen Absturz zwischen zwei Schritten verlorengehen. `actorUserId` bleibt null:
  // dieser Weg hat keine Sitzung, wer den Token eingelöst hat, ist technisch nicht feststellbar.
  const auditRows = await buildAdminPasswordChangeRows(resetToken.userId, "reset_token", null);
  await prisma.$transaction([
    prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.delete({ where: { token: tokenHash } }),
    ...(auditRows.length > 0 ? [prisma.adminPasswordChange.createMany({ data: auditRows })] : []),
  ]);

  return NextResponse.json({ ok: true });
}
