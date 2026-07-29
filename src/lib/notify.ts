import { prisma } from "@/lib/prisma";
import { sendMailSafe, escHtml, dashboardEmailHtml } from "@/lib/mail";
import { emailT, emailGreeting } from "@/lib/emailI18n";
import { firePush } from "@/lib/push";
import { recordMessageAndBadge, type MessageBodyKey, type MessageRef, type MessageSenderKind } from "@/lib/messageService";
import { getMessageChannels } from "@/lib/notificationPrefs";

/** Steuert, was zusätzlich in den Posteingang geschrieben wird. `false` = nichts schreiben — für die
 *  wenigen Meldungen, deren Empfänger NICHT der Sub ist (Info an die Keyholder). */
export type NotifyInbox =
  | false
  | {
      /** Abweichender Text für den Posteingang. Default: `messageKey`. Gebraucht dort, wo die Mail
       *  einen Freitext interpoliert, den die Nachricht stattdessen live über `ref` liest. */
      bodyKey?: MessageBodyKey;
      ref?: MessageRef;
      senderKind?: MessageSenderKind;
    };

/**
 * Content of a generic notification, expressed as i18n keys (namespace `emails`) rather than
 * literal text. notifyUser() resolves them in the RECIPIENT's stored language, so subject, mail
 * body and push all arrive translated. `params` are interpolated into both subject and message.
 */
export interface NotifyContent {
  subjectKey: string;
  messageKey: MessageBodyKey;
  params?: Record<string, string | number>;
  url?: string;
  inbox?: NotifyInbox;
  /**
   * Mail/Push gehen raus, auch wenn der Sub „Mail und Push bei neuen Nachrichten" abgeschaltet hat.
   *
   * Für alles, was eine PFLICHT betrifft statt sie nur zu berichten: die Kontroll-Mahnung und die
   * automatische Ablage (beides vom KEYHOLDER konfigurierte Eskalationsstufen, die ein Vergehen
   * nach sich ziehen) sowie geänderte Fristen. Ohne diese Ausnahme könnte der Sub mit einem
   * eigenen Schalter genau die Eskalation stumm stellen, die der Keyholder eingerichtet hat —
   * und der Hinweis am Schalter („Anforderungen und Fristen werden immer gemeldet") wäre gelogen.
   */
  alwaysNotify?: boolean;
}

/**
 * Generischer Benachrichtigungs-Helper für einfache Status-Meldungen an den Nutzer
 * (Posteingang + E-Mail + Push). Subject + Message werden in der Sprache des Empfängers gerendert
 * und sowohl im Mail-Body als auch im Push verwendet. Push ist fire-and-forget; ohne hinterlegte
 * E-Mail wird nur Push versendet.
 *
 * Die Nachricht wird ZUERST geschrieben: scheitert der Versand, bleibt die Meldung trotzdem
 * nachlesbar — der ganze Grund für den Posteingang.
 *
 * Für reichhaltige, mehrzeilige Benachrichtigungen (z.B. Verschluss/Orgasmus mit Fenster + Frist)
 * gibt es weiterhin die spezialisierten send…Notifications-Helfer in den jeweiligen Services; die
 * schreiben ihre Nachricht selbst über `recordMessageAndBadge` — und senden bewusst ungefiltert,
 * weil eine Anforderung mit Frist keine abschaltbare Nachricht ist.
 */
export async function notifyUser(userId: string, content: NotifyContent): Promise<void> {
  const { subjectKey, messageKey, params, url = "/dashboard", inbox, alwaysNotify } = content;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, username: true, locale: true } });
  if (!user) return;

  let badge: number | undefined;
  let channels = { mail: true, push: true };
  if (inbox !== false) {
    badge = await recordMessageAndBadge({
      subjectUserId: userId,
      bodyKey: inbox?.bodyKey ?? messageKey,
      params,
      senderKind: inbox?.senderKind,
      ref: inbox?.ref,
    });
    if (!alwaysNotify) channels = await getMessageChannels(userId);
  }

  const t = await emailT(user.locale);
  const subject = t(subjectKey, params);
  const message = t(messageKey, params);

  if (user.email && channels.mail) {
    await sendMailSafe(
      user.email,
      `KG-Tracker – ${subject}`,
      dashboardEmailHtml(subject, `${emailGreeting(t, user.username)}<p>${escHtml(message)}</p>`, t("dashboardButton")),
    );
  }
  if (channels.push) firePush(userId, subject, message, url, badge);
}
