import MessageBell from "@/app/components/MessageBell";
import AppBadgeSync from "@/app/components/AppBadgeSync";
import { unreadCountCached } from "@/lib/messageService";

/**
 * Glocke + App-Badge als EIN Kopfzeilen-Element — geteilt von `Header` (Träger) und `AdminHeader`.
 *
 * Zusammen, weil beide denselben Zähler brauchen und er nur einmal gelesen werden soll; der Badge
 * rendert nichts und darf deshalb neben der Glocke stehen. Getrennt eingebaut hiesse: zwei Aufrufer
 * halten von Hand fest, dass der Badge dieselbe Zahl bekommt wie die Glocke — und ein Kopf, der die
 * Glocke bekommt, aber den Badge vergisst, zeigt am App-Symbol still eine veraltete Zahl.
 *
 * Der Zähler darf die Hülle nicht mitreissen: dieses Element steht in JEDEM Dashboard- und
 * Admin-Layout. Fehlt die Tabelle noch (Instanz zieht das Update gerade erst), zeigt die Glocke
 * keine Zahl — statt dass jede Seite 500t.
 */
export default async function HeaderMessages({ userId }: { userId: string }) {
  let unread = 0;
  try {
    unread = await unreadCountCached(userId);
  } catch (err) {
    console.error("[messages] unread count failed", err);
  }

  return (
    <>
      <MessageBell unread={unread} />
      <AppBadgeSync unread={unread} />
    </>
  );
}
