import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getActiveSperrzeit } from "@/lib/queries";

// Der Sub löst aus dem Tracker eine Box-Aktion aus (Session-Auth, eigene Box). Setzt nur die
// Absicht (pendingCommand) — Heimdall zieht & vollzieht sie beim nächsten Box-Sync.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { boxId, command } = await req.json();
  if (command !== "lock" && command !== "open") {
    return NextResponse.json({ error: "Unbekanntes Kommando" }, { status: 400 });
  }

  const box = await prisma.boxStatus.findUnique({ where: { userId_boxId: { userId, boxId } } });
  if (!box) return NextResponse.json({ error: "Box nicht gefunden" }, { status: 404 });

  if (command === "lock" && box.locked) {
    return NextResponse.json({ error: "Box ist bereits verschlossen" }, { status: 400 });
  }
  if (command === "open") {
    // Nur die eigene "ohne Zeit"-Sperre ist vom Sub öffenbar — Zeit/Sperrzeit nicht (Heimdall-Notfall).
    if (!box.locked) return NextResponse.json({ error: "Box ist bereits offen" }, { status: 400 });
    // gepushter BoxStatus ODER die Tracker-eigene Sperrzeit (die Heimdall noch nicht gezogen hat).
    if (box.keyholderLocked || box.lockUntil || (await getActiveSperrzeit(userId))) {
      return NextResponse.json({ error: "Box durch Sperrzeit gehalten — nicht öffenbar" }, { status: 400 });
    }
  }

  await prisma.boxStatus.update({
    where: { userId_boxId: { userId, boxId } },
    data: { pendingCommand: command, pendingCommandAt: new Date(), pendingCommandRelockBy: null },
  });
  return NextResponse.json({ ok: true });
}
