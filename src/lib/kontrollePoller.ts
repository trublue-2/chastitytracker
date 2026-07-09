import { prisma } from "@/lib/prisma";
import { sendKontrolleNotification, deriveSealCode, getLatestKgEntry } from "@/lib/kontrolleService";
import { sendVerschlussAnforderungNotifications } from "@/lib/verschlussAnforderungService";
import { ensureDailyAutoKontrollen, deleteWithdrawnAutoKontrollen } from "@/lib/autoKontrolleService";
import { maybeRunHealthChecks } from "@/lib/healthCheck";

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

    // Auto-Kontrollen aller aktiven User für „heute" einplanen — JEDEN Tick aufrufen, nicht nur zur
    // CH-Mitternacht: die per-User-Funktion ist idempotent je SUB-Zeitzone-Tag (DB-Check), sodass jeder
    // Sub seine Kontrollen zu SEINEM lokalen Tagesbeginn bekommt (ein globaler CH-Tages-Gate würde
    // Nicht-CH-Subs erst zur CH-Mitternacht einplanen → verschobene/fehlende Fenster). Für CH-Subs ist
    // das Ergebnis identisch (heute schon geplant → 0). Schlägt es fehl, läuft das Versenden weiter.
    await ensureDailyAutoKontrollen(now).catch((e) => console.error("[autoKontrolle]", e));
    // Cleanup (Listen-Rauschen, kein History-Wert) nur bei UTC-Tageswechsel — Timing unkritisch, spart
    // den findMany je Tick. deleteWithdrawnAutoKontrollen filtert intern per Sub-Zeitzone.
    const utcDayKey = Math.floor(now.getTime() / 86_400_000);
    const g = globalThis as unknown as { __autoKontrolleCleanupDay?: number };
    if (g.__autoKontrolleCleanupDay !== utcDayKey) {
      g.__autoKontrolleCleanupDay = utcDayKey;
      await deleteWithdrawnAutoKontrollen(now).catch((e) => console.error("[autoKontrolle:cleanup]", e));
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
        const latest = await getLatestKgEntry(ka.userId);
        // Auto-Kontrolle bei offenem KG ist sinnlos → bei Fälligkeit zurückziehen statt senden.
        if (ka.auto && latest?.type !== "VERSCHLUSS") {
          await prisma.kontrollAnforderung.update({ where: { id: ka.id }, data: { withdrawnAt: new Date() } });
          continue;
        }
        // Aktive Siegel-Nummer mitgeben: ≠ Code → Mail verlangt das Siegel zusätzlich auf dem
        // Foto; = Code (Legacy-Zeile) → altes „Siegel-Nummer"-Label. Beides entscheidet die
        // Notification selbst.
        const sealCode = deriveSealCode(latest);

        await sendKontrolleNotification({ user: ka.user, code: ka.code, sealCode, kommentar: ka.kommentar, deadline: ka.deadline });
        await prisma.kontrollAnforderung.update({ where: { id: ka.id }, data: { benachrichtigtAt: new Date() } });
      } catch (e) {
        // benachrichtigtAt bleibt null → nächster Lauf versucht es erneut.
        console.error(`[kontrollePoller] Auslösung fehlgeschlagen (${ka.id}):`, (e as Error).message);
      }
    }

    // Zeitversetzte VerschlussAnforderungen (ANFORDERUNG/SPERRZEIT) im selben Tick — kein zweiter Timer.
    await processDueVerschlussAnforderungen(now);

    // Selfhosted-KI-Erreichbarkeit prüfen (intern alle HEALTHCHECK_INTERVAL_MIN gedrosselt; No-op ohne
    // konfigurierte selfhosted-KI). FIRE-AND-FORGET: die Probes können bis zum Timeout hängen — das darf
    // den zeitkritischen Poller-Tick (fällige Kontroll-/Sperrzeit-Mails) NICHT verzögern. Der State liegt
    // in globalThis, nicht am Tick gekoppelt; ohne `now`-Argument nutzt der Check die echte Ausführungszeit.
    void maybeRunHealthChecks().catch((e) => console.error("[health]", e));
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
        sperrEndetAtDate: va.sperrEndetAt,
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
