"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import AdminFAB from "./AdminFAB";

interface Props {
  version?: string;
  buildDate?: string;
}

export default function AdminBottomNav({ version, buildDate }: Props) {
  const t = useTranslations("adminNav");
  const pathname = usePathname();

  const leftTabs = [
    { href: "/admin", icon: LayoutDashboard, label: t("overview"), exact: true },
  ];

  const rightTabs = [
    { href: "/dashboard", icon: Users, label: t("users"), exact: true },
  ];

  const renderTab = (tab: { href: string; icon: React.ElementType; label: string; exact: boolean }) => {
    const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
    const Icon = tab.icon;
    return (
      <Link
        key={tab.href}
        href={tab.href}
        className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors h-full ${
          active ? "text-nav-active-text" : "text-nav-inactive-text hover:text-nav-inactive-hover"
        }`}
      >
        <Icon size={22} strokeWidth={active ? 2 : 1.5} />
        <span className="text-[10px] font-medium">{tab.label}</span>
      </Link>
    );
  };

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-nav-bg border-t border-nav-border z-40 pb-safe">
      <div className="flex h-16 items-center">
        {leftTabs.map(renderTab)}
        <AdminFAB />
        {rightTabs.map(renderTab)}
      </div>
      {(version || buildDate) && (
        <div className="flex items-center justify-between px-4 pb-1">
          <a href="https://fetlife.com/trublue_2" target="_blank" rel="noopener noreferrer" className="text-[10px] text-foreground-faint hover:text-foreground-muted transition">
            &copy; trublue {new Date().getFullYear()}
          </a>
          <div className="flex items-center gap-2">
            {buildDate && <span className="text-[10px] text-foreground-faint">Build {buildDate}</span>}
            {version && (
              <Link href="/dashboard/changelog" className="text-[10px] font-mono bg-surface-raised text-foreground-faint px-1.5 py-0.5 rounded hover:text-foreground-muted transition">
                {version}
              </Link>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
