import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getActiveSperrzeit, getActiveOrgasmusAnforderung, subVisibleKontrolleWhere } from "@/lib/queries";

/**
 * Leichtgewichtige Signatur der aktuell für den Sub sichtbaren keyholder-initiierten Anforderungen
 * (offene Kontrollen, Verschluss-/Orgasmus-Anforderung, aktive Sperrzeit). Der Client pollt das und
 * löst nur bei Änderung ein router.refresh() aus — so erscheinen z.B. neu angeforderte Kontrollen
 * ohne manuellen Reload. Nur IDs, kein schwerer Payload.
 */
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const now = new Date();
  const [kontrollen, verschluss, sperrzeit, orgasmus] = await Promise.all([
    prisma.kontrollAnforderung.findMany({
      where: { userId, entryId: null, withdrawnAt: null, ...subVisibleKontrolleWhere(now) },
      select: { id: true },
    }),
    prisma.verschlussAnforderung.findFirst({
      where: { userId, art: "ANFORDERUNG", fulfilledAt: null, withdrawnAt: null },
      select: { id: true },
    }),
    getActiveSperrzeit(userId),
    getActiveOrgasmusAnforderung(userId, now),
  ]);

  const sig = [
    "k:" + kontrollen.map((k) => k.id).sort().join(","),
    "v:" + (verschluss?.id ?? ""),
    "s:" + (sperrzeit?.id ?? ""),
    "o:" + (orgasmus?.id ?? ""),
  ].join("|");

  return NextResponse.json({ sig }, { headers: { "Cache-Control": "no-store" } });
}
