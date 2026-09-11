import { prisma } from "@/lib/prisma";
import { anyChannelActive, channelsAnd, type NotificationChannels } from "@/lib/constants";
import { getMessageChannels } from "@/lib/notificationPrefs";
import { hasPushTarget } from "@/lib/push";
import { mailReaches } from "@/lib/mail";
import { telegramChatReachable } from "@/lib/telegram";

/**
 * Frist-Rückfall — die Kanäle einer Meldung, deren Verpassen zum Vergehen wird (welche das sind, sagt
 * `isDeadlineMessage`).
 *
 * Normalfall: die Kanal-Schalter des Empfängers (`MESSAGE_RECEIVED`) gelten wie bei jeder Meldung.
 * Erreicht über sie aber NICHTS den Empfänger — alle aus, oder die eingeschalteten sind nicht
 * eingerichtet (keine Adresse, kein Gerät, Bot blockiert) —, geht die Meldung an jeden Kanal, der ihn
 * erreicht. Sonst bestrafte die App den Träger für eine Frist, die sie ihm selbst nie zugestellt hat.
 *
 * Rein, damit die Regel ohne Datenbank testbar ist: `reach` sagt je Kanal, ob er den Empfänger
 * überhaupt erreichen KANN.
 */
export function applyDeadlineFallback(chosen: NotificationChannels, reach: NotificationChannels): NotificationChannels {
  if (anyChannelActive(channelsAnd(chosen, reach)) || !anyChannelActive(reach)) return chosen;
  return reach;
}

/**
 * Die Kanäle einer Frist-Meldung an `userId`: der Schalter plus {@link applyDeadlineFallback}.
 *
 * Fragt die Erreichbarkeit nur so weit ab, wie sie das Ergebnis noch ändern kann: trägt die gewählte
 * Mail, ist nach dem Nutzer-Datensatz Schluss; das Push-Gerät wird erst gesucht, wenn Mail nicht
 * trägt, und die Telegram-API erst gefragt, wenn sonst nichts trägt — ein blockierter Bot fiele
 * sonst erst beim Versand auf, und dann ist die Frist schon verloren.
 *
 * Wirft NIE, wie `getMessageChannels`: scheitert die Prüfung, gilt der Schalter.
 */
export async function getDeadlineChannels(userId: string): Promise<NotificationChannels> {
  const chosenLookup = getMessageChannels(userId);
  try {
    const [chosen, user] = await Promise.all([
      chosenLookup,
      prisma.user.findUnique({ where: { id: userId }, select: { email: true, telegramChatId: true } }),
    ]);
    const mail = mailReaches(user?.email);
    if (chosen.mail && mail) return chosen;
    const push = await hasPushTarget(userId);
    if (chosen.push && push) return chosen;
    const chatId = user?.telegramChatId;
    const telegram = !!chatId && await telegramChatReachable(chatId);
    return applyDeadlineFallback(chosen, { mail, push, telegram });
  } catch (err) {
    console.error("[notify] deadline reach check failed", err);
    return chosenLookup;
  }
}
