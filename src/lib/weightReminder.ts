import { prisma } from "@/lib/prisma";
import { APP_TZ } from "@/lib/utils";
import { weightTrackingEnabled } from "@/lib/constants";
import { weightDayKey } from "@/lib/weight";
import { activeWeighingWindow, weighingWindowEnd, type WeighingWindow } from "@/lib/weightWindows";
import { getRecipientChannels } from "@/lib/notificationPrefs";
import { notifyUser } from "@/lib/notify";

/**
 * Die Erinnerung zum Wiege-Fenster: „das Fenster ist offen, und du hast heute noch nichts gemeldet".
 *
 * **Warum am LAUFENDEN Fenster und nicht an seiner Startminute.** Der Poller tickt jede Minute, aber
 * nicht garantiert (Neustart, Deploy, ein langsamer Tick). Wer auf die exakte Minute prüft,
 * verschluckt die Erinnerung genau dann, wenn der Container gerade neu startet — und das fällt
 * niemandem auf, weil die Meldung ja nur ausbleibt. Am laufenden Fenster geprüft holt der nächste
 * Tick sie nach, solange das Fenster noch offen ist.
 *
 * **Einmal je Fenster und Tag.** Die Marke am Träger (`weightReminderMark`) hält fest, wofür zuletzt
 * erinnert wurde — `<Tag>#<Startzeit>`, nicht der Listen-Index: die Reihenfolge der Fenster ändert
 * sich, sobald jemand eines löscht, und ein Index-Vergleich erinnerte danach doppelt.
 *
 * **Der Träger entscheidet über den Kanal** — `WEIGHT_REMINDER` steht deshalb in
 * `RECIPIENT_NOTIFICATION_EVENT_TYPES` und in SEINEN Einstellungen, nicht im Admin-Raster: diese
 * Meldung geht an ihn, nicht über ihn. Und es gibt bewusst KEINE Posteingangs-Zeile: eine tägliche
 * Erinnerung, die dauerhaft im Postfach liegen bleibt, ist nach einer Woche nur noch Rauschen. Das
 * Versäumnis selbst steht ohnehin im Strafbuch.
 */

/** Die Felder, die der Erinnerungs-Lauf je Träger braucht. */
const REMINDER_SELECT = {
  id: true, timezone: true, weighingWindows: true, weightReminderMark: true,
} as const;

/** Die Marke eines Fensters an einem Tag — stabil gegen Umsortieren und Löschen. */
export function reminderMark(dayKey: string, window: WeighingWindow): string {
  return `${dayKey}#${window.start}`;
}

/**
 * Das Fenster, für das gerade eine Erinnerung anstünde — `null` heisst nein.
 *
 * Rein und ohne Datenbank, damit die Bedingung Kante für Kante prüfbar bleibt: drei stille Ausgänge
 * (kein Fenster offen, keine Erinnerung gewünscht, für dieses Fenster schon erinnert). Ob der Träger
 * heute schon gemeldet hat, steht bewusst NICHT hier — das ist die einzige Frage, die eine Abfrage
 * kostet, und der Aufrufer stellt sie für alle Kandidaten auf einmal.
 */
export function dueWeighingReminder(params: {
  windows: unknown;
  at: Date;
  tz: string;
  mark: string | null;
  dayKey: string;
}): WeighingWindow | null {
  const window = activeWeighingWindow(params.windows, params.at, params.tz);
  if (!window || !window.remind) return null;
  return params.mark === reminderMark(params.dayKey, window) ? null : window;
}

/**
 * Verschickt die fälligen Erinnerungen — ein Aufruf je Poller-Tick.
 *
 * Vorgefiltert wird in der Abfrage (Feature an, überhaupt Fenster gesetzt): ohne das liefe der
 * Lauf jede Minute über die ganze Benutzertabelle, obwohl das Feature opt-in ist und die meisten
 * Instanzen es gar nicht führen.
 */
export async function sendDueWeighingReminders(now: Date): Promise<number> {
  if (!weightTrackingEnabled()) return 0;

  const users = await prisma.user.findMany({
    // Beide Ausschlüsse nötig: wer seine Fenster löscht, bekommt `"[]"` in die Spalte, nie `null`
    // (`setWeightSettingsKeyholder` schreibt die normalisierte Liste). Ohne den zweiten Filter läge
    // jede Minute die halbe Benutzertabelle im Speicher, um lauter leere Listen zu parsen.
    where: {
      weightTrackingEnabled: true,
      weighingWindows: { not: null },
      NOT: { weighingWindows: "[]" },
    },
    select: REMINDER_SELECT,
  });

  // Erst die billige, reine Prüfung: nur wer gerade in einem Fenster mit Erinnerung steht und dafür
  // noch keine Marke trägt, ist überhaupt ein Kandidat.
  const candidates = users.flatMap((user) => {
    const tz = user.timezone || APP_TZ;
    const dayKey = weightDayKey(now, tz);
    const window = dueWeighingReminder({ windows: user.weighingWindows, at: now, tz, mark: user.weightReminderMark, dayKey });
    return window ? [{ userId: user.id, dayKey, window }] : [];
  });
  if (candidates.length === 0) return 0;

  // EINE Abfrage für alle Kandidaten statt einer je Kopf: der Poller läuft jede Minute, und ein
  // offenes Zwei-Stunden-Fenster ergäbe sonst 120 Einzelabfragen je Träger und Tag — die meisten
  // davon für jemanden, der längst gewogen hat.
  const reported = await prisma.weightEntry.findMany({
    where: {
      userId: { in: candidates.map((c) => c.userId) },
      dayKey: { in: [...new Set(candidates.map((c) => c.dayKey))] },
    },
    select: { userId: true, dayKey: true },
  });
  const reportedKeys = new Set(reported.map((r) => `${r.userId}#${r.dayKey}`));

  let sent = 0;
  for (const { userId, dayKey, window } of candidates) {
    if (reportedKeys.has(`${userId}#${dayKey}`)) continue;

    // Je Träger gekapselt: ein Fehler beim einen darf die Erinnerung der anderen nicht mitnehmen.
    // Ohne das bräche der erste Ausfall die Schleife ab — und zwar in jedem folgenden Tick erneut,
    // solange die Ursache besteht, sodass alle hinter ihm dauerhaft leer ausgingen.
    try {
      // Marke VOR dem Versand: schlägt der Versand fehl, bleibt es bei einer ausgefallenen
      // Erinnerung. Andersherum stünde bei jedem Fehlschlag ein neuer Versuch an — jede Minute, bis
      // das Fenster zu ist.
      await prisma.user.update({
        where: { id: userId },
        data: { weightReminderMark: reminderMark(dayKey, window) },
      });

      await notifyUser(userId, {
        subjectKey: "weightReminderSubject",
        messageKey: "weightReminderMessage",
        params: { until: weighingWindowEnd(window) },
        url: "/dashboard/new/gewicht",
        inbox: false,
        channels: await getRecipientChannels(userId, "WEIGHT_REMINDER"),
      });
      sent++;
    } catch (e) {
      console.error("[weight:reminder]", userId, (e as Error).message);
    }
  }
  return sent;
}
