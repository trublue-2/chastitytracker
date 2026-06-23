/** Gemeinsame Zahlenformat-Helfer der MCP-Schicht (V1 + V2). Eine Quelle für die
 *  1-Dezimal-Rundung und ms→Stunden-Umrechnung, damit V1- und V2-Ausgaben nicht desynchronisieren. */

/** Auf eine Nachkommastelle runden. */
export const round1 = (n: number) => Math.round(n * 10) / 10;

/** Millisekunden → Stunden, auf eine Nachkommastelle gerundet. */
export const msToHours = (ms: number) => round1(ms / 3_600_000);

/** Prozent-Erfüllung (actual/target), gerundet; null wenn kein/0-Ziel. Geteilt von V1 + V2. */
export const pct = (actual: number, target: number | null): number | null =>
  target && target > 0 ? Math.round((actual / target) * 100) : null;

/** Offset (Minuten) einer Zeitzone zum gegebenen Zeitpunkt. Positiv = östlich von UTC. */
function tzOffsetMinutes(date: Date, tz: string): number {
  // Wall-clock-Felder in der Ziel-TZ holen und als UTC interpretieren → Differenz = Offset.
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value]));
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour === 24 ? 0 : +p.hour, +p.minute, +p.second);
  return Math.round((asUTC - date.getTime()) / 60_000);
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
