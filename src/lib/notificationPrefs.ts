import { prisma } from "@/lib/prisma";
import { NOTIFICATION_EVENT_TYPES } from "@/lib/constants";

/**
 * Mail/Push zu neuen NACHRICHTEN — abschaltbar, Default an. Die Nachricht selbst wird immer
 * geschrieben; genau das ist der Gewinn der Persistenz: der Kanal wird leiser, ohne dass
 * Information verloren geht. Eine fehlende Zeile heisst „an" — hier steht diese Regel EINMAL,
 * gelesen vom Versand (notify.ts) und von der Anzeige des Schalters (getSettingsProps).
 */
export async function getMessageChannels(userId: string): Promise<{ mail: boolean; push: boolean }> {
  try {
    const pref = await prisma.notificationPreference.findUnique({
      where: { userId_eventType: { userId, eventType: "MESSAGE_RECEIVED" } },
      select: { mail: true, push: true },
    });
    return { mail: pref?.mail ?? true, push: pref?.push ?? true };
  } catch (err) {
    // Wirft NIE — und fällt im Zweifel auf SENDEN zurück. `notifyUser` wird an vielen Stellen
    // NACH der eigentlichen Änderung awaited (Urteil gefällt, Kontrolle aufgelöst, Sperr-Ende
    // geändert); ein Lesefehler hier würde den Aufrufer mit einem 500 beenden, obwohl der
    // Datensatz längst geschrieben ist. Genau diese Fehlerklasse hat b5efd30 für den Mail-Versand
    // geschlossen — eine Präferenz-Abfrage darf sie nicht wieder aufmachen.
    console.error("[notify] preference lookup failed", err);
    return { mail: true, push: true };
  }
}

/** Seed NotificationPreference rows for a user with default-on values.
 *  Skips event types that already have a row (preserves explicit opt-outs).
 *  `MESSAGE_RECEIVED` wird bewusst NICHT geseedet: eine fehlende Zeile heisst dort ohnehin „an"
 *  (siehe getMessageChannels), die Zeile entsteht erst, wenn der Nutzer den Schalter anfasst. */
export async function ensureNotificationPreferences(userId: string) {
  await Promise.all(
    NOTIFICATION_EVENT_TYPES.map((eventType) =>
      prisma.notificationPreference.upsert({
        where: { userId_eventType: { userId, eventType } },
        update: {},
        create: { userId, eventType, mail: true, push: true },
      })
    )
  );
}
