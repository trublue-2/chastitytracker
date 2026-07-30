import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { listMessagesFor, unreadCountCached } from "@/lib/messageService";
import { presentMessages } from "@/lib/messagePresenter";
import { APP_TZ } from "@/lib/utils";
import DashboardBlock from "@/app/components/DashboardBlock";
import MessageList from "./MessageList";

// Wie das übrige Dashboard: user-spezifisch, nie geteilt gecacht.
export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const [page, unread, locale, t] = await Promise.all([
    listMessagesFor(userId),
    unreadCountCached(userId),
    getLocale(),
    getTranslations("messages"),
  ]);

  return (
    <DashboardBlock>
      <h1 className="text-lg font-semibold text-foreground mb-1">{t("title")}</h1>
      {/* Der Posteingang beantwortet „Was wurde mir gesagt?" — die Banner auf dem Dashboard
          „Was muss ich JETZT tun?". Deshalb hier bewusst kein Countdown und keine Dringlichkeit. */}
      <p className="text-xs text-foreground-faint mb-4">{t("intro")}</p>
      <MessageList
        initial={await presentMessages(page.messages, locale)}
        initialCursor={page.nextCursor}
        initialUnread={unread}
        tz={session.user.timezone ?? APP_TZ}
      />
    </DashboardBlock>
  );
}
