import { prisma } from "@/lib/shared/prisma";
import { withOffenseName } from "@/lib/strafbuch/offenseLabels";
import { withMessageDefaults } from "@/lib/messages/messageDefaults";
import { sendMailSafe, escHtml, dashboardEmailHtml } from "@/lib/messages/mail";
import { emailT, emailGreeting, localeT } from "@/lib/messages/emailI18n";
import { sendPushToUser } from "@/lib/messages/push";
import { structuredLog } from "@/lib/shared/serverLog";
import { sendTelegram } from "@/lib/messages/telegram";
import { recordInboxDelivery, recordSystemMessage, type MessageActor, type MessageBodyKey, type MessageRef } from "@/lib/messages/messageService";
import { messagePriority } from "@/lib/messages/messageCategories";
import { deliveryChannels, type DeliveryRecipient } from "@/lib/messages/deliveryChannels";
import { anyChannelActive, channelsAnd, type MessagePriority, type NotificationChannels, APP_NAME } from "@/lib/shared/constants";

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
export type NotifyInbox = false | InboxOptions;

export type InboxOptions = InboxRefOptions & {
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
    };

/**
 * Ein Empfänger, dessen Zeile der Aufrufer BEREITS geladen hat.
 *
 * Genau die vier Felder, die der Versand braucht — und die einzige Definition davon: `Controller`
 * in `keyholder.ts` IST dieser Typ (`type Controller = NotifyRecipient`), statt dieselbe Form ein
 * zweites Mal zu buchstabieren. Die Richtung ist Absicht: der Versand sagt, was er braucht, die
 * Keyholder-Abfrage liefert es — umgekehrt wüsste `notify.ts` von Keyholdern.
 *
 * `notifyControllers` nimmt geladene Zeilen entgegen, statt für jede id ein zweites Mal dieselbe
 * Zeile von der Platte zu holen: die Empfänger sind der Grund, aus dem `Controller` `email` und
 * `locale` überhaupt trägt.
 */
export interface NotifyRecipient extends DeliveryRecipient {
  username: string;
  locale: string;
}

/** Die Spalten, die eine Empfänger-Zeile ausmachen — EINE Liste für alle, die solche Zeilen laden
 *  (`notifyUser`, `getControllersOfUser`). Von Hand nachgeführt hatte sie beim ersten neuen Feld
 *  prompt drei Pflegestellen; genau dieselbe Begründung wie bei `CLEANING_USER_SELECT`. */
export const NOTIFY_RECIPIENT_SELECT = {
  id: true, username: true, email: true, locale: true, telegramChatId: true,
  notifyMail: true, notifyPush: true, notifyTelegram: true,
} as const;

/**
 * Content of a generic notification, expressed as i18n keys (namespace `emails`) rather than
 * literal text. notifyUser() resolves them in the RECIPIENT's stored language, so subject, mail
 * body and push all arrive translated. `params` are interpolated into both subject and message.
 */
/**
 * Schlüssel von Meldungen, die BEWUSST keine Posteingangs-Zeile hinterlassen und deshalb NICHT in
 * `MESSAGE_BODY_KEYS` stehen — sie werden nur als Mail/Push-Text aufgelöst.
 *
 * Bislang genau einer: die Erinnerung zum Wiege-Fenster. Eine Zeile je Tag, die nach dem Fenster
 * niemanden mehr angeht, wäre nach einer Woche nur noch Rauschen im Postfach; das Versäumnis selbst
 * steht ohnehin im Strafbuch.
 */
export type TransientMessageKey = "weightReminderMessage";

interface NotifyContentBase {
  subjectKey: string;
  params?: Record<string, string | number>;
  url?: string;
  /**
   * Ein zusätzlicher Schalter, der die Kanäle dieser Meldung VERENGT — fehlt die Angabe, entscheiden
   * allein die Stufen des Empfängers (`deliveryChannels`, bei Meldungen MIT Posteingangs-Zeile über
   * `recordInboxDelivery`, siehe `notifyLoadedUser`).
   *
   * Für die eine Klasse Meldungen mit EIGENEM Schalter: heute die Wiege-Erinnerung
   * (`RECIPIENT_NOTIFICATION_EVENT_TYPES`). Der Aufrufer liest ihn über `getRecipientChannels()` und
   * reicht das Ergebnis hier durch — er kennt den Ereignis-Typ, diese Funktion kennt nur den
   * Empfänger.
   *
   * Die POSTEINGANGS-Zeile bleibt davon unberührt, und das ist der Punkt: „der Kanal wird leiser,
   * ohne dass Information verloren geht" (`notificationPrefs.ts`). Ein abgeschalteter Schalter darf
   * eine Meldung dämpfen, nicht verschwinden lassen.
   *
   * Gerechnet wird `Stufe ∧ Schalter`: der Schalter kann eine Meldung zusätzlich abbestellen, aber
   * keine an einer Stufe vorbeischicken — sonst hiesse „Mail aus" wieder nicht „keine Mail".
   */
  channels?: NotificationChannels;

