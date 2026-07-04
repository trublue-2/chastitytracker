import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isValidStartPage } from "@/lib/constants";

// Startseite nach Login ist ein USER-SELF-Feld (eigene Präferenz). Per CLAUDE.md brauchen nur
// admin-gesetzte Felder requireAdminApi() — normale Session-Auth ist hier korrekt.
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { startPage } = await req.json();
  if (!isValidStartPage(startPage)) {
    return NextResponse.json({ error: "invalidStartPage" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { startPage },
  });

  return NextResponse.json({ ok: true });
}
