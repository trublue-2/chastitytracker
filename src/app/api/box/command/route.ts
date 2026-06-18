import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getActiveSperrzeit } from "@/lib/queries";
import { aktivesReinigungsFenster, reinigungVerbrauchtHeute } from "@/lib/reinigungService";

const VALID = ["lock", "open", "clean_open"] as const;

// Der Sub löst aus dem Tracker eine Box-Aktion aus (Session-Auth, eigene Box). Setzt nur die
// Absicht (pendingCommand) — Heimdall zieht & vollzieht sie beim nächsten Box-Sync.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const now = new Date();

  const { boxId, command } = await req.json();
  if (!VALID.includes(command)) {
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

  // Reinigungspause: öffnet TROTZ Sperrzeit — aber nur erlaubt + im Fenster + Kontingent übrig.
  let relockBy: Date | null = null;
  if (command === "clean_open") {
    if (!box.locked) return NextResponse.json({ error: "Box ist bereits offen" }, { status: 400 });
    const [sperre, user] = await Promise.all([
      getActiveSperrzeit(userId),
      prisma.user.findUnique({
        where: { id: userId },
        select: { reinigungErlaubt: true, reinigungMaxMinuten: true, reinigungMaxProTag: true, reinigungsFenster: true },
      }),
    ]);
    if (!sperre?.reinigungErlaubt || !user?.reinigungErlaubt) {
      return NextResponse.json({ error: "Reinigung nicht erlaubt" }, { status: 400 });
    }
    const fensterEnd = aktivesReinigungsFenster(user.reinigungsFenster, now);
    if (!fensterEnd) {
      return NextResponse.json({ error: "Ausserhalb des Reinigungsfensters" }, { status: 400 });
    }
    if (user.reinigungMaxProTag > 0) {
      const inFlight = await prisma.boxStatus.count({ where: { userId, pendingCommand: "clean_open" } });
      const used = (await reinigungVerbrauchtHeute(userId, now)) + inFlight;
      if (used >= user.reinigungMaxProTag) {
        return NextResponse.json({ error: "Reinigungs-Kontingent für heute aufgebraucht" }, { status: 400 });
      }
    }
    relockBy = new Date(now.getTime() + user.reinigungMaxMinuten * 60_000);
  }

  await prisma.boxStatus.update({
    where: { userId_boxId: { userId, boxId } },
    data: { pendingCommand: command, pendingCommandAt: now, pendingCommandRelockBy: relockBy },
  });
  return NextResponse.json({ ok: true });
}