  /** Dringlichkeit, wenn sie sich nicht aus dem Meldungstext ergibt — nur für Meldungen ohne
   *  Posteingangs-Zeile, deren Schlüssel in `PRIORITY_BY_BODY_KEY` fehlt ({@link TransientMessageKey}). */
  priority?: MessagePriority;
}

/**
 * Was verschickt wird — als Union über `inbox`, und das ist die eigentliche Aussage:
 *
 * - **mit Posteingangs-Zeile** (der Normalfall) muss `messageKey` ein {@link MessageBodyKey} sein,
 *   denn er landet als `bodyKey` in der Spalte und wird später über die Kategorien-Tabelle gelesen
 * - **ohne Zeile** (`inbox: false`) darf zusätzlich ein {@link TransientMessageKey} stehen
 *
 * Der Typ trägt die Bindung damit selbst: ein flüchtiger Schlüssel OHNE `inbox: false` ist ein
 * Compile-Fehler. Als blosse Whitelist neben dem Typ wäre dieselbe Regel nur eine Bitte im
 * Kommentar — und beim ersten Aufrufer, der sie überliest, stünde eine Posteingangs-Zeile mit einem
 * Schlüssel, den die Kategorien-Tabelle nicht kennt.
 */
export type NotifyContent = NotifyContentBase & (
  | { inbox: false; messageKey: MessageBodyKey | TransientMessageKey }
  | { inbox?: InboxOptions; messageKey: MessageBodyKey }
);

/**
 * Die Obergrenze, die ein Aufrufer auf EINEN Kanal wartet. Jeder Kanal hat sein eigenes, kürzeres
 * Zeitlimit (SMTP 10/10/15 s, Push und Telegram je 10 s) — dies ist der Gurt darüber, für den Fall,
 * dass eines davon greift, ohne zu trennen (ein SMTP-Server, der Byte um Byte antwortet, unterläuft
 * das Socket-Limit beliebig lange).
 */
export const CHANNEL_DEADLINE_MS = 20_000;

/** Die drei Felder des Empfängers, an denen die Zustellung hängt (Teil von {@link DeliveryRecipient}). */
type ChannelRecipient = Pick<DeliveryRecipient, "id" | "email" | "telegramChatId">;

export interface ChannelContent {
  /** Der Mail-Inhalt, als FUNKTION: gebaut wird er nur, wenn die Mail wirklich hinausgeht (Kanal an UND
   *  Adresse da) — der Aufrufer muss die Bedingung nicht ein zweites Mal vorab prüfen. `subject` ohne
   *  Anwendungsnamen, den setzt {@link deliverToChannels} davor. */
  mail?: () => { subject: string; html: string };
  /** Push-Titel, zugleich die erste Zeile der Telegram-Nachricht. */
  title: string;
  /** Push-Text, zugleich der Rest der Telegram-Nachricht. */
  body: string;
  /** Ziel des Antippens. */
  url?: string;
  /** Anzahl ungelesener Nachrichten (nur Push; ohne Wert bleibt das Badge unangetastet). */
  badge?: number;
}

