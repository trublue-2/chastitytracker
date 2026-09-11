import { prisma } from "@/lib/prisma";
import { ALL_CHANNELS, type NotificationChannels, type RecipientNotificationEventType } from "@/lib/constants";

export type { NotificationChannels };

/**
 * Mail/Push/Telegram EINES Ereignisses mit eigenem Schalter — seit dem Stufen-Modell noch genau
 * eines: die Wiege-Erinnerung (`RECIPIENT_NOTIFICATION_EVENT_TYPES`).
 *
 * Alles andere folgt der Stufe des Empfängers (`deliveryChannels.ts`). Dieser Schalter bleibt
 * daneben bestehen, weil die Erinnerung eine Gefälligkeit ist, die man einzeln abbestellen können
 * soll — ohne dafür den ganzen Kanal leiser zu stellen. Eine fehlende Zeile heisst „an".
 */
export function getRecipientChannels(
  userId: string, eventType: RecipientNotificationEventType,
): Promise<NotificationChannels> {
  return readChannels(userId, eventType);
}

/** Die Zeile in Kanäle — mit der Regel „fehlende Zeile heisst an" an EINER Stelle. */
function channelsOf(pref: NotificationChannels | null | undefined): NotificationChannels {
  return {
    mail: pref?.mail ?? ALL_CHANNELS.mail,
    push: pref?.push ?? ALL_CHANNELS.push,
    telegram: pref?.telegram ?? ALL_CHANNELS.telegram,
  };
}

/** Die eine Abfrage hinter den beiden Einzel-Lesern — samt der Zusage, nie zu werfen (siehe unten). */
async function readChannels(userId: string, eventType: string): Promise<NotificationChannels> {
  try {
    const pref = await prisma.notificationPreference.findUnique({
      where: { userId_eventType: { userId, eventType } },
      select: { mail: true, push: true, telegram: true },
    });
    return channelsOf(pref);
  } catch (err) {
    // Wirft NIE — und fällt im Zweifel auf SENDEN zurück. `notifyUser` wird an vielen Stellen
    // NACH der eigentlichen Änderung awaited (Urteil gefällt, Kontrolle aufgelöst, Sperr-Ende
    // geändert); ein Lesefehler hier würde den Aufrufer mit einem 500 beenden, obwohl der
    // Datensatz längst geschrieben ist. Genau diese Fehlerklasse hat b5efd30 für den Mail-Versand
    // geschlossen — eine Präferenz-Abfrage darf sie nicht wieder aufmachen.
    console.error("[notify] preference lookup failed", err);
    return ALL_CHANNELS;
  }
}

