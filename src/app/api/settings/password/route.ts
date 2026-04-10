import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { validatePassword } from "@/lib/constants";

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { currentPassword, newPassword } = await req.json();
  if (!currentPassword) return NextResponse.json({ error: "Aktuelles Passwort fehlt" }, { status: 400 });
  if (!newPassword) return NextResponse.json({ error: "Neues Passwort fehlt" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { passwordHash: true } });
  if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return NextResponse.json({ error: "wrongPassword" }, { status: 401 });
  }

  const pwErr = validatePassword(newPassword);
  if (pwErr) return NextResponse.json({ error: pwErr }, { status: 400 });

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: session.user.id }, data: { passwordHash } });

  return NextResponse.json({ ok: true });
}
