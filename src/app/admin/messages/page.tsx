import { getLocale, getTranslations } from "next-intl/server";
import { assertController } from "@/lib/authGuards";
import { aiKeyholderActiveFor } from "@/lib/mcp/common";
import { keyholderInbox, listMessages, unreadCountForKeyholderCached, unreadCount } from "@/lib/messageService";
import { presentMessages } from "@/lib/messagePresenter";
import { isMessageFiltered, messageFilterToParams, parseMessageFilterFrom } from "@/lib/messageCategories";
import { MESSAGE_SCOPES } from "@/lib/messageScope";
import { APP_TZ } from "@/lib/utils";
import MessageList from "@/app/components/MessageList";

// Wie der übrige Admin-Bereich: leser-spezifisch, nie geteilt gecacht.
export const dynamic = "force-dynamic";

const SCOPE = "keyholder";

/**
 * Der Posteingang der Keyholderin — dieselbe Seite wie beim Träger, nur über SEINE Träger.
 *
 * Der Weg hierher ist die Glocke im Admin-Kopf; einen eigenen Nav-Eintrag gibt es bewusst nicht.
 * Alles unterhalb der Seite ist geteilt (`MessageList`, `MessageRow`, `MessageFilterBar`): der
 * Unterschied steckt in genau EINEM Wert — dem Scope, aus dem Endpunkt-Familie und Beschriftung
 * folgen (`MESSAGE_SCOPES`) und den der Guard serverseitig auf die eigenen Träger auflöst.
 */
export default async function AdminMessagesPage({
  searchParams,
}: {
  /** Dieselben Parameter wie beim Träger — der Posteingang bleibt damit VERLINKBAR. Bewusst
   *  unspezifisch getippt: die Namen der Filter-Parameter stehen in `messageCategories.ts`. */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { session, subs } = await assertController();
  const readerId = session.user.id;

  const filter = parseMessageFilterFrom(await searchParams);

  const [page, unread, unreadInFilter, locale, t] = await Promise.all([
    listMessages(keyholderInbox(readerId, subs), { filter }),
    // Derselbe Zähler wie in der Kopfzeile — memoisiert läuft er im Request nur einmal, und er teilt
    // sich mit `assertController()` oben die eine Träger-Abfrage.
    unreadCountForKeyholderCached(readerId, session.user.role),
    // Ungelesen IM FILTER für den Umschalter-Zähler; ohne aktiven Filter derselbe (memoisierte) Wert.
    isMessageFiltered(filter)
      ? unreadCount(keyholderInbox(readerId, subs), [], filter)
      : unreadCountForKeyholderCached(readerId, session.user.role),
    getLocale(),
    getTranslations("messages"),
  ]);

  // „Kann hier überhaupt eine KI schreiben?" — für den Keyholder-Posteingang heisst das: steht einer
  // SEINER Träger unter KI-Keyholderschaft. Beim Träger ist es dieselbe Frage über sich selbst.
  //
  // Die Filterleiste blendet die Absender-Achse in DIESER Sicht derzeit ganz aus (jede Zeile hier ist
  // heute `system`, siehe `MessageFilterBar`). Der Wert bleibt trotzdem richtig berechnet, damit er
  // stimmt, sobald es von der Keyholderin oder der KI verfasste Nachrichten gibt (Etappe 3) — eine
  // hart gesetzte Unwahrheit würde dann still das Falsche anbieten. Die Frage kostet nur zwei
  // ENV-Vergleiche.
  const aiSenderAvailable = subs.some((s) => aiKeyholderActiveFor(s.username));

  return (
    // Der Container des blauen Bereichs, wortgleich zu `admin/page.tsx` und `admin/kontrollen`: den
    // spannt im Admin-Bereich JEDE Seite selbst auf, das Layout gibt nur die Kopfzeile und die Nav.
    // Ohne ihn sass die Überschrift bündig unter der klebenden Kopfzeile und die Spalte war schmaler
    // als überall sonst.
    <main className="flex-1 py-6 flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-foreground mb-1">{t(MESSAGE_SCOPES[SCOPE].titleKey)}</h1>
        <p className="text-xs text-foreground-faint">{t(MESSAGE_SCOPES[SCOPE].introKey)}</p>
      </div>
      {/* `key` = der Filter aus der ADRESSE: eine reine Query-Änderung ist für den Router dieselbe
          Seite, und `initialFilter` seedet nur `useState` — ohne den Schlüssel stünde der alte
          Filter über der neuen, serverseitig anders gefilterten Liste. */}
      <MessageList
        key={messageFilterToParams(filter).toString()}
        initial={await presentMessages(page.messages, locale)}
        initialPageCount={page.pageCount}
        initialUnread={unread}
        initialUnreadInFilter={unreadInFilter}
        initialFilter={filter}
        scope={SCOPE}
        aiSenderAvailable={aiSenderAvailable}
        // Kein Name: hier liest die Keyholderin selbst. „Keyholder" als Absender wäre in ihrer
        // eigenen Liste eine Rolle, keine Person — den Namen eines einzelnen Trägers unterzuschieben
        // wäre schlicht falsch.
        keyholderName={null}
        tz={session.user.timezone ?? APP_TZ}
      />
    </main>
  );
}