/**
 * Das EINE Versand-Ende: bringt eine fertig formulierte Meldung auf die Kanäle, die die Entscheidung
 * ({@link deliveryChannels}, `recordInboxDelivery`) freigegeben hat. WER welchen Kanal bekommt, steht
 * nicht hier — sondern in `channels`, das der Aufrufer mitbringt.
 *
 * **Die Warte-Regel (eine, für alle Aufrufer):** alle Kanäle laufen PARALLEL, und der Aufruf kehrt
 * zurück, wenn jeder fertig ist oder seine Obergrenze ({@link CHANNEL_DEADLINE_MS}) erreicht hat.
 * Fehler werden geloggt, nie geworfen — eine Meldung ist Beiwerk des Vorgangs, der sie auslöst.
 *
 * Warum abwarten statt fire-and-forget: (1) Die Poller stempeln `benachrichtigtAt` NACH dem Versand
 * und verlassen sich darauf, dass bis dahin jeder Kanal einen Versuch hinter sich hat — ein Stempel
 * vor dem Versuch wäre eine Zusage ohne Deckung, und ein Neustart dazwischen verlöre die Meldung.
 * (2) Sonst war das Warteverhalten Glückssache: dieselbe Meldung wartete je nach Weg auf Mail und
 * Telegram, auf nur eines davon oder auf gar nichts. Warum parallel und nicht nacheinander: die
 * Wartezeit ist so der langsamste Kanal, nicht die Summe. Warum trotzdem begrenzt: ein hängender
 * Dienst darf weder den Request noch den Poller-Takt (der seine Fälle nacheinander abarbeitet, auch
 * Kontroll-Fristen) festhalten.
 *
 * Die Mail geht über {@link sendMailSafe}, Telegram über {@link sendTelegram} — beide fangen selbst;
 * die Push (`sendPushToUser`) tut es nicht (ihre Datenbank-Zugriffe liegen ausserhalb des
 * try/catch) und wird deshalb hier gefangen.
 */
export async function deliverToChannels(
  recipient: ChannelRecipient,
  channels: NotificationChannels,
  content: ChannelContent,
): Promise<void> {
  const jobs: { channel: string; run: () => Promise<unknown> }[] = [];
  if (channels.mail && recipient.email && content.mail) {
    const to = recipient.email;
    const build = content.mail;
    jobs.push({
      channel: "mail",
      run: () => {
        const { subject, html } = build();
        return sendMailSafe(to, `${APP_NAME} – ${subject}`, html);
      },
    });
  }
  if (channels.push) {
    jobs.push({ channel: "push", run: () => sendPushToUser(recipient.id, content.title, content.body, content.url, content.badge) });
  }
  if (channels.telegram && recipient.telegramChatId) {
    const chatId = recipient.telegramChatId;
    jobs.push({ channel: "telegram", run: () => sendTelegram(chatId, `${content.title}\n\n${content.body}`) });
  }
  await Promise.all(jobs.map(({ channel, run }) => guarded(channel, recipient.id, run)));
}

/** Ein Kanal, gefangen und begrenzt — scheitert er oder hängt er, steht das im Log und sonst nirgends. */
async function guarded(channel: string, userId: string, run: () => Promise<unknown>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      run(),
      new Promise<void>((resolve) => {
        timer = setTimeout(() => {
          structuredLog("notify", "channel_deadline", { channel, userId, afterMs: CHANNEL_DEADLINE_MS });
          resolve();
        }, CHANNEL_DEADLINE_MS);
      }),
    ]);
  } catch (e) {
    structuredLog("notify", "channel_failed", { channel, userId, error: (e as Error).message });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Generischer Benachrichtigungs-Helper für einfache Status-Meldungen an den Nutzer
 * (Posteingang + E-Mail + Push + Telegram). Subject + Message werden in der Sprache des Empfängers
 * gerendert und auf jedem Kanal verwendet. Versendet wird über {@link deliverToChannels}; ohne
 * hinterlegte E-Mail entfällt nur die Mail.
 *
 * Die Nachricht wird ZUERST geschrieben: scheitert der Versand, bleibt die Meldung trotzdem
 * nachlesbar — der ganze Grund für den Posteingang.
 *
 * Für reichhaltige, mehrzeilige Benachrichtigungen (z.B. Verschluss/Orgasmus mit Fenster + Frist)
 * gibt es weiterhin die spezialisierten send…Notifications-Helfer in den jeweiligen Services; die
 * schreiben ihre Nachricht selbst über `recordInboxDelivery`, das ihnen mit dem Badge auch die
 * Kanal-Schalter des Empfängers liefert — dieselbe Regel wie hier.
 */
export async function notifyUser(userId: string, content: NotifyContent): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: NOTIFY_RECIPIENT_SELECT,
  });
  if (!user) return;
  await notifyLoadedUser(user, content);
}

/**
 * Derselbe Versand für einen Empfänger, dessen Zeile schon vorliegt.
 *
 * Der ganze Rumpf von {@link notifyUser} ohne die Abfrage davor — und der einzige Grund, warum es
 * ihn getrennt gibt: `notifyControllers` bekommt seine Empfänger als geladene Zeilen herein und darf
 * sie nicht je Kopf noch einmal nachschlagen.
 */
