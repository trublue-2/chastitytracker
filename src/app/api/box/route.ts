import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getActiveSperrzeit } from "@/lib/queries";
import { aktivesReinigungsFenster, reinigungVerbrauchtHeute } from "@/lib/reinigungService";

export const dynamic = "force-dynamic";

// Box-Status für den eingeloggten Sub — fürs (+)-Menü (verschliessen/öffnen/Reinigung/anzeigen).
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const now = new Date();

  const [boxes, sperre, user] = await Promise.all([
    prisma.boxStatus.findMany({
      where: { userId },
      orderBy: { name: "asc" },
      select: { boxId: true, name: true, locked: true, lockUntil: true, simpleLock: true, keyholderLocked: true, pendingCommand: true },
    }),
    getActiveSperrzeit(userId),
    prisma.user.findUnique({
      where: { id: userId },
      select: { reinigungErlaubt: true, reinigungMaxMinuten: true, reinigungMaxProTag: true, reinigungsFenster: true },
    }),
  ]);

  // Reinigung ist nur möglich, wenn eine Sperrzeit mit reinigungErlaubt aktiv ist UND der User
  // Reinigung grundsätzlich erlaubt hat UND wir gerade in einem Fenster sind. Kontingent: heutige
  // CLEAN_OPEN-Fakten + bereits angeforderte (noch nicht vollzogene) clean_open zählen mit.
  const fensterEnd =
    sperre?.reinigungErlaubt && user?.reinigungErlaubt
      ? aktivesReinigungsFenster(user.reinigungsFenster, now)
      : null;
  let cleaningBase: { endHHMM: string; used: number; max: number; maxMinutes: number } | null = null;
  if (fensterEnd && user) {
    const inFlight = boxes.filter((b) => b.pendingCommand === "clean_open").length;
    const used = (await reinigungVerbrauchtHeute(userId, now)) + inFlight;
    cleaningBase = { endHHMM: fensterEnd, used, max: user.reinigungMaxProTag, maxMinutes: user.reinigungMaxMinuten };
  }

  // Tracker-eigene Sperrzeit sofort überlagern — der gepushte BoxStatus hinkt ihr nach
  // (Heimdall zieht sie erst beim nächsten Box-Sync), sonst zeigt das Menü „du kannst öffnen".
  return NextResponse.json(
    boxes.map((b) => {
      const keyholderLocked = b.keyholderLocked || !!sperre;
      const held = b.locked && keyholderLocked;
      const kontingentFrei = !!cleaningBase && (cleaningBase.max === 0 || cleaningBase.used < cleaningBase.max);
      return {
        boxId: b.boxId,
        name: b.name,
        locked: b.locked,
        simpleLock: b.simpleLock,
        keyholderLocked,
        lockUntil: (sperre ? sperre.endetAt : b.lockUntil)?.toISOString() ?? null,
        cleaning: held && kontingentFrei ? cleaningBase : null,
      };
    }),
  );
}
