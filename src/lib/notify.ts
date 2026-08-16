import { prisma } from "@/lib/prisma";
import { sendMailSafe, escHtml, dashboardEmailHtml } from "@/lib/mail";
import { emailT, emailGreeting } from "@/lib/emailI18n";
import { firePush } from "@/lib/push";
import { recordMessageAndBadge, recordSystemMessage, type MessageActor, type MessageBodyKey, type MessageRef } from "@/lib/messageService";
import { getMessageChannels } from "@/lib/notificationPrefs";
import { ALL_CHANNELS, type NotificationChannels } from "@/lib/constants";

/**
 * Was an einer Posteingangs-Zeile hängt, unabhängig davon, WESSEN Posteingang gemeint ist —
 * geteilt von `notifyUser` (Zeile des Trägers) und `notifyControllers` (geteilte Keyholder-Zeile).
 */
export interface InboxRefOptions {
  ref?: MessageRef;
  /** Höchstens EINE Nachricht dieses Texts pro Bezugsobjekt — braucht `ref`. Für Meldungen, die
   *  ein einmaliges Ereignis festhalten (gestellt, zurückgezogen, Ergebnis): ein Retry nach
   *  einem Absturz darf keine zweite, dauerhafte Zeile hinterlassen. Semantik und Grenzen in
   *  `RecordMessageParams.once`. */
  once?: boolean;
}

/** Steuert, was `notifyUser` zusätzlich in den Posteingang des Empfängers schreibt. `false` = dort
 *  nichts schreiben — für die wenigen Meldungen, deren Empfänger NICHT der Sub ist (Info an die
 *  Keyholder). Deren EINE, geteilte Zeile schreibt `notifyControllers` selbst, mit dem Sub als
 *  Betreff; sie gehört nicht in den persönlichen Posteingang des einzelnen Keyholders. */
