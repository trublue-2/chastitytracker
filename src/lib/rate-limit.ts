import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/serviceResult";

/**
 * Persistent rate limiter backed by SQLite.
 *
 * key format convention:
 *   "ip:<ip>"       — IP-based limits (forgot-password)
 *   "user:<id>"     — per-user limits (verify-kontrolle, detect-seal)
 *   "login:<name>"  — per-username login failure lockout
 *   "code-push:<id>" — per-user, EIGENER Zähler statt "user:<id>": beide laufen im selben
 *                      Kontroll-Formular direkt hintereinander (Foto prüfen, Code nachschicken),
 *                      und auf einem gemeinsamen Zähler sperrte die eine Aktion die andere aus.
 *
 * @returns { limited: true, retryAfter: seconds } | { limited: false }
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ limited: boolean; retryAfter?: number }> {
  const now = new Date();
  const resetAt = new Date(Date.now() + windowMs);

  const row = await prisma.rateLimit.upsert({
    where: { key },
    create: { key, count: 1, resetAt },
    update: {
      count: {
        // If the window has expired, restart the counter at 1; otherwise increment.
        // SQLite doesn't support conditional updates natively, so we handle expiry
        // by checking after the upsert.
        increment: 1,
      },
    },
  });

  // If the stored window has expired, reset it — this handles the "new window" case.
  if (row.resetAt < now) {
    await prisma.rateLimit.update({
      where: { key },
      data: { count: 1, resetAt },
    });
    return { limited: false };
  }

  if (row.count > limit) {
    const retryAfter = Math.ceil((row.resetAt.getTime() - now.getTime()) / 1000);
    return { limited: true, retryAfter };
  }

  return { limited: false };
}

/**
 * Die Absage eines Limits als Antwort — Fehler-CODE plus `Retry-After`.
 *
 * Neben `errorResponse()` und nicht darin, weil nur diese eine Antwort einen Header trägt; der Body
 * bleibt derselbe getypte `{ error }`, damit der Client ihn wie jeden anderen über `useApiError()`
 * auflöst. Von Hand gebaut stünde hier ein nackter String, und ein Tippfehler darin fiele weder
 * beim Kompilieren noch im Test auf (Begründung an `errorResponse`).
 *
 * Die vier älteren Aufrufer (`verify-kontrolle`, `detect-seal`, `detect-device`, `oauth/*`) bauen
 * ihre 429 noch selbst und antworten mit unübersetzbarer Prosa — sie gehören hierher umgestellt,
 * aber nicht in einem Commit, der ein Feature bringt.
 */
export function rateLimitResponse(rl: { retryAfter?: number }): NextResponse {
  const res = errorResponse(429, "TOO_MANY_REQUESTS");
  if (rl.retryAfter !== undefined) res.headers.set("Retry-After", String(rl.retryAfter));
  return res;
}
