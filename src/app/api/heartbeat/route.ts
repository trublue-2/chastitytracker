import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getActiveSperrzeit, getActiveOrgasmusAnforderung, aktiveKontrolleWhere } from "@/lib/queries";

/**
 * Konsolidierter Client-Heartbeat: EIN Endpoint + EIN Poll deckt drei Belange ab, die vorher je
 * einen eigenen Timer/Endpoint hatten:
 *  - buildDate     → neue App-Version verfügbar (Reload-Banner)
 *  - sessionUserId → Account-Wechsel in einem anderen Tab (Hard-Reload)
 *  - pendingSig    → Signatur der offenen keyholder-initiierten Anforderungen (router.refresh,
 *                    damit z.B. neu angeforderte Kontrollen ohne manuellen Reload erscheinen)
 * Nur leichte Werte/IDs; ohne Session bleiben die per-User-Felder leer (Version funktioniert auch
 * ausgeloggt).
 */
export async function GET() {
  const buildDate = process.env.BUILD_DATE ?? "local";
  const session = await auth();
  if (!session) {
    return NextResponse.json({ buildDate, sessionUserId: null, pendingSig: "" }, { headers: { "Cache-Control": "no-store" } });
  }

  const userId = session.user.id;
  const now = new Date();
  const [kontrollen, verschluss, sperrzeit, orgasmus] = await Promise.all([
    prisma.kontrollAnforderung.findMany({
      where: { userId, entryId: null, withdrawnAt: null, ...aktiveKontrolleWhere(now) },
      select: { id: true },
    }),
    prisma.verschlussAnforderung.findFirst({
      where: { userId, art: "ANFORDERUNG", fulfilledAt: null, withdrawnAt: null },
      select: { id: true },
    }),
    getActiveSperrzeit(userId),
    getActiveOrgasmusAnforderung(userId, now),
  ]);

  const pendingSig = [
    "k:" + kontrollen.map((k) => k.id).sort().join(","),
    "v:" + (verschluss?.id ?? ""),
    "s:" + (sperrzeit?.id ?? ""),
    "o:" + (orgasmus?.id ?? ""),
  ].join("|");

  return NextResponse.json({ buildDate, sessionUserId: userId, pendingSig }, { headers: { "Cache-Control": "no-store" } });
}
