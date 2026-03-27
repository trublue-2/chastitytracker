"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, BarChart2, Plus, Settings, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { signOut } from "next-auth/react";

interface Props {
  isAdmin?: boolean;
  version: string;
  buildDate: string;
}

export default function DesktopSidebar({ isAdmin: _isAdmin, version, buildDate }: Props) {
  const t = useTranslations("nav");
  const pathname = usePathname();

  const navItems = [
    { href: "/dashboard", icon: LayoutDashboard, label: t("overview"), exact: true },
    { href: "/dashboard/stats", icon: BarChart2, label: t("stats"), exact: false },
    { href: "/dashboard/new", icon: Plus, label: t("new"), exact: false },
    { href: "/dashboard/settings", icon: Settings, label: t("settings"), exact: false },
  ];

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
                  ? "bg-nav-active-bg text-[var(--color-lock)]"
                  : "text-nav-inactive-text hover:bg-background-subtle hover:text-foreground"
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
          onClick={() => { if (window.confirm(t("signOutConfirm"))) signOut({ callbackUrl: "/login" }); }}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-nav-inactive-text hover:bg-background-subtle hover:text-foreground transition-colors w-full text-left"
        >
          <LogOut size={18} strokeWidth={1.75} />
          {t("signOut")}
        </button>
        <div className="px-2 flex flex-col gap-0.5">
          <a href="https://fetlife.com/trublue_2" target="_blank" rel="noopener noreferrer" className="text-xs text-foreground-faint hover:text-foreground-muted transition">© trublue {new Date().getFullYear()}</a>
          <span className="text-xs text-foreground-faint">
            <Link href="/dashboard/changelog" className="font-mono bg-background-subtle text-foreground-faint px-1.5 py-0.5 rounded hover:text-foreground-muted transition">v{version}</Link>
            <span className="ml-2">{t("build")} {buildDate}</span>
          </span>
        </div>
      </div>
    </aside>
  );
}
