"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home, ClipboardList, BarChart2, Plus, ShieldCheck, LogOut,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { signOut } from "next-auth/react";
import NewEntrySheet from "./NewEntrySheet";

interface Props {
  isAdmin?: boolean;
  isLocked: boolean;
  version: string;
  buildDate: string;
}

export default function DesktopSidebar({ isAdmin, isLocked, version, buildDate }: Props) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);

  const navItems = [
    { href: "/dashboard", icon: Home, label: t("overview"), exact: true },
    { href: "/dashboard/eintraege", icon: ClipboardList, label: t("entries"), exact: false },
    { href: "/dashboard/stats", icon: BarChart2, label: t("stats"), exact: false },
    ...(isAdmin ? [{ href: "/admin", icon: ShieldCheck, label: t("admin"), exact: false }] : []),
  ];

  return (
    <>
      <NewEntrySheet open={sheetOpen} onClose={() => setSheetOpen(false)} isLocked={isLocked} />

      <aside className="hidden lg:flex fixed left-0 top-14 bottom-0 w-64 bg-nav-bg border-r border-nav-border flex-col z-20">
        <nav className="flex-1 flex flex-col gap-0.5 p-3 pt-4 overflow-y-auto">
          {/* Neu Button */}
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors bg-btn-primary text-btn-primary-text hover:bg-btn-primary-hover w-full text-left mb-2"
          >
            <Plus size={18} strokeWidth={2} />
            {t("new")}
          </button>

          {navItems.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  active
                    ? "bg-nav-active-bg text-nav-active-text"
                    : "text-nav-inactive-text hover:bg-surface-raised hover:text-nav-inactive-hover",
                ].join(" ")}
              >
                <Icon size={18} strokeWidth={active ? 2 : 1.5} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-nav-border flex-shrink-0 flex flex-col gap-3">
          <button
            onClick={() => { if (window.confirm(t("signOutConfirm"))) signOut({ callbackUrl: "/login" }); }}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-nav-inactive-text hover:bg-surface-raised hover:text-nav-inactive-hover transition-colors w-full text-left"
          >
            <LogOut size={18} strokeWidth={1.5} />
            {t("signOut")}
          </button>
          <div className="px-2 flex flex-col gap-0.5">
            <div className="flex items-center justify-between">
              <a href="https://fetlife.com/trublue_2" target="_blank" rel="noopener noreferrer" className="text-[10px] text-foreground-faint hover:text-foreground-muted transition">
                &copy; trublue {new Date().getFullYear()}
              </a>
              <Link href="/dashboard/changelog" className="text-[10px] font-mono bg-surface-raised text-foreground-faint px-1.5 py-0.5 rounded hover:text-foreground-muted transition">
                {version}
              </Link>
            </div>
            <span className="text-[10px] text-foreground-faint">
              {t("build")} {buildDate}
            </span>
          </div>
        </div>
      </aside>
    </>
  );
}
