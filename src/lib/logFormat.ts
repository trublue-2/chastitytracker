import { APP_TZ } from "@/lib/utils";
import { isoWithOffset } from "@/lib/mcp/format";

/**
 * Zeitstempel für Container-Logs in der Instanz-Zeitzone (APP_TZ) MIT explizitem Offset, z.B.
 * "2026-07-18T21:05:13+02:00". DST-korrekt: der Offset wird pro Zeitpunkt aus den ICU-Zonendaten
 * bestimmt (Sommer +02:00, Winter +01:00) — unabhängig von der Container-TZ (kein tzdata nötig).
 * Löst das frühere `toISOString()` ab, das immer UTC lieferte und OHNE Marker wie Lokalzeit aussah.
 *
 * Bewusst `next/headers`-frei, damit es auch aus `src/proxy.ts` (Middleware-Schicht) importierbar
 * bleibt — anders als der Rest von `serverLog.ts`.
 */
export function logTimestamp(): string {
  return isoWithOffset(new Date(), APP_TZ)!;
}