export type NotifyInbox =
  | false
  | (InboxRefOptions & {
      /** Abweichender Text für den Posteingang. Default: `messageKey`. Gebraucht dort, wo die Mail
       *  einen Freitext interpoliert, den die Nachricht stattdessen live über `ref` liest. */
      bodyKey?: MessageBodyKey;
      /**
       * WER die Meldung ausgelöst hat — der Benutzername des Handelnden, {@link AI_AUTHOR} über den
       * MCP, sonst weglassen (die App hat selbst entschieden). Siehe {@link MessageActor}.
       *
       * Bewusst der Handelnde und nicht die Absender-ART: eine hart gesetzte `senderKind:
       * "keyholder"` sagt nur „ein Mensch", und die Anzeige musste sich daraus einen Namen raten —
       * generisch bei zwei Keyholdern, falsch bei einem dritten Admin. Art UND Namen leitet die
       * Schreibstelle daraus ab (`recordSystemMessage`); hier wird nur durchgereicht.
       */
      actor?: MessageActor;
    });

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
  /**
   * Welche Kanäle überhaupt in Frage kommen — fehlt die Angabe, beide.
   *
   * Für die eine Klasse Meldungen, deren Schalter NICHT am Empfänger hängt, sondern am TRÄGER, um
   * den es geht: das Raster in seinen Einstellungen (`NotificationToggles`) sagt, welche seiner
   * Ereignisse die Keyholder per Mail/Push erreichen. Der Aufrufer liest es über
   * `getEventChannels()` und reicht das Ergebnis hier durch — er kennt den Ereignis-Typ, diese
   * Funktion kennt nur den Empfänger.
   *
   * Die POSTEINGANGS-Zeile bleibt davon unberührt, und das ist der Punkt: „der Kanal wird leiser,
   * ohne dass Information verloren geht" (`notificationPrefs.ts`). Ein abgeschalteter Schalter darf
   * eine Meldung dämpfen, nicht verschwinden lassen.
   *
   * Mit dem Empfänger-Schalter (`MESSAGE_RECEIVED`) kollidiert das nicht: dieses Feld kommt
   * ausschliesslich über `notifyControllers`, und das reicht `inbox: false` durch — der Zweig, der
   * den Empfänger-Schalter liest, wird dann gar nicht erst betreten.
   */
  channels?: NotificationChannels;
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
  let channels = content.channels ?? ALL_CHANNELS;
  if (inbox !== false) {
    badge = await recordMessageAndBadge({
      subjectUserId: userId,
      bodyKey: inbox?.bodyKey ?? messageKey,
      params,
      actor: inbox?.actor,
      ref: inbox?.ref,
      once: inbox?.once,
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

/**
 * Dieselbe Meldung an die Keyholder eines Subs — Mail und Push je Empfänger, dazu EINE
 * Posteingangs-Zeile.
 *
 * Eine Zeile je SUB, nicht je Keyholder: `subjectUserId` bleibt der Träger, um den es geht,
 * `audience: "keyholders"` trennt sie von seinem eigenen Posteingang. Warum das aufgeht, steht
 * kanonisch am Modell (`prisma/schema.prisma`, `Message.audience`).
 *
 * `subjectUserId` ist deshalb Pflichtparameter und steht VOR den Empfängern: der Träger ist der
 * Scope-Schlüssel der Zeile, die Empfänger sind nur die Zustell-Liste. Sie kommen als Parameter statt
 * aus `getControllersOfUser` — `processDueTasks` holt sie bewusst einmal je Nutzer statt einmal je
 * Aufgabe.
 *
 * KEIN `actor`, und das ist eine Aussage: was heute an die Keyholder geht, ist ausnahmslos ein
 * Befund der App (Aufgaben-Ergebnis, Sichtung fällig) — es gibt dort keinen Menschen zu nennen.
 * Käme je eine Meldung dazu, die ein Mensch auslöst, gehört der Handelnde hier durchgereicht.
 *
 * `inbox` ist hier ENGER als bei `notifyUser` ({@link InboxRefOptions} statt {@link NotifyInbox}):
 * `bodyKey` und `actor` gäbe es zwar, aber die Keyholder-Zeile ist keine abschaltbare Variante
 * — und `false` wäre sinnlos, denn die Zeile ist der ganze Zweck dieser Funktion. Beim Weiterreichen
 * an `notifyUser` wird `inbox: false` gesetzt: die Zeile steht schon, und der persönliche
 * Posteingang eines Keyholders ist nicht der Ort für eine Meldung über einen fremden Träger.
 *
 * Trägt der Betreff selbst die ADMIN-Rolle, entfällt die Zeile — siehe {@link keyholderRowReadable}.
 */
export async function notifyControllers(
  subjectUserId: string,
  controllers: { id: string }[],
  content: Omit<NotifyContent, "inbox"> & { inbox?: InboxRefOptions },
): Promise<void> {
  // Zuerst schreiben, dann senden — dieselbe Reihenfolge wie in `notifyUser`: scheitert der Versand,
  // bleibt die Meldung nachlesbar. Ohne Badge: der Zähler eines Keyholders steht über ALLEN seinen
  // Subs und braucht dessen Sub-Liste, die hier niemand hat (siehe `unreadCountForKeyholderCached`).
  //
  // `ref`/`once` gehen MIT: ohne sie hinge die Keyholder-Zeile als einzige ohne Einmal-Zusage in der
  // Luft. Der Poller stempelt erst NACH dem Versand — bricht er dazwischen ab, schriebe der nächste
  // Lauf dieselbe Meldung ein zweites Mal, und anders als eine doppelte Mail bleibt eine doppelte
  // Zeile stehen. Die Sub-Zeile ist über `inbox.once` längst geschützt; hier fehlte es.
  if (await keyholderRowReadable(subjectUserId)) {
    await recordSystemMessage({
      subjectUserId,
      audience: "keyholders",
      bodyKey: content.messageKey,
      params: content.params,
      ref: content.inbox?.ref,
      once: content.inbox?.once,
    });
  }
  // Beide Kanäle abgeschaltet: die Zeile steht, mehr ist nicht zu tun. Ohne diesen Riegel liefe je
  // Empfänger eine Nutzer-Abfrage für einen Versand, der garantiert nichts verschickt.
  if (content.channels && !content.channels.mail && !content.channels.push) return;
  await Promise.all(controllers.map((c) => notifyUser(c.id, { ...content, inbox: false })));
}

/**
 * Kann diese Zeile überhaupt JEMAND lesen?
 *
 * Der Leserkreis des Keyholder-Posteingangs ist `getControllableSubs` — und die Menge schliesst
 * Träger mit ADMIN-Rolle aus (und einen selbst). Für einen Träger, der Admin ist, gibt es also
 * keinen einzigen Leser: die Zeile wäre geschrieben, unsichtbar und dauerhaft. Auf einer
 * Ein-Personen-Instanz ist das der Normalfall, nicht der Sonderfall — `scripts/seed.js` legt den
 * ersten Nutzer als Admin an, und jedes Aufgaben-Ergebnis und jede automatische Ablage hinge dort
 * für immer unsichtbar in der Tabelle.
 *
 * Die Meldung geht dabei NICHT verloren: ihr Kanal ist in diesem Fall die Mail (und der Push) an
 * jeden Empfänger — die laufen unverändert weiter, hier entfällt allein die Posteingangs-Zeile.
 *
 * Fällt die Abfrage aus, wird geschrieben: eine überflüssige Zeile ist der harmlosere Ausgang als
 * eine verschluckte Meldung, und die Mail darf ein Lesefehler ohnehin nicht mitreissen.
 */
async function keyholderRowReadable(subjectUserId: string): Promise<boolean> {
  try {
    const subject = await prisma.user.findUnique({ where: { id: subjectUserId }, select: { role: true } });
    return subject?.role !== "admin";
  } catch (err) {
    console.error("[messages] keyholder row readability check failed", err);
    return true;
  }
}
