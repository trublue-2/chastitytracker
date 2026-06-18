// Next.js Instrumentation-Hook: läuft einmal beim Server-Start (nur Node-Runtime).
// Startet den Poller für zeitversetzte Kontroll-Anforderungen.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startKontrollePoller } = await import("@/lib/kontrollePoller");
    startKontrollePoller();
  }
}
