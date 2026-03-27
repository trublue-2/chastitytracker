"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, Settings } from "lucide-react";
import AdminFAB from "./AdminFAB";

const leftTabs = [
  { href: "/admin", icon: Users, label: "Benutzer", exact: true },
];

const rightTabs = [
  { href: "/admin/settings", icon: Settings, label: "Einstellungen", exact: false },
];

export default function AdminBottomNav() {
  const pathname = usePathname();

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
    <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-[#151821]/85 backdrop-blur-xl border-t border-white/5 z-40 pb-safe">
      <div className="flex h-16 items-center">
        {leftTabs.map(renderTab)}

        {/* FAB center slot */}
        <div className="flex-1 flex items-center justify-center h-full">
          <AdminFAB />
        </div>

        {rightTabs.map(renderTab)}
      </div>
    </nav>
  );
}
