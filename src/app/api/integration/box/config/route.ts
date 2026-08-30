import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBoxSync } from "@/lib/boxSync";
import { getActiveLockPeriod } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Absicht (Tracker → Heimdall): die aktive Keyholder-Sperrzeit. Heimdall faltet `endetAt` per
 * Hybrid-Regel in seine `lockUntil` und hält die Box damit auch ohne weiteren Kontakt zum Tracker.
 *
 * Bewusst NICHT hier: irgendetwas über Reinigung — weder die Regeln des Subs (Erlaubnis, Fenster,
 * Kontingent, Maximaldauer) noch das Flag der Sperrzeit. Ob eine Öffnung erlaubt ist, entscheidet der
 * Tracker (`cleaningBlockReason`) und schickt daraufhin ein `open`. Die Box muss den Grund nicht
 * kennen und darf ihn nicht zweitrangig nachrechnen: zwei Regelwerke über dieselbe Frage laufen
 * auseinander. (Frühere Anläufe lieferten `reinigung` und `sperrzeit.reinigungErlaubt` mit; Heimdall
 * las beides nie.)
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

  const lockPeriod = await getActiveLockPeriod(user.id);

  return NextResponse.json({
    sperrzeit: lockPeriod
      ? {
          // Schlüssel bleibt `endetAt` — Heimdall-Vertrag, siehe Kopf der Datei.
          endetAt: lockPeriod.endsAt?.toISOString() ?? null,
          indefinite: lockPeriod.endsAt === null,
        }
      : null,
  });
}
