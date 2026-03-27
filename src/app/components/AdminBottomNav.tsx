"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, Settings } from "lucide-react";
import pkg from "../../../package.json";
import AdminFAB from "./AdminFAB";

interface Props {
  buildDate?: string;
}

const leftTabs = [
  { href: "/admin", icon: Users, label: "Benutzer", exact: true },
];

const rightTabs = [
  { href: "/admin/settings", icon: Settings, label: "Einstellungen", exact: false },
];

export default function AdminBottomNav({ buildDate }: Props) {
  const pathname = usePathname();
  const year = new Date().getFullYear();

  const renderTab = (tab: { href: string; icon: React.ElementType; label: string; exact: boolean }) => {
    const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
    const Icon = tab.icon;
    return (
      <Link
        key={tab.href}
        href={tab.href}
        className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors h-full ${
          active ? "text-[var(--color-request)]" : "text-nav-inactive-text hover:text-foreground-muted"
        }`}
      >
        <Icon size={22} strokeWidth={1.75} />
        <span className="text-[10px] font-medium">{tab.label}</span>
      </Link>
    );
  };

  return (
    <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-nav-bg border-t border-nav-border z-40 pb-safe">
      <div className="flex h-16 items-center">
        {leftTabs.map(renderTab)}

        {/* FAB center slot */}
        <div className="flex-1 flex items-center justify-center h-full">
          <AdminFAB />
        </div>

        {rightTabs.map(renderTab)}
      </div>

      <div className="flex items-center justify-between text-[8px] text-nav-inactive-text pb-1 px-4">
        <a href="https://fetlife.com/trublue_2" target="_blank" rel="noopener noreferrer" className="hover:text-foreground-faint transition">© trublue {year}</a>
        <span className="flex items-center gap-2">
          <span>Build {buildDate ?? "local"}</span>
          <Link href="/dashboard/changelog" className="font-mono bg-surface-raised text-foreground-faint px-1 py-0.5 rounded hover:text-foreground-muted transition">{pkg.version}</Link>
        </span>
      </div>
    </nav>
  );
}
