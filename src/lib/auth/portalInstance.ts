/**
 * Läuft diese Instanz im Portal (auf trublues Server) oder bei einem Self-Hoster? Erkannt an
 * `PORTAL_SHARED_SECRET`: das schreibt nur das Portal in die `.env` einer Instanz, die es anlegt.
 *
 * Importfrei, weil es auch aus client-erreichbaren Modulen gezogen wird (`feedback.ts`). Die
 * ENV-Abfrage selbst ist nur auf dem Server sinnvoll; im Client-Bundle ist sie leer.
 */
export function isPortalInstance(env: Record<string, string | undefined> = process.env): boolean {
  return !!env.PORTAL_SHARED_SECRET;
}
