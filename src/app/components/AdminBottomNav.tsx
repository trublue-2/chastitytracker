"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Settings } from "lucide-react";
import { useTranslations } from "next-intl";
import AdminFAB from "./AdminFAB";

export default function AdminBottomNav() {
  const t = useTranslations("adminNav");
  const pathname = usePathname();

  const leftTabs = [
    { href: "/admin", icon: Users, label: t("users"), exact: true },
  ];

  const rightTabs = [
    { href: "/admin/settings", icon: Settings, label: t("settings"), exact: false },
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
    </nav>
  );
}
