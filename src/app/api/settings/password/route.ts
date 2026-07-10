import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/authGuards";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { passwordErrorCode } from "@/lib/constants";

// Eigener Handler statt userSelfFieldRoute: der Body-Key (`newPassword`) weicht von der Spalte
// (`passwordHash`) ab und der Wert wird vor dem Schreiben gehasht.
export async function PATCH(req: NextRequest) {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;

  // Bewusste Produkt-Entscheidung: das alte Passwort wird NICHT verlangt.
  // Der Session-Token ist bereits der Authentifizierungsnachweis.
  const { newPassword } = await req.json();
  const pwErr = passwordErrorCode(newPassword);
  if (pwErr) return NextResponse.json({ error: pwErr }, { status: 400 });

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: session.user.id }, data: { passwordHash } });

  return NextResponse.json({ ok: true });
}
