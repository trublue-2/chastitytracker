import { NextRequest, NextResponse } from "next/server";
import { requireKeyholderOrAdminActor, sessionActor } from "@/lib/authGuards";
import { setWeightRelease, withdrawWeightRelease } from "@/lib/weightReleaseService";
import { serviceFailure, errorResponse } from "@/lib/serviceResult";

/** Freigabe-Vorgabe stellen (docs/gewicht-freigabe-konzept.md). Der Dienst prüft Gate, Richtung,
 *  Untergewicht und Zeitpunkt — die Route reicht den Body roh durch, wie bei der Orgasmus-Anweisung. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const actor = await requireKeyholderOrAdminActor(body?.userId);
    if (actor instanceof NextResponse) return actor;

    const result = await setWeightRelease(body, sessionActor(actor));
    if (!result.ok) return serviceFailure(result);
    return NextResponse.json({ ok: true, id: result.data.id });
  } catch (err) {
    console.error("[POST /api/admin/weight-release]", err);
    return errorResponse(500, "INTERNAL_ERROR");
  }
}

/** Zieht die offene Vorgabe zurück. Ohne offene ist es ein No-Op mit `count: 0`, kein Fehler —
 *  dieselbe Konvention wie beim Rückzug der Orgasmus-Anweisung. */
export async function DELETE(req: NextRequest) {
  try {
    const { userId } = await req.json();
    const actor = await requireKeyholderOrAdminActor(userId);
    if (actor instanceof NextResponse) return actor;

    const result = await withdrawWeightRelease(userId);
    if (!result.ok) return serviceFailure(result);
    return NextResponse.json({ ok: true, count: result.data.count });
  } catch (err) {
    console.error("[DELETE /api/admin/weight-release]", err);
    return errorResponse(500, "INTERNAL_ERROR");
  }
}
