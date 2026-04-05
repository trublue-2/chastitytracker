import { auth } from "@/lib/auth";
import Link from "next/link";
import AvatarMenu from "@/app/components/AvatarMenu";
import pkg from "../../package.json";

export default async function Header() {
  const session = await auth();
  const user = session?.user;

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
