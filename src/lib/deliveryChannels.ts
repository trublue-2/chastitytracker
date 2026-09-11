import { prisma } from "@/lib/prisma";
import {
  ALL_CHANNELS, anyChannelActive, channelsAnd, channelsForLevels,
  type MessagePriority, type NotificationChannels,
} from "@/lib/constants";
import { hasPushTarget } from "@/lib/push";
import { mailReaches } from "@/lib/mail";
import { telegramChatReachable } from "@/lib/telegram";

/**
 * Was der Versand über einen Empfänger wissen muss, um seine Kanäle zu bestimmen — seine drei Stufen
 * plus die Ziele, an denen die Erreichbarkeit hängt. Teil der geladenen Zeile (`NotifyRecipient`),
 * damit eine Meldung an mehrere Keyholder nicht je Kopf ein zweites Mal nachschlägt.
 */
export interface DeliveryRecipient {
  id: string;
  email: string | null;
  telegramChatId: string | null;
  notifyMail: string;
  notifyPush: string;
  notifyTelegram: string;
}

/**
 * Frist-Rückfall — nur für Meldungen der Stufe `deadline`, deren Verpassen zum Vergehen wird.
 *
 * Normalfall: die Stufen des Empfängers gelten wie bei jeder Meldung. Erreicht über sie aber NICHTS
 * den Empfänger — alles aus, oder die eingeschalteten Kanäle sind nicht eingerichtet (keine Adresse,
 * kein Gerät, Bot blockiert) —, geht die Meldung an jeden Kanal, der ihn erreicht. Sonst bestrafte
 * die App den Träger für eine Frist, die sie ihm selbst nie zugestellt hat.
 *
 * Rein, damit die Regel ohne Datenbank testbar ist: `reach` sagt je Kanal, ob er den Empfänger
 * überhaupt erreichen KANN.
 */
export function applyDeadlineFallback(chosen: NotificationChannels, reach: NotificationChannels): NotificationChannels {
  if (anyChannelActive(channelsAnd(chosen, reach)) || !anyChannelActive(reach)) return chosen;
  return reach;
}

/**
 * Die Kanäle EINER Meldung an EINEN Empfänger: seine Stufen (`channelsForLevels`), bei einer Frist
 * mit {@link applyDeadlineFallback}.
 *
 * Die Erreichbarkeit wird nur so weit abgefragt, wie sie das Ergebnis noch ändern kann: trägt die
 * gewählte Mail, ist Schluss; das Push-Gerät wird erst gesucht, wenn Mail nicht trägt, und die
 * Telegram-API erst gefragt, wenn sonst nichts trägt — ein blockierter Bot fiele sonst erst beim
 * Versand auf, und dann ist die Frist schon verloren.
 *
 * Wirft NIE: scheitert die Prüfung, gelten die Stufen.
 */
export async function deliveryChannels(
  recipient: DeliveryRecipient,
  priority: MessagePriority,
): Promise<NotificationChannels> {
  const chosen = channelsForLevels(recipient, priority);
  if (priority !== "deadline") return chosen;
  try {
    const mail = mailReaches(recipient.email);
    if (chosen.mail && mail) return chosen;
    const push = await hasPushTarget(recipient.id);
    if (chosen.push && push) return chosen;
    const chatId = recipient.telegramChatId;
    const telegram = !!chatId && await telegramChatReachable(chatId);
    return applyDeadlineFallback(chosen, { mail, push, telegram });
  } catch (err) {
    console.error("[notify] deadline reach check failed", err);
    return chosen;
  }
}

/** Dieselbe Entscheidung für einen Empfänger, dessen Zeile noch nicht geladen ist (Posteingangs-Weg
 *  über `recordInboxDelivery`). Eine fehlende Zeile heisst „alles zustellen" — im Zweifel senden. */
export async function deliveryChannelsForUser(userId: string, priority: MessagePriority): Promise<NotificationChannels> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, telegramChatId: true, notifyMail: true, notifyPush: true, notifyTelegram: true },
    });
    if (!user) return ALL_CHANNELS;
    return await deliveryChannels(user, priority);
  } catch (err) {
    console.error("[notify] level lookup failed", err);
    return ALL_CHANNELS;
  }
}
