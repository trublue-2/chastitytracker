import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/authGuards";
import { spendInspectionJoker, normalizeJokerReason } from "@/lib/inspectionJoker";
import { serviceResponse, errorResponse } from "@/lib/serviceResult";

/**
 * Der Träger setzt einen Fristen-Joker für seine laufende Kontrolle ein (Regel und Begründung:
 * `inspectionJoker.ts`).
 *
 * Nur für die EIGENE Kontrolle: die Anforderungs-Id kommt aus dem Pfad, `userId` aus der Sitzung, und
 * der Dienst verbindet beide — eine fremde id ergibt 404. Kein eigener Rate-Limit: jeder Einsatz
 * kostet einen Joker, und je Kontrolle gibt es höchstens einen.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireApi();
    if (session instanceof NextResponse) return session;
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    return serviceResponse(await spendInspectionJoker(id, session.user.id, normalizeJokerReason(body?.reason)));
  } catch (err) {
    console.error("[POST /api/kontrollen/[id]/joker]", err);
    return errorResponse(500, "INTERNAL_ERROR");
  }
}
