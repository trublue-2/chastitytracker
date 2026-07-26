import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getActiveSperrzeit, getActiveOrgasmusAnforderung, aktiveKontrolleWhere, activeVerschlussAnforderungWhere, openLockRequestWhere, LOCK_REQUEST_ORDER } from "@/lib/queries";
import { visionConfigured } from "@/lib/vision";

/** So lange gilt eine noch offene Erkennung als „läuft gerade" (steuert nur den Poll-Takt). */
const SETTLING_WINDOW_MS = 10 * 60_000;

/**
 * Konsolidierter Client-Heartbeat: EIN Endpoint + EIN Poll deckt vier Belange ab, die vorher je
 * einen eigenen Timer/Endpoint hatten:
 *  - buildDate     → neue App-Version verfügbar (Reload-Banner)
 *  - sessionUserId → Account-Wechsel in einem anderen Tab (Hard-Reload)
 *  - pendingSig    → Signatur der offenen keyholder-initiierten Anforderungen (router.refresh,
 *                    damit z.B. neu angeforderte Kontrollen ohne manuellen Reload erscheinen)
 *                    + wartende KI-Verifikationen (verifikationStatus "pending") und wartende
 *                    Schlüssel-Erkennungen (Box-Foto ohne `keyDetected`) — sobald eine davon
 *                    abgeschlossen ist, ändert sich die Signatur und der Client aktualisiert
 *                    automatisch, ohne manuellen Reload.
 *  - settling      → läuft gerade eine dieser Erkennungen? Dann pollt der Client dichter.
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
  const [kontrollen, anforderungen, sperrzeit, orgasmus, pendingVerifications, pendingKeyChecks] = await Promise.all([
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
      select: { id: true, createdAt: true },
      orderBy: { startTime: "desc" },
      take: 10,
    }),
    // Box-Foto ohne Schlüssel-Urteil. Ohne Vision-Provider fällt NIE eines — dann gar nicht erst
    // fragen, sonst stünden alle Box-Einträge dieses Nutzers dauerhaft als „wartend" da.
    visionConfigured()
      ? prisma.entry.findMany({
          where: { userId, boxImageUrl: { not: null }, keyDetected: null },
          select: { id: true, createdAt: true },
          orderBy: { startTime: "desc" },
          take: 10,
        })
      : Promise.resolve([]),
  ]);

  const pendingSig = [
    "k:" + kontrollen.map((k) => k.id).sort().join(","),
    "v:" + anforderungen.map((a) => a.id).sort().join(","),
    "s:" + (sperrzeit?.id ?? ""),
    "o:" + (orgasmus?.id ?? ""),
    "p:" + pendingVerifications.map((p) => p.id).sort().join(","),
    "b:" + pendingKeyChecks.map((p) => p.id).sort().join(","),
  ].join("|");

  // Läuft gerade eine Erkennung? Der Client pollt dann dichter, statt bis zu 30 s auf ein Ergebnis
  // zu warten, das in Sekunden da ist.
  //
  // Das Zeitfenster gilt NUR hier, bewusst nicht in `pendingSig`: eine Erkennung, die nach zehn
  // Minuten kein Urteil hat, bekommt keines mehr (Prozess beim Deploy neu gestartet, Modell
  // antwortete „weiss nicht", Bild unlesbar). Ohne die Begrenzung bliebe der 3-s-Takt für diesen
  // Nutzer dauerhaft an. In der Signatur hätte dasselbe Fenster dagegen geschadet: die Zeile fiele
  // nach zehn Minuten allein durch Zeitablauf heraus, die Signatur änderte sich, und der Client
  // liefe ein Refresh für eine Änderung, die es nie gab.
  const settlingSince = now.getTime() - SETTLING_WINDOW_MS;
  const settling = [...pendingVerifications, ...pendingKeyChecks]
    .some((e) => e.createdAt.getTime() >= settlingSince);

  return NextResponse.json({ buildDate, sessionUserId: userId, pendingSig, settling }, { headers: { "Cache-Control": "no-store" } });
}
