import { auth } from "@/lib/auth";
import Link from "next/link";
import AvatarMenu from "@/app/components/AvatarMenu";
import FeedbackButton from "@/app/components/FeedbackButton";
import MessageBell from "@/app/components/MessageBell";
import AppBadgeSync from "@/app/components/AppBadgeSync";
import { unreadCountCached } from "@/lib/messageService";
import pkg from "../../package.json";

/** Der Zähler darf die Hülle nicht mitreissen: der Header steht in JEDEM Dashboard- und
 *  Admin-Layout. Fehlt die Tabelle noch (Instanz zieht das Update gerade erst), zeigt die Glocke
 *  keine Zahl — statt dass jede Seite 500t. */
async function unreadOrZero(userId: string): Promise<number> {
  try {
    return await unreadCountCached(userId);
  } catch (err) {
    console.error("[messages] unread count failed", err);
    return 0;
  }
}

export default async function Header() {
  const session = await auth();
  const user = session?.user;
  const feedbackEnabled = process.env.DISABLE_FEEDBACK !== "true";
  const unread = user?.id ? await unreadOrZero(user.id) : 0;

  const hostname = process.env.NEXTAUTH_URL
    ? (() => { try { return new URL(process.env.NEXTAUTH_URL!).hostname; } catch { return null; } })()
    : null;

  return (
    <header className="bg-header-bg border-b border-header-border sticky top-0 z-30 pt-safe">
      <div className="px-4 h-14 flex items-center justify-between gap-3">
        <Link
          href="/dashboard"
          className="font-bold text-header-text hover:opacity-80 transition text-lg tracking-tight flex items-baseline gap-2"
        >
          KG-Tracker
          {hostname && (
            <span className="text-xs font-normal text-header-text/60 tracking-normal">
              {hostname}
            </span>
          )}
        </Link>

        <div className="flex items-center gap-2">
          {user && <MessageBell unread={unread} />}
          {user && <AppBadgeSync unread={unread} />}
          {user && feedbackEnabled && <FeedbackButton />}
          {user && (
            <AvatarMenu
              username={user.name ?? ""}
              settingsHref="/dashboard/settings"
              theme="user"
              version={pkg.version}
            />
          )}
        </div>
      </div>
    </header>
  );
}
