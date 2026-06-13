import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Box-Status für den eingeloggten Sub — fürs (+)-Menü (verschliessen/anzeigen).
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const boxes = await prisma.boxStatus.findMany({
    where: { userId: session.user.id },
    orderBy: { name: "asc" },
    select: { boxId: true, name: true, locked: true, lockUntil: true, simpleLock: true, keyholderLocked: true },
  });

  return NextResponse.json(
    boxes.map((b) => ({ ...b, lockUntil: b.lockUntil?.toISOString() ?? null })),
  );
}
