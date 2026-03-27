import Link from "next/link";
import AvatarMenu from "@/app/components/AvatarMenu";
import ModeSwitchSheet from "@/app/components/ModeSwitchSheet";

interface Props {
  username: string;
}

export default function AdminHeader({ username }: Props) {
  return (
    <header className="bg-surface border-b border-border sticky top-0 z-30 pt-safe">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
        <Link
          href="/admin"
          className="font-bold text-foreground hover:text-foreground-muted transition text-lg tracking-tight flex items-baseline gap-2"
        >
          KG-Tracker
          <span className="text-xs font-semibold text-foreground-faint tracking-widest uppercase">
            Admin
          </span>
        </Link>

        <div className="flex items-center gap-2">
          {/* User-mode button — navigate to /dashboard */}
          <ModeSwitchSheet currentMode="admin" label="Benutzer" />

          <AvatarMenu
            username={username}
            settingsHref="/admin/settings"
            changelogHref="/dashboard/changelog"
            theme="admin"
          />
        </div>
      </div>
    </header>
  );
}
