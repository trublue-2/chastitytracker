import { NextResponse } from "next/server";
import { requireApi } from "@/lib/auth/authGuards";
import { getOpenKontrollen } from "@/lib/entries/queries";
import { errorResponse } from "@/lib/shared/serviceResult";

export const dynamic = "force-dynamic";

/**
 * Die OFFENEN Kontrollen des eingeloggten Subs mit Code und Frist — für Geräte und Skripte, die den
 * Code anzeigen, ohne das Dashboard-HTML zu lesen (z.B. ein kleines Display).
 *
 * Eine schmale, bewusst stabile Form: die Feldnamen sind eine Schnittstelle zu Code ausserhalb
 * dieses Repos. `getOpenKontrollen` ist dieselbe Auswahl wie im Dashboard — eine zweite Regel
 * darüber, was „offen" heisst, liefe auseinander. `code` ist null, wenn das Ziel keinen verlangt.
 * Offen heisst auch ÜBERFÄLLIG: eine Kontrolle bleibt in der Liste, bis sie erfüllt oder zurückgezogen
 * ist — ob die `deadline` verstrichen ist, entscheidet der Aufrufer.
 */
export async function GET() {
  try {
    const session = await requireApi();
    if (session instanceof NextResponse) return session;

    const rows = await getOpenKontrollen(session.user.id);
    const inspections = rows.map((k) => ({
      id: k.id,
      code: k.code,
      deadline: k.deadline.toISOString(),
      categoryId: k.categoryId,
      deviceId: k.deviceId,
    }));

    return NextResponse.json({ inspections }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[GET /api/kontrollen/open]", err);
    return errorResponse(500, "INTERNAL_ERROR");
  }
}
