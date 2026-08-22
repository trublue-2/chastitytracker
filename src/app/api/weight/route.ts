import { NextRequest, NextResponse } from "next/server";
import { requireApi, requireKeyholderOrAdminActor, sessionActor, weightTrackingGate } from "@/lib/authGuards";
import { errorResponse, serviceFailure } from "@/lib/serviceResult";
import { recordWeight } from "@/lib/weightService";

/**
 * Eine Messung erfassen — für sich selbst, oder als Keyholderin für einen Träger.
 *
 * Ein Endpunkt für beide Wege, weil beide dieselbe Zeile schreiben. Was sie unterscheidet, ist
 * genau zweierlei: **wer** geprüft wird (Session gegen Keyholder-Berechtigung) und die
 * **Foto-Pflicht**, die nur den Träger trifft — die Keyholderin sitzt beim Nachtragen nicht vor
 * seiner Waage. Beides steckt in `source`, den der Client NICHT setzen darf: er ergibt sich aus dem
 * Guard, der durchgelassen hat. Käme er aus dem Body, wäre die Foto-Pflicht mit einem Feld im
 * Request abwählbar.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const targetUserId = typeof body.userId === "string" ? body.userId : null;

  const session = await requireApi();
  if (session instanceof NextResponse) return session;

  // Für einen FREMDEN Träger: Keyholder-Berechtigung, und die Zeile trägt, wer sie angelegt hat.
  // Für sich selbst gilt der eigene Weg, auch wenn ein Keyholder seinen eigenen Tracker führt.
  const forOther = targetUserId !== null && targetUserId !== session.user.id;
  const userId = forOther ? targetUserId : session.user.id;

  let createdById: string | null = null;
  if (forOther) {
    const actor = await requireKeyholderOrAdminActor(userId);
    if (actor instanceof NextResponse) return actor;
    createdById = sessionActor(actor);
  }

  const gate = await weightTrackingGate(userId);
  if (gate) return gate;

  const measuredAt = new Date(body.measuredAt);
  // Unlesbares Datum ist ein UNGÜLTIGER Zeitpunkt, keine Zukunft — der Unterschied steht in der
  // Meldung, die der Träger liest.
  if (Number.isNaN(measuredAt.getTime())) return errorResponse(400, "invalidTime");
  const exif = body.imageExifTime ? new Date(body.imageExifTime) : null;

  const result = await recordWeight(userId, {
    weightKg: Number(body.weightKg),
    measuredAt,
    imageUrl: body.imageUrl || null,
    imageExifTime: exif && !Number.isNaN(exif.getTime()) ? exif : null,
    note: typeof body.note === "string" ? body.note : null,
    source: forOther ? "keyholder" : "user",
    createdById,
  });

  return result.ok ? NextResponse.json({ ok: true, ...result.data }) : serviceFailure(result);
}
