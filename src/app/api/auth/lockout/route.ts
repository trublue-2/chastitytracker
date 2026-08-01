import { NextRequest, NextResponse } from "next/server";
import { getBlockedUntil } from "@/lib/login-attempts";
import { errorResponse } from "@/lib/serviceResult";

/**
 * Sagt der Login-Seite, ob ein Benutzername gerade gesperrt ist.
 *
 * Scheitert die Abfrage, wird das wie überall als Fehler-Status mit JSON-Body gemeldet — NICHT als
 * durchgereichte Ausnahme. Die ergab bisher eine HTML-Fehlerseite, an der das `res.json()` des
 * Aufrufers mitten im Submit-Handler warf: der Benutzer stand vor einem Formular ganz ohne Meldung,
 * obwohl nur die Zusatz-Auskunft fehlte.
 */
export async function GET(req: NextRequest) {
  const username = req.nextUrl.searchParams.get("username") ?? "";
  try {
    const until = username ? await getBlockedUntil(username) : null;
    return NextResponse.json({
      locked: until !== null,
      until: until?.toISOString() ?? null,
    });
  } catch (e) {
    console.error("[GET /api/auth/lockout]", e);
    return errorResponse(500, "INTERNAL_ERROR");
  }
}
