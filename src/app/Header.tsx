import { auth } from "@/lib/auth";
import Link from "next/link";
import AvatarMenu from "@/app/components/AvatarMenu";
import ModeSwitchSheet from "@/app/components/ModeSwitchSheet";

export default async function Header() {
  const session = await auth();
  const user = session?.user;
  const isAdmin = user?.role === "admin";

  const hostname = process.env.NEXTAUTH_URL
    ? (() => { try { return new URL(process.env.NEXTAUTH_URL!).hostname; } catch { return null; } })()
    : null;

  return (
    <header className="bg-surface border-b border-border sticky top-0 z-30 pt-safe">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
        <Link
          href="/dashboard"
          className="font-bold text-foreground hover:text-foreground-muted transition text-lg tracking-tight flex items-baseline gap-2"
        >
          KG-Tracker
          {hostname && (
            <span className="text-xs font-normal text-foreground-faint tracking-normal">
              {hostname}
            </span>
          )}
        </Link>

        <div className="flex items-center gap-2">
          {/* Admin chip — only for dual-role users in user mode */}
          {isAdmin && (
            <ModeSwitchSheet currentMode="user" label="Admin" />
          )}

          {user && (
            <AvatarMenu
              username={user.name ?? ""}
              settingsHref="/dashboard/settings"
              changelogHref="/dashboard/changelog"
              theme="user"
            />
          )}
        </div>
      </div>
    </header>
  );
}
