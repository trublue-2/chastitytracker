import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/authGuards";
import { resendInspectionCode } from "@/lib/kontrolleService";
import { serviceResponse, errorResponse } from "@/lib/serviceResult";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { INSPECTION_CODE_PUSH_COOLDOWN_MS, inspectionCodePushLimitKey } from "@/lib/constants";

/**
 * Der Sub schickt sich den Code seiner laufenden Kontrolle noch einmal als Push — der Weg, den Code
 * zurück auf die Smartwatch zu holen, nachdem sie ihn gelöscht oder verdrängt hat. Begründung und
 * Form der Meldung stehen an `resendInspectionCode`.
 *
 * Nur für die EIGENE Kontrolle: die Anforderungs-Id kommt aus dem Pfad, `userId` aus der Sitzung —
 * die Auswahl im Dienst verbindet beide, ein fremdes id trifft damit nichts.
 *
 * Eigener Rate-Limit-Schlüssel, nicht der geteilte `user:<id>`: der zählt schon die
 * Foto-Verifikation (10/min), und die beiden Aktionen laufen im selben Formular direkt
 * hintereinander — auf einem Zähler würde eine die andere aussperren.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireApi();
    if (session instanceof NextResponse) return session;
    const { id } = await params;

    const rl = await checkRateLimit(inspectionCodePushLimitKey(session.user.id), 1, INSPECTION_CODE_PUSH_COOLDOWN_MS);
    if (rl.limited) return rateLimitResponse(rl);

    return serviceResponse(await resendInspectionCode(session.user.id, id));
  } catch (err) {
    console.error("[POST /api/kontrollen/[id]/code-push]", err);
    return errorResponse(500, "INTERNAL_ERROR");
  }
}
