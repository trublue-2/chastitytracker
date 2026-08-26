import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { soleControllerName } from "@/lib/keyholder";
import { aiKeyholderActiveFor } from "@/lib/mcp/common";
import { listMessages, subInbox, unreadCountCached, unreadCount } from "@/lib/messageService";
import { presentMessages } from "@/lib/messagePresenter";
import { messageFilterToParams, parseMessageFilterFrom } from "@/lib/messageCategories";
import { MESSAGE_SCOPES } from "@/lib/messageScope";
import { APP_TZ } from "@/lib/utils";
import DashboardBlock from "@/app/components/DashboardBlock";
import MessageList from "@/app/components/MessageList";

// Wie das übrige Dashboard: user-spezifisch, nie geteilt gecacht.
export const dynamic = "force-dynamic";

const SCOPE = "own";

export default async function MessagesPage({
  searchParams,
}: {
  /** Dieselben Parameter, die die API-Route liest — der Posteingang ist damit VERLINKBAR: „Alle
   *  ansehen" bei den offenen Strafen führt auf `?category=penalty` statt in die Mischliste.
   *
   *  BEWUSST unspezifisch getippt: die Namen der Filter-Parameter stehen in `messageCategories.ts`
   *  (Schreib- und Lese-Seite nebeneinander, weil beide still scheitern). Sie hier aufzuzählen wäre
   *  eine dritte Liste — eine neue Filter-Dimension liefe über die API weiter und fiele auf diesem
   *  Weg stumm weg. */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  // Über `parseMessageFilterFrom`, nicht über die Felder von Hand: dieselbe Lese-Regel, die die
  // API-Route anwendet — samt Prüfung unbekannter Werte (ein veralteter Link zeigt den ungefilterten
  // Posteingang statt eines Fehlers).
  const filter = parseMessageFilterFrom(await searchParams);

  // Der Filter geht AUCH an die Abfrage, nicht nur an die Liste: bekäme der Client nur den
  // Startwert, stünde beim ersten Bild die ungefilterte Seite da und spränge erst nach einem
  // Nachladen um — bei „Alle ansehen" also genau die Mischliste, aus der der Link herausführen soll.
  const [page, unread, unreadInFilter, locale, t, keyholderName] = await Promise.all([
    listMessages(subInbox(userId), { filter }),
    unreadCountCached(userId),
    unreadCount(subInbox(userId), [], filter),
    getLocale(),
    getTranslations("messages"),
    // Für die Beschriftung des Absender-Filters. Muss VON HIER kommen: die Filterleiste ist eine
    // Client-Komponente und darf nicht nachladen.
    soleControllerName(userId),
  ]);

  // Der Absender „KI-Keyholder" wird nur angeboten, wenn hier überhaupt eine KI schreiben kann —
  // die Bedingung dafür steht bei der MCP-Schicht, nicht hier (siehe `aiKeyholderActiveFor`).
  const aiSenderAvailable = aiKeyholderActiveFor(session.user.name);

  return (
    <DashboardBlock>
      <h1 className="text-lg font-semibold text-foreground mb-1">{t(MESSAGE_SCOPES[SCOPE].titleKey)}</h1>
      {/* Der Posteingang beantwortet „Was wurde mir gesagt?" — die Banner auf dem Dashboard
          „Was muss ich JETZT tun?". Deshalb hier bewusst kein Countdown und keine Dringlichkeit. */}
      <p className="text-xs text-foreground-faint mb-4">{t(MESSAGE_SCOPES[SCOPE].introKey)}</p>
      {/* `key` = der Filter aus der ADRESSE. Eine reine Query-Änderung (Glocke → ungefilterter
          Posteingang, „Alle ansehen" → Strafen) ist für den Router dieselbe Seite: die Komponente
          bliebe montiert, und `initialFilter` seedet nur `useState`. Ohne den Schlüssel stünde der
          alte Filter über der neuen, serverseitig anders gefilterten Liste. Über
          `messageFilterToParams` statt der rohen Query: nur der WIRKSAME Filter zählt, ein
          unbekannter Parameter daneben soll die Liste nicht neu aufsetzen. */}
      <MessageList
        key={messageFilterToParams(filter).toString()}
        initial={await presentMessages(page.messages, locale)}
        initialPageCount={page.pageCount}
        initialUnread={unread}
        initialUnreadInFilter={unreadInFilter}
        initialFilter={filter}
        scope={SCOPE}
        aiSenderAvailable={aiSenderAvailable}
        keyholderName={keyholderName}
        tz={session.user.timezone ?? APP_TZ}
      />
    </DashboardBlock>
  );
}
