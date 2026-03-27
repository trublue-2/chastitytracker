"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, ClipboardList, BarChart2, Settings, LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import pkg from "../../../package.json";

interface Props {
  version: string;
  buildDate: string;
}

const navItems = [
  { href: "/admin", icon: Users, label: "Benutzer", exact: true },
  { href: "/admin/kontrollen", icon: ClipboardList, label: "Kontrollen", exact: false },
  { href: "/admin/settings", icon: Settings, label: "Einstellungen", exact: false },
];

export default function AdminDesktopSidebar({ version, buildDate }: Props) {
  const pathname = usePathname();

  return (
    <aside className="hidden sm:flex fixed left-0 top-14 bottom-0 w-52 bg-surface border-r border-border flex-col z-20">
      <nav className="flex-1 flex flex-col gap-0.5 p-3 pt-4 overflow-y-auto">
        {navItems.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                active
                  ? "bg-nav-active-bg text-nav-active-text"
                  : "text-nav-inactive-text hover:bg-surface-raised hover:text-foreground-muted"
              }`}
            >
              <Icon size={18} strokeWidth={1.75} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-border flex-shrink-0 flex flex-col gap-3">
        <button
          onClick={() => { if (window.confirm("Abmelden?")) signOut({ callbackUrl: "/login" }); }}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-nav-inactive-text hover:bg-surface-raised hover:text-foreground-muted transition-colors w-full text-left"
        >
          <LogOut size={18} strokeWidth={1.75} />
          Abmelden
        </button>
        <div className="px-2 flex flex-col gap-0.5">
          <span className="text-xs text-foreground-faint">
            <Link href="/dashboard/changelog" className="font-mono bg-surface-raised text-foreground-faint px-1.5 py-0.5 rounded hover:text-foreground-muted transition">
              v{version}
            </Link>
            <span className="ml-2">Build {buildDate}</span>
          </span>
        </div>
      </div>
    </aside>
  );
}
