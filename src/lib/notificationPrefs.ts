import { prisma } from "@/lib/prisma";
import {
  NOTIFICATION_EVENT_TYPES, ALL_CHANNELS,
  type NotificationChannels, type NotificationEventType, type RecipientNotificationEventType,
} from "@/lib/constants";

export type { NotificationChannels };

/**
 * Mail/Push zu neuen NACHRICHTEN — abschaltbar, Default an. Die Nachricht selbst wird immer
 * geschrieben; genau das ist der Gewinn der Persistenz: der Kanal wird leiser, ohne dass
 * Information verloren geht. Eine fehlende Zeile heisst „an" — hier steht diese Regel EINMAL,
 * gelesen vom Versand (notify.ts) und von der Anzeige des Schalters (getSettingsProps).
 */
export function getMessageChannels(userId: string): Promise<NotificationChannels> {
  return getRecipientChannels(userId, "MESSAGE_RECEIVED");
}

/**
 * Mail/Push zu einer Meldung AN DEN NUTZER selbst — der Schalter aus SEINEN Einstellungen
 * (`RECIPIENT_NOTIFICATION_EVENT_TYPES`).
 *
 * Getrennt von {@link getEventChannels}, weil die beiden Listen Gegenteiliges bedeuten: dort geht es
 * um Meldungen ÜBER den Träger an seine Keyholder, hier um Meldungen AN ihn. Ein gemeinsamer Leser
 * würde diesen Unterschied genau dann verwischen, wenn jemand den falschen Schaltertyp erwischt.
 * Eine fehlende Zeile heisst auch hier „an".
 */
export function getRecipientChannels(
  userId: string, eventType: RecipientNotificationEventType,
): Promise<NotificationChannels> {
  return readChannels(userId, eventType);
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

/**
 * Mail/Push zu MEHREREN Ereignissen des Trägers — es zählt, was MINDESTENS einer erlaubt.
 *
 * Für die Meldungen, die ein Eintrag unter mehreren Namen auslöst: eine Öffnung während einer
 * zurückgezogenen Sperrzeit ist auch eine Öffnung (`entryNotify.ts`). Die ODER-Regel steht hier und
 * nicht beim Aufrufer, aus demselben Grund wie „fehlende Zeile heisst an": jede Faltung, die daneben
 * entsteht, läuft irgendwann anders — und der speziellere Schalter machte dann den allgemeinen stumm.
 *
 * EINE Abfrage, nicht eine je Typ. Eine leere Liste ergibt „beides aus" — es gibt kein Ereignis, das
 * etwas erlauben könnte; der Aufrufer prüft das vorher.
 */
export async function getEventChannelsAny(
  userId: string,
  eventTypes: NotificationEventType[],
): Promise<NotificationChannels> {
  try {
    const rows = await prisma.notificationPreference.findMany({
      where: { userId, eventType: { in: eventTypes } },
      select: { eventType: true, mail: true, push: true, telegram: true },
    });
    const byType = new Map(rows.map((r) => [r.eventType, r]));
    return eventTypes.reduce<NotificationChannels>((acc, t) => {
      const pref = channelsOf(byType.get(t));
      return { mail: acc.mail || pref.mail, push: acc.push || pref.push, telegram: acc.telegram || pref.telegram };
    }, { mail: false, push: false, telegram: false });
  } catch (err) {
    console.error("[notify] preference lookup failed", err);
    return ALL_CHANNELS;
  }
}

/** Die Zeile in Kanäle — mit der Regel „fehlende Zeile heisst an" an EINER Stelle für beide Wege. */
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
        create: { userId, eventType, mail: true, push: true, telegram: true },
      })
    )
  );
}

/**
 * Die Benachrichtigungs-Matrix eines Trägers LESEN — je Ereignisart, ob Mail und Push gehen.
 *
 * Eine fehlende Zeile heisst „aus": `ensureNotificationPreferences` legt sie beim ersten Bedarf an,
 * und bis dahin ist der Kanal nicht bestellt. Dieselbe Lesart wie in der Keyholder-Oberfläche —
 * dort entsteht die Matrix aus genau dieser Regel.
 */
export async function getNotificationMatrix(userId: string): Promise<Record<NotificationEventType, NotificationChannels>> {
  const rows = await prisma.notificationPreference.findMany({ where: { userId } });
  const map = {} as Record<NotificationEventType, NotificationChannels>;
  for (const eventType of NOTIFICATION_EVENT_TYPES) {
    const row = rows.find((r) => r.eventType === eventType);
    map[eventType] = { mail: row?.mail ?? false, push: row?.push ?? false, telegram: row?.telegram ?? false };
  }
  return map;
}

/**
 * EINEN Schalter der Matrix setzen.
 *
 * Als Dienst, weil zwei Oberflächen ihn umlegen: die Keyholder-Seite (`PATCH
 * /api/admin/notifications`) und die KI über den MCP. Er upsertet je Ereignisart — die Zeile
 * entsteht beim ersten Umlegen, und der jeweils andere Kanal bleibt, wie er war.
 */
export async function setNotificationPreference(
  userId: string,
  eventType: NotificationEventType,
  channel: "mail" | "push" | "telegram",
  value: boolean,
): Promise<void> {
  await prisma.notificationPreference.upsert({
    where: { userId_eventType: { userId, eventType } },
    create: { userId, eventType, [channel]: value },
    update: { [channel]: value },
  });
}
