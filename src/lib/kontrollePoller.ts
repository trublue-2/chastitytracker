import { prisma } from "@/lib/prisma";
import { sendKontrolleNotification, deriveSealCode, getLatestKgEntry, hasActiveKontrolle } from "@/lib/kontrolleService";
import { sendVerschlussAnforderungNotifications } from "@/lib/verschlussAnforderungService";
import { ensureDailyAutoKontrollen, deleteWithdrawnAutoKontrollen } from "@/lib/autoKontrolleService";
import { sendInspectionReminder, autoMarkInspectionRemoved, notifyInspectionAutoMarked } from "@/lib/inspectionEscalationService";
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
      include: { user: { select: { id: true, email: true, username: true, locale: true } } },
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
        // Überschneidungs-Schutz: eine andere Kontrolle ist schon aktiv (Keyholder, KI, oder eine
        // andere Auto-Kontrolle) → diese hier verwerfen statt ausliefern (User-Entscheidung: kein
        // Nachholen, gilt für ALLE Quellen, nicht nur Auto).
        if (await hasActiveKontrolle(ka.userId, now, { excludeId: ka.id })) {
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

    // Kontroll-Eskalation (Mahnung, dann ggf. automatisch als abgelegt markieren) im selben Tick.
    await processInspectionEscalation(now);

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
 * Zweistufige Kontroll-Eskalation, beide Stufen opt-in pro User (default aus):
 * Stufe 1 (Mahnung) stempelt IMMER `benachrichtigtReminderAt`, sobald die konfigurierte
 * Verzögerung nach der Deadline abgelaufen ist — unabhängig von `inspectionReminderEnabled`
 * (nur der eigentliche Versand ist gegated, siehe sendInspectionReminder). Das entkoppelt den
 * Uhr-Anker von der sichtbaren Benachrichtigung, damit Stufe 2 auch ohne aktivierte Stufe 1
 * funktioniert (getrennte Schalter). Stufe 2 (Auto-Mark) ist zusätzlich per
 * `inspectionAutoMarkEnabled` gegated und zählt ab `benachrichtigtReminderAt`, nicht ab der
 * ursprünglichen Deadline. Grobfilter (Deadline/Flags) läuft in SQL, der genaue Minuten-Delay pro
 * Zeile in JS — dieselbe Zwei-Stufen-Filterung wie beim Auto-Kontrolle-Zeitfenster.
 */
async function processInspectionEscalation(now: Date): Promise<void> {
  const reminderDue = await prisma.kontrollAnforderung.findMany({
    where: {
      deadline: { lt: now },
      benachrichtigtAt: { not: null },
      benachrichtigtReminderAt: null,
      withdrawnAt: null,
      entryId: null,
    },
    include: {
      user: {
        select: {
          id: true,
          inspectionReminderEnabled: true,
          inspectionReminderDelayMinutes: true,
          inspectionAutoMarkEnabled: true,
          inspectionAutoMarkDelayMinutes: true,
        },
      },
    },
    take: 50,
  });
  for (const ka of reminderDue) {
    const dueAt = ka.deadline.getTime() + ka.user.inspectionReminderDelayMinutes * 60_000;
    if (dueAt > now.getTime()) continue;
    try {
      await sendInspectionReminder({ id: ka.id, code: ka.code, user: ka.user });
    } catch (e) {
      console.error(`[kontrollePoller] Kontroll-Mahnung fehlgeschlagen (${ka.id}):`, (e as Error).message);
    }
  }

  const autoMarkDue = await prisma.kontrollAnforderung.findMany({
    where: {
      benachrichtigtReminderAt: { not: null },
      autoMarkedRemovedAt: null,
      withdrawnAt: null,
      entryId: null,
      user: { inspectionAutoMarkEnabled: true },
    },
    include: { user: { select: { id: true, username: true, inspectionAutoMarkDelayMinutes: true } } },
    take: 50,
  });
  for (const ka of autoMarkDue) {
    const dueAt = ka.benachrichtigtReminderAt!.getTime() + ka.user.inspectionAutoMarkDelayMinutes * 60_000;
    if (dueAt > now.getTime()) continue;
    try {
      const result = await autoMarkInspectionRemoved({ id: ka.id, userId: ka.userId });
      if (!result.skipped) {
        // Notifications are not transactional — send only after the state change committed.
        await notifyInspectionAutoMarked({ userId: ka.userId, username: ka.user.username, code: ka.code });
      }
    } catch (e) {
      console.error(`[kontrollePoller] Kontroll-Auto-Mark fehlgeschlagen (${ka.id}):`, (e as Error).message);
    }
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
    include: { user: { select: { id: true, email: true, username: true, locale: true } } },
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
