import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getActiveSperrzeit } from "@/lib/queries";

export const dynamic = "force-dynamic";

// Box-Status für den eingeloggten Sub — fürs (+)-Menü (verschliessen/anzeigen).
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [boxes, sperre] = await Promise.all([
    prisma.boxStatus.findMany({
      where: { userId: session.user.id },
      orderBy: { name: "asc" },
      select: { boxId: true, name: true, locked: true, lockUntil: true, simpleLock: true, keyholderLocked: true },
    }),
    getActiveSperrzeit(session.user.id),
  ]);

  // Tracker-eigene Sperrzeit sofort überlagern — der gepushte BoxStatus hinkt ihr nach
  // (Heimdall zieht sie erst beim nächsten Box-Sync), sonst zeigt das Menü „du kannst öffnen".
  return NextResponse.json(
    boxes.map((b) => ({
      ...b,
      keyholderLocked: b.keyholderLocked || !!sperre,
      lockUntil: (sperre ? sperre.endetAt : b.lockUntil)?.toISOString() ?? null,
    })),
  );
}
