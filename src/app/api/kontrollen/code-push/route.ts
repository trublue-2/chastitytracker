import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/authGuards";
import { resendOwnInspectionCode } from "@/lib/kontrolleService";
import { serviceResponse, errorResponse } from "@/lib/serviceResult";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { INSPECTION_CODE_PUSH_COOLDOWN_MS, inspectionCodePushLimitKey, isValidInspectionCode } from "@/lib/constants";
import { APP_TZ } from "@/lib/utils";

/**
 * Der Sub schickt sich den Code seiner SELBSTKONTROLLE als Push — dieselbe Absicht wie unter
 * `[id]/code-push`, nur ohne Anforderung: eine freiwillige Kontrolle würfelt ihren Code beim Öffnen
 * des Formulars, er steht in keiner Zeile, und deshalb kommt er im Body statt aus der Datenbank.
 * Warum das trotzdem eng ist, steht an `resendOwnInspectionCode`.
 *
 * Ohne `[id]` im Pfad: die Route liegt als STATISCHES Segment neben dem dynamischen und gewinnt für
 * genau dieses eine Wort. Kollidieren kann das nicht — Anforderungs-Ids sind cuids.
 *
 * Derselbe Rate-Limit-SCHLÜSSEL wie die id-Route, nicht ein zweiter: die Sperrfrist gilt dem
 * Knopfdruck, nicht dem Weg dahinter. Zwei Zähler liessen sich abwechselnd drücken.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireApi();
    if (session instanceof NextResponse) return session;

    // Ein unlesbarer Body ist kein 500, sondern derselbe Ausgang wie ein unbrauchbarer Code — der
    // Dienst beurteilt beides mit demselben Satz.
    const body = await req.json().catch(() => null);
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    const categoryId = typeof body?.categoryId === "string" ? body.categoryId : null;

    // Die FORM vor dem Zähler prüfen, nicht danach: eine Eingabe, die gar nichts verschickt, darf
    // die Sperrfrist nicht verbrauchen. Sonst bekommt genau der Nutzer, dem eben etwas abgewiesen
    // wurde, auf seinen korrigierten zweiten Versuch ein „zu schnell hintereinander" — die Absage,
    // die ihn von seiner Ursache wegführt. Geprüft wird mit derselben Funktion wie im Dienst, der
    // sie danach erneut stellt (er ist die Vertragsgrenze, nicht diese Route).
    if (!isValidInspectionCode(code)) return errorResponse(400, "INSPECTION_CODE_INVALID");

    const rl = await checkRateLimit(inspectionCodePushLimitKey(session.user.id), 1, INSPECTION_CODE_PUSH_COOLDOWN_MS);
    if (rl.limited) return rateLimitResponse(rl);

    // Zeitzone aus der Sitzung (sie hängt am JWT) statt über `getUserTimezone` aus einer zweiten
    // Abfrage — das ist ein Self-Pfad, und genau dafür liegt der Wert am Token.
    return serviceResponse(await resendOwnInspectionCode(session.user.id, code, session.user.timezone ?? APP_TZ, categoryId));
  } catch (err) {
    console.error("[POST /api/kontrollen/code-push]", err);
    return errorResponse(500, "INTERNAL_ERROR");
  }
}
