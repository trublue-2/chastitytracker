import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { passwordErrorCode } from "@/lib/constants";

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Bewusste Produkt-Entscheidung: das alte Passwort wird NICHT verlangt.
  // Der Session-Token ist bereits der Authentifizierungsnachweis.
  const { newPassword } = await req.json();
  const pwErr = passwordErrorCode(newPassword);
  if (pwErr) return NextResponse.json({ error: pwErr }, { status: 400 });

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: session.user.id }, data: { passwordHash } });

  return NextResponse.json({ ok: true });
}
