import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { newPassword } = await req.json();

  if (!newPassword) {
    return NextResponse.json({ error: "Neues Passwort fehlt" }, { status: 400 });
  }
  if (newPassword.length < 8) {
    return NextResponse.json({ error: "Neues Passwort zu kurz (min. 8 Zeichen)" }, { status: 400 });
  }
  // Prevent bcrypt silent truncation at 72 bytes
  if (Buffer.byteLength(newPassword, "utf8") > 72) {
    return NextResponse.json({ error: "Neues Passwort zu lang (max. 72 Zeichen)" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: session.user.id }, data: { passwordHash } });

  return NextResponse.json({ ok: true });
}
