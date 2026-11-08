import { NextRequest, NextResponse } from "next/server";
import { getBlockedUntil } from "@/lib/auth/login-attempts";
import { resolveLogin } from "@/lib/auth/loginIdentity";
import { errorResponse } from "@/lib/serviceResult";
import { checkRateLimit, rateLimitResponse } from "@/lib/auth/rate-limit";
import { clientIp } from "@/lib/auth/clientIp";

/**
 * Sagt der Login-Seite, ob die Eingabe im Anmeldefeld gerade gesperrt ist — Benutzername ODER
 * E-Mail, aufgelöst wie bei der Anmeldung selbst (`findUserByLogin`). Sonst zählte `authorize` die
 * Fehlversuche am Konto, während diese Auskunft unter der Schreibweise nachsähe, und der Countdown
 * fehlte genau dann, wenn jemand zwischen Benutzername und E-Mail wechselt.
 *
 * Bekannte und unbekannte Eingaben antworten in derselben Form: beide werden nach fünf
 * Fehlversuchen gesperrt (siehe `resolveLogin`).
 *
 * Scheitert die Abfrage, wird das wie überall als Fehler-Status mit JSON-Body gemeldet — NICHT als
 * durchgereichte Ausnahme. Die ergab bisher eine HTML-Fehlerseite, an der das `res.json()` des
 * Aufrufers mitten im Submit-Handler warf: der Benutzer stand vor einem Formular ganz ohne Meldung,
 * obwohl nur die Zusatz-Auskunft fehlte.
 */
export async function GET(req: NextRequest) {
  // Die Seite fragt beim Tippen nach; 60/min ist mehr, als ein Mensch braucht, und nimmt dem
  // Endpunkt den Reiz, Benutzernamen durchzuprobieren (er ruft `resolveLogin`, also die Datenbank).
  const rl = await checkRateLimit(`lockout:${clientIp(req.headers)}`, 60, 60_000);
  if (rl.limited) return rateLimitResponse(rl);

  const identifier = req.nextUrl.searchParams.get("username") ?? "";
  try {
    const { identity } = await resolveLogin(identifier);
    const until = identity ? await getBlockedUntil(identity) : null;
    return NextResponse.json({
      locked: until !== null,
      until: until?.toISOString() ?? null,
    });
  } catch (e) {
    console.error("[GET /api/auth/lockout]", e);
    return errorResponse(500, "INTERNAL_ERROR");
  }
}
