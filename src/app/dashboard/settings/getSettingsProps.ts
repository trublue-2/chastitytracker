import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getControllableSubs } from "@/lib/keyholder";
import { getMessageChannels, getRecipientChannels } from "@/lib/notificationPrefs";
import { telegramLinkAvailable } from "@/lib/telegram";
import { isValidStartPage, weightTrackingEnabled } from "@/lib/constants";
import type { WeightSettingsProps } from "./WeightSettings";
import type { UnitSystem } from "@/lib/weight";
import pkg from "@/../package.json";

export interface SettingsFormProps {
  username: string;
  email: string | null;
  /** The account's stored language (User.locale) — the single source of truth the language control
   *  displays and writes, so /dashboard/settings and /admin/settings always show the same value. */
  locale: string;
  timezone: string;
  startPage: string;
  /** Nur Keyholder/Admins (= haben das blaue Portal): steuert die Startseiten-Wahl. */
  showStartPage: boolean;
  /** Subs, die als konkrete Startseite (Detailseite) wählbar sind — leer für normale Subs. */
  controlledSubs: { id: string; username: string }[];
  /** Globaler Admin — steuert die "Benutzerverwaltung"-Startseiten-Option (admin-only Seite). */
  isAdmin: boolean;
  hideOwnTracker: boolean;
  /** Mail bei neuen Nachrichten (`MESSAGE_RECEIVED`) — eigener Kanal-Schalter. Die Nachricht selbst
   *  landet immer im Posteingang; der Schalter macht nur den Kanal leiser. */
  messageMail: boolean;
  /** Push bei neuen Nachrichten (`MESSAGE_RECEIVED`) — eigener Kanal-Schalter. */
  messagePush: boolean;
  /** Telegram bei neuen Nachrichten — eigener Schalter, nur relevant/sichtbar bei verknüpftem Chat. */
  messageTelegram: boolean;
  /** Ist auf dieser Instanz überhaupt ein Telegram-Bot eingerichtet (Token + Bot-Name)? */
  telegramConfigured: boolean;
  /** Hat dieser Nutzer seinen Telegram-Chat verknüpft? */
  telegramLinked: boolean;
  version: string;
  buildDate?: string;
  feedbackEnabled?: boolean;
  /** Gewichtstracking — `null`, wenn der Instanz-Schalter aus ist ODER die Keyholderin es für
   *  diesen Sub nicht freigeschaltet hat. Der Abschnitt erscheint dann gar nicht. */
  weight: WeightSettingsProps | null;
}

/**
 * Lädt die persönlichen Einstellungen des eingeloggten Users für das SettingsForm — single source,
 * damit die grüne (/dashboard/settings) und die blaue (/admin/settings) Ansicht IDENTISCH sind.
 * Die Startseiten-Wahl ist nur für Keyholder/Admins relevant (nur sie haben eine Übersicht).
 */
export async function getSettingsProps(): Promise<SettingsFormProps> {
  const session = await auth();
  const userId = session?.user?.id;

  let username = session?.user?.name ?? "";
  let email: string | null = null;
  let locale = "de";
  let timezone = "Europe/Zurich";
  let startPage = "auto";
  let hideOwnTracker = false;
  let weight: WeightSettingsProps | null = null;
  // Fehlende Zeile = „an" (dieselbe Annahme wie beim Versand in notify.ts).
  let messageMail = true;
  let messagePush = true;
  let messageTelegram = true;
  let telegramLinked = false;

  if (userId) {
    const [dbUser, pref, reminderPref] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          username: true, email: true, locale: true, timezone: true, startPage: true, hideOwnTracker: true,
          telegramChatId: true,
          weightTrackingEnabled: true, unitSystem: true, heightCm: true,
          targetWeightKg: true, targetWeightKeyholderKg: true,
        },
      }),
      getMessageChannels(userId),
      getRecipientChannels(userId, "WEIGHT_REMINDER"),
    ]);
    // Drei unabhängige Kanal-Schalter: Mail, Push und Telegram je einzeln an/aus.
    messageMail = pref.mail;
    messagePush = pref.push;
    messageTelegram = pref.telegram;
    if (dbUser) {
      username = dbUser.username;
      email = dbUser.email ?? null;
      locale = dbUser.locale;
      timezone = dbUser.timezone;
      startPage = dbUser.startPage;
      hideOwnTracker = dbUser.hideOwnTracker;
      telegramLinked = !!dbUser.telegramChatId;
      if (weightTrackingEnabled() && dbUser.weightTrackingEnabled) {
        weight = {
          unitSystem: dbUser.unitSystem as UnitSystem,
          heightCm: dbUser.heightCm,
          targetWeightKg: dbUser.targetWeightKg,
          keyholderTargetKg: dbUser.targetWeightKeyholderKg,
          // Drei unabhängige Kanal-Schalter, wie beim Posteingang. Telegram nur bei verknüpftem Chat.
          reminderMail: reminderPref.mail,
          reminderPush: reminderPref.push,
          reminderTelegram: reminderPref.telegram,
          telegramLinked,
        };
      }
    }
  }

  const isAdmin = session?.user?.role === "admin";
  const showStartPage =
    isAdmin || !!(session?.user as { controlsSubs?: boolean } | undefined)?.controlsSubs;
  // Nur wenn die Startseiten-Wahl sichtbar ist: die als Startseite wählbaren Subs laden.
  const controlledSubs =
    showStartPage && userId ? await getControllableSubs(userId, session?.user?.role) : [];
  // Eine gespeicherte Sub-ID, die nicht (mehr) wählbar ist (Sub entfernt/entzogen), würde im Select als
  // leerer Wert erscheinen → für die Anzeige auf "auto" zurückfallen (Landing tut das zur Laufzeit ohnehin).
  const startPageDisplay =
    isValidStartPage(startPage) || controlledSubs.some((s) => s.id === startPage) ? startPage : "auto";

  return {
    username,
    email,
    locale,
    timezone,
    startPage: startPageDisplay,
    showStartPage,
    controlledSubs,
    isAdmin,
    hideOwnTracker,
    messageMail,
    messagePush,
    messageTelegram,
    telegramConfigured: telegramLinkAvailable(),
    telegramLinked,
    version: pkg.version,
    buildDate: process.env.BUILD_DATE ?? undefined,
    feedbackEnabled: process.env.DISABLE_FEEDBACK !== "true",
    weight,
  };
}
