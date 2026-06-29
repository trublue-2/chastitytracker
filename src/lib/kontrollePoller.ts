import { prisma } from "@/lib/prisma";
import { sendKontrolleNotification, deriveSealCode } from "@/lib/kontrolleService";
import { sendVerschlussAnforderungNotifications } from "@/lib/verschlussAnforderungService";
import { ensureDailyAutoKontrollen } from "@/lib/autoKontrolleService";
import { midnightInTZ } from "@/lib/utils";

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

    // Einmal pro CH-Tag die Auto-Kontrollen aller aktiven User für heute einplanen (idempotent;
    // DB-Check als Restart-Backstop). Schlägt das fehl, läuft das Versenden trotzdem weiter.
    const dayKey = midnightInTZ(now).getTime();
    const g = globalThis as unknown as { __autoKontrolleDay?: number };
    if (g.__autoKontrolleDay !== dayKey) {
      g.__autoKontrolleDay = dayKey;
      await ensureDailyAutoKontrollen(now).catch((e) => console.error("[autoKontrolle]", e));
    }

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
        // Auto-Kontrolle bei offenem KG ist sinnlos → bei Fälligkeit zurückziehen statt senden.
        if (ka.auto && latest?.type !== "VERSCHLUSS") {
          await prisma.kontrollAnforderung.update({ where: { id: ka.id }, data: { withdrawnAt: new Date() } });
          continue;
        }
        // Label „Siegel-Nummer" nur, wenn der gespeicherte Code die aktuelle Siegel-Nummer ist.
        const sealCode = deriveSealCode(latest) === ka.code ? ka.code : null;

        await sendKontrolleNotification({ user: ka.user, code: ka.code, sealCode, kommentar: ka.kommentar, deadline: ka.deadline });
        await prisma.kontrollAnforderung.update({ where: { id: ka.id }, data: { benachrichtigtAt: new Date() } });
      } catch (e) {
        // benachrichtigtAt bleibt null → nächster Lauf versucht es erneut.
        console.error(`[kontrollePoller] Auslösung fehlgeschlagen (${ka.id}):`, (e as Error).message);
      }
    }

    // Zeitversetzte VerschlussAnforderungen (ANFORDERUNG/SPERRZEIT) im selben Tick — kein zweiter Timer.
    await processDueVerschlussAnforderungen(now);
  } finally {
    running = false;
  }
}

/**
 * Verschickt fällige, zeitversetzte VerschlussAnforderungen (wirksamAb erreicht, noch nicht
 * benachrichtigt). Sanity-Check analog Auto-Kontrolle: passt der aktuelle Lock-Zustand nicht
 * mehr zur Art (ANFORDERUNG bei bereits verschlossenem User, SPERRZEIT bei offenem User), wird
 * statt gesendet zurückgezogen. Fehler → benachrichtigtAt bleibt null (Retry nächster Tick).
 */
async function processDueVerschlussAnforderungen(now: Date): Promise<void> {
  const due = await prisma.verschlussAnforderung.findMany({
    where: {
      wirksamAb: { not: null, lte: now },
      benachrichtigtAt: null,
      withdrawnAt: null,
      fulfilledAt: null,
    },
    include: { user: { select: { id: true, email: true, username: true } } },
    take: 50,
  });

  for (const va of due) {
    try {
      const latest = await prisma.entry.findFirst({
        where: { userId: va.userId, type: { in: ["VERSCHLUSS", "OEFFNEN"] } },
        orderBy: { startTime: "desc" },
        select: { type: true },
      });
      const isLocked = latest?.type === "VERSCHLUSS";
      const art = va.art as "ANFORDERUNG" | "SPERRZEIT";

      // Auslösung sinnlos geworden → zurückziehen statt senden.
      if ((art === "ANFORDERUNG" && isLocked) || (art === "SPERRZEIT" && !isLocked)) {
        await prisma.verschlussAnforderung.update({ where: { id: va.id }, data: { withdrawnAt: new Date() } });
        continue;
      }

      await sendVerschlussAnforderungNotifications({
        userId: va.userId,
        user: va.user,
        art,
        nachricht: va.nachricht,
        endetAtDate: va.endetAt,
        dauerH: va.dauerH,
      });
      await prisma.verschlussAnforderung.update({ where: { id: va.id }, data: { benachrichtigtAt: new Date() } });
    } catch (e) {
      // benachrichtigtAt bleibt null → nächster Lauf versucht es erneut.
      console.error(`[kontrollePoller] Verschluss-Auslösung fehlgeschlagen (${va.id}):`, (e as Error).message);
    }
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
