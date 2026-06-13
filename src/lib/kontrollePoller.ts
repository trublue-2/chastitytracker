import { prisma } from "@/lib/prisma";
import { sendKontrolleNotification, deriveSealCode } from "@/lib/kontrolleService";

// Verschickt fällige, zeitversetzte Kontroll-Anforderungen (wirksamAb erreicht, noch nicht
// benachrichtigt). Ein Container pro Instanz → ein Poller je Prozess genügt; der Zustand liegt
// in der DB und übersteht Neustart/Deploy. Fehler dürfen den Poller nie abbrechen.
const POLL_INTERVAL_MS = 60 * 1000;
let running = false;

async function processDue(): Promise<void> {
  if (running) return; // kein überlappender Lauf, falls ein Tick länger dauert
  running = true;
  try {
    const now = new Date();
    const due = await prisma.kontrollAnforderung.findMany({
      where: {
        wirksamAb: { not: null, lte: now },
        benachrichtigtAt: null,
        withdrawnAt: null,
        entryId: null,
      },
      include: { user: { select: { id: true, email: true, username: true } } },
      take: 50,
    });

    for (const ka of due) {
      try {
        // Siegel-Code-Erkennung fürs Mail-Label (wie beim Anlegen).
        const latest = await prisma.entry.findFirst({
          where: { userId: ka.userId, type: { in: ["VERSCHLUSS", "OEFFNEN"] } },
          orderBy: { startTime: "desc" },
          select: { type: true, kontrollCode: true },
        });
        // Label „Siegel-Nummer" nur, wenn der gespeicherte Code die aktuelle Siegel-Nummer ist.
        const sealCode = deriveSealCode(latest) === ka.code ? ka.code : null;

        await sendKontrolleNotification({ user: ka.user, code: ka.code, sealCode, kommentar: ka.kommentar, deadline: ka.deadline });
        await prisma.kontrollAnforderung.update({ where: { id: ka.id }, data: { benachrichtigtAt: new Date() } });
      } catch (e) {
        // benachrichtigtAt bleibt null → nächster Lauf versucht es erneut.
        console.error(`[kontrollePoller] Auslösung fehlgeschlagen (${ka.id}):`, (e as Error).message);
      }
    }
  } finally {
    running = false;
  }
}

/** Startet den Minuten-Poller (idempotent — Doppelstart bei Modul-Reuse wird ignoriert). */
export function startKontrollePoller(): void {
  const g = globalThis as unknown as { __kontrollePollerStarted?: boolean };
  if (g.__kontrollePollerStarted) return;
  g.__kontrollePollerStarted = true;
  setInterval(() => {
    processDue().catch((e) => console.error("[kontrollePoller]", e));
  }, POLL_INTERVAL_MS);
}
