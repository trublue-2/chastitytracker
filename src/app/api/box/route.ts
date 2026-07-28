import { NextRequest, NextResponse } from "next/server";
import { requireApi, requireKeyholderOrAdminApi } from "@/lib/authGuards";
import { prisma } from "@/lib/prisma";
import { getActiveSperrzeit } from "@/lib/queries";
import { heimdallEnabled } from "@/lib/constants";
import { toPendingCommand } from "@/lib/boxStatus";

export const dynamic = "force-dynamic";

// Ohne expliziten no-store-Header cached v.a. der WKWebView (iOS-App) die GET-Antwort — der
// 5-s-Poll der BoxStatusCard „läuft" dann, liefert aber stur den alten Stand, bis ein
// Seitenwechsel neue Requests erzwingt (realer Vorfall 16.07).
const NO_STORE = { headers: { "Cache-Control": "no-store" } };

// Box-Status für den eingeloggten Sub — reine Status-Anzeige (Ist/Soll/Frische) für die
// Box-Status-Karte. KEINE Kommandos mehr: die Box FOLGT den Verschluss-/Öffnen-Einträgen
// (Kopplung in /api/entries), Reinigung = OEFFNEN(Reinigung)+Verschluss.
//
// `?userId=` schaltet auf die KEYHOLDER-Sicht: dieselbe Karte, aber für einen fremden Sub. Ohne
// den Parameter bleibt die Route exakt selbst-bezogen — die Sub-Sicht kann also nie versehentlich
// fremde Boxen zeigen, und der Guard greift nur auf dem Pfad, der ihn wirklich braucht.
export async function GET(req: NextRequest) {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;
  // Heimdall-Box ist ein eigenständiges Feature: ohne Sync-Secret keine Box-UI (auch wenn
  // noch alte BoxStatus-Zeilen in der DB liegen).
  if (!heimdallEnabled()) return NextResponse.json([], NO_STORE);
  // `||` statt `??`: ein leerer `?userId=` ist kein Ziel, sondern ein kaputter Aufruf — er soll auf
  // die Selbst-Sicht fallen, nicht als fremde (nirgends existierende) User-Id weitergereicht werden.
  const userId = req.nextUrl.searchParams.get("userId") || session.user.id;
  if (userId !== session.user.id) {
    const denied = await requireKeyholderOrAdminApi(userId);
    if (denied) return denied;
  }

  const [boxes, sperre] = await Promise.all([
    prisma.boxStatus.findMany({
      where: { userId },
      orderBy: { name: "asc" },
      select: { boxId: true, name: true, locked: true, reportedLocked: true, lockUntil: true, simpleLock: true, keyholderLocked: true, lastSyncAt: true, pendingCommand: true, offlineOpenHours: true, battery: true, charging: true, lowBatteryOpenPercent: true },
    }),
    getActiveSperrzeit(userId),
  ]);

  // Tracker-eigene Sperrzeit sofort überlagern — der gepushte BoxStatus hinkt ihr nach (Heimdall
  // zieht sie erst beim nächsten Box-Sync), sonst zeigte das Soll fälschlich „offen".
  return NextResponse.json(
    boxes.map((b) => ({
      boxId: b.boxId,
      name: b.name,
      locked: b.locked,
      // IST getrennt vom SOLL: seit dem Präsenz-Guard kann die Box offen stehen, obwohl sie zu
      // sein soll (wartet auf Knopf/USB) — die Anzeige darf das SOLL nicht als „Ist" etikettieren.
      reportedLocked: b.reportedLocked,
      // Noch nicht von der Box abgeholtes Eintrags-Kommando — tracker-LOKALES Wissen, sofort da.
      // Der Spiegel (locked/reportedLocked) hinkt bis zum nächsten Box-Sync nach; die Karte zeigt
      // damit den Übergang („angefordert — Knopfdruck vollzieht") ohne auf Heimdall zu warten.
      pendingCommand: toPendingCommand(b.pendingCommand),
      simpleLock: b.simpleLock,
      keyholderLocked: b.keyholderLocked || !!sperre,
      lockUntil: (sperre ? sperre.endetAt : b.lockUntil)?.toISOString() ?? null,
      // Frische: wann die Box zuletzt gesynct hat (für „gerade aktiv / zuletzt vor X").
      lastSyncAt: b.lastSyncAt?.toISOString() ?? null,
      // Failsafe-Vorwarnung (boxFailsafeWarnings) + Dauer-Akkuanzeige (boxBatteryLabel): die beiden
      // Schwellen, ab denen die Box sich SELBST öffnet, plus Akkustand und Ladezustand. Die
      // Schwellen kommen aus dem Heimdall-Push und werden hier nur durchgereicht — der Tracker
      // rechnet keine nach und rät keine.
      offlineOpenHours: b.offlineOpenHours,
      battery: b.battery,
      charging: b.charging,
      lowBatteryOpenPercent: b.lowBatteryOpenPercent,
    })),
    NO_STORE,
  );
}
