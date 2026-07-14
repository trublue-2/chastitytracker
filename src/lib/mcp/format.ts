import { tzOffsetMsAt } from "@/lib/utils";

/** Prozent-Erfüllung (actual/target), gerundet; null wenn kein/0-Ziel. Geteilt von V1 + V2. */
export const pct = (actual: number, target: number | null): number | null =>
  target && target > 0 ? Math.round((actual / target) * 100) : null;

/** Offset (Minuten) einer Zeitzone zum gegebenen Zeitpunkt. Positiv = östlich von UTC.
 *  Misst am Zeitpunkt selbst (ein Pass) — dieselbe Anker-Wahl wie `dateAtLocalMinutes`. */
function tzOffsetMinutes(date: Date, tz: string): number {
  return Math.round(tzOffsetMsAt(date.getTime(), tz) / 60_000);
}

/** Formatiert einen Zeitpunkt als ISO-8601 mit explizitem Offset in der Instanz-Zeitzone,
 *  z.B. "2026-06-23T19:15:00+02:00" (Zeit-Disziplin §12). null → null. */
export function isoWithOffset(date: Date | null | undefined, tz: string): string | null {
  if (!date) return null;
  const off = tzOffsetMinutes(date, tz);
  const sign = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  const pad = (n: number) => String(n).padStart(2, "0");
  const local = new Date(date.getTime() + off * 60_000);
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}` +
    `T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}
