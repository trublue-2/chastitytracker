import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBoxSync } from "@/lib/boxSync";
import { getActiveSperrzeit } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Absicht (Tracker → Heimdall): die aktive Keyholder-Sperrzeit. Heimdall faltet `endetAt` per
 * Hybrid-Regel in seine `lockUntil` und hält die Box damit auch ohne weiteren Kontakt zum Tracker.
 *
 * Bewusst NICHT hier: die Reinigungs-Regeln (Erlaubnis, Fenster, Kontingent, Maximaldauer). Sie
 * entscheiden, OB eine Öffnung erlaubt ist — das prüft der Tracker in `releaseSperrzeitenOnOpen()`
 * und schickt daraufhin ein `open`. Die Box muss den Grund nicht kennen und darf ihn nicht zweitrangig
 * nachrechnen: zwei Regelwerke über dieselbe Frage laufen auseinander. (Ein früherer Anlauf lieferte
 * `reinigung` hier mit; Heimdalls `TrackerConfig` las das Feld nie.)
 */
export async function GET(req: NextRequest) {
  const denied = requireBoxSync(req);
  if (denied) return denied;

  // Heimdall mappt per Username (kein cuid-Lookup nötig).
  const username = req.nextUrl.searchParams.get("username");
  if (!username) return NextResponse.json({ error: "username required" }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true },
  });
  if (!user) return NextResponse.json({ error: "Unknown user" }, { status: 404 });

  const sperre = await getActiveSperrzeit(user.id);

  return NextResponse.json({
    sperrzeit: sperre
      ? {
          endetAt: sperre.endetAt?.toISOString() ?? null,
          indefinite: sperre.endetAt === null,
          reinigungErlaubt: sperre.reinigungErlaubt,
        }
      : null,
  });
}
