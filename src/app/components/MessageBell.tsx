import Link from "next/link";
import { Bell } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { headerIconBtnCls } from "./inputStyles";

/**
 * Der Zugang zum Posteingang, im Header statt in der Bottom-Nav: die hat bei Keyholder-Rolle bereits
 * fünf Slots in `h-16` — auf 390 px sind das ~78 px je Slot, ein sechster bricht um.
 *
 * Server-Komponente ohne eigenen Abruf: der Header ist bereits async und kennt den Nutzer, der
 * Zähler kostet also keinen Client-Fetch.
 */
export default async function MessageBell({ unread }: { unread: number }) {
  const t = await getTranslations("messages");

  return (
    <Link
      href="/dashboard/messages"
      aria-label={unread > 0 ? `${t("title")} (${t("unreadCount", { count: unread })})` : t("title")}
      className={`relative ${headerIconBtnCls}`}
    >
      <Bell size={18} />
      {unread > 0 && (
        // Zweistellig ist die Obergrenze, die in den Punkt passt; darüber „99+". Eine dreistellige
        // Zahl sprengte den Kreis und damit die Header-Zeile.
        <span
          className="absolute top-0.5 right-0.5 min-w-4 h-4 px-1 rounded-full bg-[var(--color-request)] text-white text-[10px] font-semibold flex items-center justify-center"
          aria-hidden="true"
        >
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
