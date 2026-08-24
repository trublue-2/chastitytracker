import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkHealthToken, healthIngestSecret } from "@/lib/healthIngest";
import { recordWeight } from "@/lib/weightService";
import { weightTrackingEnabled } from "@/lib/constants";
import { serviceFailure } from "@/lib/serviceResult";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Eine Wiegung, die das Gerät selbst meldet — ein iOS-Kurzbefehl liest sie aus Apple Health
 * (docs/gewicht-health.md).
 *
 * Aufbau wie die Heimdall-Route nebenan: Bearer-Token, Zuordnung per Benutzername, `runtime: nodejs`
 * wegen der Krypto. Der Unterschied ist das Token — es gilt für GENAU EINEN Träger (`healthIngest.ts`),
 * weil es auf seinem Handy liegt und nicht auf einem Server des Betreibers.
 *
 * **Der Zeitpunkt kommt mit.** Ohne ihn landete eine Messung von heute früh unter der Uhrzeit des
 * Kurzbefehls — und damit womöglich ausserhalb der Wiege-Fenster, wo sie nicht in den Trend zählt.
 */
const schema = z.object({
  username: z.string().min(1),
  weightKg: z.number(),
  measuredAt: z.string().datetime().optional(),
  note: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  // Ohne Secret gibt es den Zugang auf dieser Instanz NICHT — 404 statt 401, damit ein Scanner
  // nicht einmal erfährt, dass es die Route gäbe (Muster: die Demo-Endpunkte).
  if (!healthIngestSecret() || !weightTrackingEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const bearer = (req.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i)?.[1];
  if (!checkHealthToken(body.username, bearer)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { username: body.username },
    select: { id: true, weightTrackingEnabled: true },
  });
  // Dieselbe Antwort für „kein solcher Träger" und „Tracking aus": ein Token, das gerade nicht
  // schreiben darf, soll nicht ausplaudern, ob es den Namen überhaupt gibt.
  if (!user?.weightTrackingEnabled) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await recordWeight(user.id, {
    weightKg: body.weightKg,
    measuredAt: body.measuredAt ? new Date(body.measuredAt) : new Date(),
    note: body.note ?? null,
    source: "health",
  });
  if (!result.ok) return serviceFailure(result);
  // `replaced` und `released` gehen zurück: der Kurzbefehl kann daraus eine Mitteilung bauen
  // („Wert ersetzt" bzw. „Fenster offen"), ohne dass jemand die App öffnet.
  return NextResponse.json({ ok: true, ...result.data });
}
