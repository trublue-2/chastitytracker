import Link from "next/link";
import { Bell } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { headerIconBtnCls } from "./inputStyles";
import { MESSAGE_SCOPES, type MessageScope } from "@/lib/messageScope";

/**
 * Der Zugang zum Posteingang, im Header statt in der Bottom-Nav: die hat bei Keyholder-Rolle bereits
 * fünf Slots in `h-16` — auf 390 px sind das ~78 px je Slot, ein sechster bricht um.
 *
 * Server-Komponente ohne eigenen Abruf: der Header ist bereits async und kennt den Nutzer, der
 * Zähler kostet also keinen Client-Fetch.
 *
 * Die Glocke zeigt den Posteingang des Bereichs, in dem man steht, das App-Badge die Summe beider —
 * die Begründung dafür steht bei `HeaderMessages`. Ziel und Beschriftung kommen aus derselben
 * Tabelle (`MESSAGE_SCOPES`): getrennt geführt liefe die Glocke im Admin-Bereich auf den
 * Posteingang des Trägers, während ihre Ansage für Screenreader den des Keyholders verspräche.
 */
export default async function MessageBell({ unread, scope }: { unread: number; scope: MessageScope }) {
  const t = await getTranslations("messages");
  const { href, titleKey } = MESSAGE_SCOPES[scope];
  const title = t(titleKey);

  return (
    <Link
      href={href}
      aria-label={unread > 0 ? `${title} (${t("unreadCount", { count: unread })})` : title}
      className={`relative ${headerIconBtnCls}`}
    >
      <Bell size={18} />
      {unread > 0 && (
        // Zweistellig ist die Obergrenze, die in den Punkt passt; darüber „99+". Eine dreistellige
        // Zahl sprengte den Kreis und damit die Header-Zeile.
        <span
          className="absolute top-0.5 right-0.5 min-w-4 h-4 px-1 rounded-full bg-warn text-btn-primary-text text-[10px] font-semibold flex items-center justify-center"
          aria-hidden="true"
        >
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
