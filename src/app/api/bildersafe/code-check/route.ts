import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/auth/authGuards";
import { bildersafeEnabled, isValidImageUrl } from "@/lib/constants";
import { checkCodeChange } from "@/lib/lockboxCodeCheckService";
import { checkRateLimit, rateLimitResponse } from "@/lib/auth/rate-limit";
import { errorResponse } from "@/lib/serviceResult";

/**
 * Bildersafe, Issue #115: vergleicht ein frisch aufgenommenes Code-Foto mit dem zuletzt versiegelten
 * — VOR dem Speichern, damit das Formular bei demselben Code zum Verstellen auffordern kann.
 *
 * Antwortet nur mit dem Urteil (`first` | `different` | `same` | `uncertain`, oder `null` ohne
 * Vision-Provider), NIE mit Ziffern: der Code bleibt auf dem Server. Verbindlich ist die Prüfung nach
 * dem Speichern (`runCodeChangeCheck`) — diese hier ist ein Hinweis und blockiert nichts.
 */
export async function POST(req: NextRequest) {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;
  if (!bildersafeEnabled()) return errorResponse(404, "NOT_FOUND");

  // Bis zu vier Vision-Aufrufe je Anfrage — enger gedrosselt als die einfache Erkennung.
  const rl = await checkRateLimit(`code-check:${session.user.id}`, 6, 60_000);
  if (rl.limited) return rateLimitResponse(rl);

  const body = await req.json().catch(() => null);
  const imageUrl = body?.imageUrl;
  if (typeof imageUrl !== "string" || !isValidImageUrl(imageUrl)) return errorResponse(400, "INVALID_IMAGE_URL");

  return NextResponse.json({ result: await checkCodeChange(session.user.id, imageUrl) });
}
