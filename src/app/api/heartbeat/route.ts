import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getActiveSperrzeit, getActiveOrgasmusAnforderung, aktiveKontrolleWhere, activeVerschlussAnforderungWhere, openLockRequestWhere, LOCK_REQUEST_ORDER } from "@/lib/queries";

/**
 * Konsolidierter Client-Heartbeat: EIN Endpoint + EIN Poll deckt vier Belange ab, die vorher je
 * einen eigenen Timer/Endpoint hatten:
 *  - buildDate     → neue App-Version verfügbar (Reload-Banner)
 *  - sessionUserId → Account-Wechsel in einem anderen Tab (Hard-Reload)
 *  - pendingSig    → Signatur der offenen keyholder-initiierten Anforderungen (router.refresh,
 *                    damit z.B. neu angeforderte Kontrollen ohne manuellen Reload erscheinen)
 *                    + wartende KI-Verifikationen (verifikationStatus "pending") — sobald eine
 *                    davon abgeschlossen ist (ai/rejected/unverified), ändert sich die Signatur
 *                    und der Client aktualisiert automatisch, ohne manuellen Reload.
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
  const [kontrollen, anforderungen, sperrzeit, orgasmus, pendingVerifications] = await Promise.all([
    prisma.kontrollAnforderung.findMany({
      where: { userId, entryId: null, withdrawnAt: null, ...aktiveKontrolleWhere(now) },
      select: { id: true },
    }),
    // ALLE offenen (und bereits ausgelösten) — mehrere dürfen koexistieren. Nur die erste zu nehmen
    // hiesse: eine hinzukommende oder zurückgezogene zweite ändert die Signatur nicht, und das
    // Sub-UI aktualisiert nie. Geplante bleiben draussen, sie sind für den Sub unsichtbar.
    prisma.verschlussAnforderung.findMany({
      where: { ...openLockRequestWhere(userId), ...activeVerschlussAnforderungWhere(now) },
      select: { id: true },
      orderBy: LOCK_REQUEST_ORDER,
    }),
    getActiveSperrzeit(userId),
    getActiveOrgasmusAnforderung(userId, now),
    // Nutzt den bestehenden Index [userId, type, startTime desc]; verifikationStatus ist nicht
    // indiziert, aber pending-Fälle sind normalerweise wenige und kurzlebig (KI-Check läuft
    // Sekunden). take + orderBy grenzen den Scan trotzdem nach oben ab.
    prisma.entry.findMany({
      where: { userId, type: "PRUEFUNG", verifikationStatus: "pending" },
      select: { id: true },
      orderBy: { startTime: "desc" },
      take: 10,
    }),
  ]);

  const pendingSig = [
    "k:" + kontrollen.map((k) => k.id).sort().join(","),
    "v:" + anforderungen.map((a) => a.id).sort().join(","),
    "s:" + (sperrzeit?.id ?? ""),
    "o:" + (orgasmus?.id ?? ""),
    "p:" + pendingVerifications.map((p) => p.id).sort().join(","),
  ].join("|");

  return NextResponse.json({ buildDate, sessionUserId: userId, pendingSig }, { headers: { "Cache-Control": "no-store" } });
}