async function notifyLoadedUser(user: NotifyRecipient, content: NotifyContent): Promise<void> {
  const { subjectKey, messageKey, params, url = "/dashboard" } = content;

  let badge: number | undefined;
  let channels: NotificationChannels;
  // Die Dringlichkeit steht am Meldungstext (`messagePriority`). `content.priority` überschreibt sie
  // für die Meldungen OHNE Posteingangs-Zeile, deren Schlüssel in der Tabelle gar nicht vorkommt
  // (heute die Wiege-Erinnerung) — ohne das fielen sie auf „wichtig" zurück.
  const priority = content.priority ?? messagePriority(content.messageKey);
  // Kein `inbox` aus der Destrukturierung: die Union wird über genau dieses Feld unterschieden, und
  // nur am Objekt geprüft weiss der Compiler, dass `messageKey` in diesem Zweig ein Body-Key ist.
  if (content.inbox !== false) {
    const inbox = content.inbox;
    // Die Stufen des EMPFÄNGERS entscheiden, wie laut diese Meldung sein darf — samt Frist-Rückfall.
    // Die Posteingangs-Zeile entsteht unabhängig davon: der Kanal wird leiser, die Meldung bleibt.
    // Die Zeile des Empfängers liegt hier bereits vor — sie geht MIT, damit `recordInboxDelivery`
    // sie nicht ein zweites Mal von der Platte holt.
    ({ badge, channels } = await recordInboxDelivery({
      subjectUserId: user.id,
      bodyKey: inbox?.bodyKey ?? content.messageKey,
      params,
      actor: inbox?.actor,
      ref: inbox?.ref,
      once: inbox?.once,
    }, user));
  } else {
    channels = await deliveryChannels(user, priority);
  }
  // Ein mitgegebener Ereignis-Schalter VERENGT die Stufe, er erweitert sie nie: „Mail aus" gilt auch
  // für die Wiege-Erinnerung, ihr eigener Schalter kann sie zusätzlich abbestellen.
  if (content.channels) channels = channelsAnd(channels, content.channels);

  const t = await emailT(user.locale);
  // Den Namen der Vergehensart erst HIER auflösen, in der Sprache des EMPFÄNGERS — dieselbe Regel
  // und dieselbe Funktion wie in der Posteingangs-Anzeige (`messagePresenter`). Ohne sie warf die
  // erste Meldung, die beide Wege ging, mit `FORMATTING_ERROR`: der Text verlangt `{offense}`, in
  // den Parametern stand `offenseKey`. Die Posteingangs-Zeile stand, Mail und Push fielen still aus.
  // Der Übersetzer NUR, wo eine Art aufzulösen ist: er wird je Empfänger neu gebaut, und drei von
  // Dutzenden Meldungstypen tragen den Parameter.
  const full = withMessageDefaults(messageKey, params);
  const resolved = full?.offenseKey === undefined
    ? full
    : withOffenseName(full, await localeT(user.locale, "offenses"));
  const subject = t(subjectKey, resolved);
  const message = t(messageKey, resolved);

  await deliverToChannels(user, channels, {
    // Der Betreff trägt den Benutzernamen und steht roh in der Überschrift: ohne Escaping ein
    // HTML-Einschub in die Mail.
    mail: () => ({
      subject,
      html: dashboardEmailHtml(escHtml(subject), `${emailGreeting(t, user.username)}<p>${escHtml(message)}</p>`, t("dashboardButton")),
    }),
    title: subject,
    body: message,
    url,
    badge,
  });
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
 * Aufgabe. Und sie kommen als GELADENE Zeilen ({@link NotifyRecipient}), nicht als blosse ids: sonst
 * schlüge der Versand jede davon ein zweites Mal nach, obwohl der Aufrufer sie mit Mail-Adresse und
 * Sprache längst in der Hand hält.
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
  controllers: NotifyRecipient[],
  content: NotifyContentBase & { messageKey: MessageBodyKey; inbox?: InboxRefOptions },
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
  // Alle Kanäle abgeschaltet: die Zeile steht, mehr ist nicht zu tun. Ohne diesen Riegel liefe je
  // Empfänger eine Nutzer-Abfrage für einen Versand, der garantiert nichts verschickt.
  if (content.channels && !anyChannelActive(content.channels)) return;
  await Promise.all(controllers.map((c) => notifyLoadedUser(c, { ...content, inbox: false })));
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
    structuredLog("notify", "keyholder_row_check_failed", { subjectUserId, error: (err as Error).message });
    return true;
  }
}
