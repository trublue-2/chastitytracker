import { prisma } from "@/lib/prisma";
import { NOTIFICATION_EVENT_TYPES, ALL_CHANNELS, type NotificationChannels, type NotificationEventType } from "@/lib/constants";

export type { NotificationChannels };

/**
 * Mail/Push zu neuen NACHRICHTEN — abschaltbar, Default an. Die Nachricht selbst wird immer
 * geschrieben; genau das ist der Gewinn der Persistenz: der Kanal wird leiser, ohne dass
 * Information verloren geht. Eine fehlende Zeile heisst „an" — hier steht diese Regel EINMAL,
 * gelesen vom Versand (notify.ts) und von der Anzeige des Schalters (getSettingsProps).
 */
export function getMessageChannels(userId: string): Promise<NotificationChannels> {
  return readChannels(userId, "MESSAGE_RECEIVED");
}

/**
 * Mail/Push zu EINEM Ereignis des Trägers — der Schalter, den die Keyholderin im Raster der
 * Benutzer-Einstellungen umlegt (`NotificationToggles`).
 *
 * Eine fehlende Zeile heisst auch hier „an", und zwar ohne Ausnahmeliste je Typ: jedes Konto bekommt
 * seine Zeilen beim Anlegen (`ensureNotificationPreferences`) UND bei jedem Containerstart
 * (`scripts/seed.js`, vor dem ersten Request). Eine fehlende Zeile ist damit kein Normalfall,
 * sondern eine Anomalie — und bei einer Meldung, die auf ein Urteil wartet, ist Senden die sichere
 * Richtung.
 */
export function getEventChannels(userId: string, eventType: NotificationEventType): Promise<NotificationChannels> {
  return readChannels(userId, eventType);
}

/** Die eine Abfrage hinter beiden — samt der Zusage, nie zu werfen (siehe unten). */
async function readChannels(userId: string, eventType: string): Promise<NotificationChannels> {
  try {
    const pref = await prisma.notificationPreference.findUnique({
      where: { userId_eventType: { userId, eventType } },
      select: { mail: true, push: true },
    });
    return { mail: pref?.mail ?? ALL_CHANNELS.mail, push: pref?.push ?? ALL_CHANNELS.push };
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
