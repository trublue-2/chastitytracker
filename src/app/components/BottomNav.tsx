"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ClipboardList, Plus, BarChart2, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";

interface BottomNavProps {
  isAdmin?: boolean;
  isLocked?: boolean;
  onNewEntry?: () => void;
  version?: string;
  buildDate?: string;
}

export default function BottomNav({ isAdmin, onNewEntry, version, buildDate }: BottomNavProps) {
  const t = useTranslations("nav");
  const pathname = usePathname();

  const tabs = [
    { href: "/dashboard", icon: Home, label: t("overview"), exact: true },
    { href: "/dashboard/eintraege", icon: ClipboardList, label: t("entries"), exact: false },
    { href: "#new", icon: Plus, label: t("new"), action: true },
    { href: "/dashboard/stats", icon: BarChart2, label: t("stats"), exact: false },
    ...(isAdmin
      ? [{ href: "/admin", icon: ShieldCheck, label: t("admin"), exact: false }]
      : []),
  ];

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-nav-bg border-t border-nav-border z-40 pb-safe">
      <div className="flex h-16">
        {tabs.map((tab) => {
          if ("action" in tab && tab.action) {
            return (
              <button
                key="new"
                type="button"
                onClick={onNewEntry}
                className="flex-1 flex flex-col items-center justify-center gap-1 text-nav-inactive-text hover:text-foreground-muted transition-colors"
                aria-label={tab.label}
              >
                <div className="w-10 h-10 rounded-full bg-btn-primary flex items-center justify-center">
                  <Plus size={22} className="text-btn-primary-text" strokeWidth={2.5} />
                </div>
              </button>
            );
          }

          const active = "exact" in tab && tab.exact
            ? pathname === tab.href
            : pathname.startsWith(tab.href);
          const Icon = tab.icon;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${
                active ? "text-nav-active-text" : "text-nav-inactive-text hover:text-nav-inactive-hover"
              }`}
            >
              <Icon size={22} strokeWidth={active ? 2 : 1.5} />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </Link>
          );
        })}
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
