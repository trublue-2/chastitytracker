import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getActiveSperrzeit } from "@/lib/queries";
import { heimdallEnabled } from "@/lib/constants";

export const dynamic = "force-dynamic";

// Box-Status für den eingeloggten Sub — reine Status-Anzeige (Ist/Soll/Frische) für die
// Box-Status-Karte und die (+)-Menü-Box-Zeile. KEINE Kommandos mehr: die Box FOLGT den
// Verschluss-/Öffnen-Einträgen (Kopplung in /api/entries), Reinigung = OEFFNEN(Reinigung)+Verschluss.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Heimdall-Box ist ein eigenständiges Feature: ohne Sync-Secret keine Box-UI (auch wenn
  // noch alte BoxStatus-Zeilen in der DB liegen).
  if (!heimdallEnabled()) return NextResponse.json([]);
  const userId = session.user.id;

  const [boxes, sperre] = await Promise.all([
    prisma.boxStatus.findMany({
      where: { userId },
      orderBy: { name: "asc" },
      select: { boxId: true, name: true, locked: true, lockUntil: true, simpleLock: true, keyholderLocked: true, lastSyncAt: true },
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
      simpleLock: b.simpleLock,
      keyholderLocked: b.keyholderLocked || !!sperre,
      lockUntil: (sperre ? sperre.endetAt : b.lockUntil)?.toISOString() ?? null,
      // Frische: wann die Box zuletzt gesynct hat (für „gerade aktiv / zuletzt vor X").
      lastSyncAt: b.lastSyncAt?.toISOString() ?? null,
    })),
  );
}
