import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// „Eigene Karte in der Keyholder-Übersicht ausblenden" ist ein USER-SELF-Feld (eigene Präferenz).
// Per CLAUDE.md brauchen nur admin-gesetzte Felder requireAdminApi() — Session-Auth ist hier korrekt.
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { hideOwnTracker } = await req.json();
  if (typeof hideOwnTracker !== "boolean") {
    return NextResponse.json({ error: "invalidHideOwnTracker" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { hideOwnTracker },
  });

  return NextResponse.json({ ok: true });
}
