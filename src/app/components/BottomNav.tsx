"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, BarChart2, Plus, Settings, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import pkg from "../../../package.json";

export default function BottomNav({ isAdmin, buildDate }: { isAdmin?: boolean; buildDate?: string }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const year = new Date().getFullYear();

  const baseTabs = [
    { href: "/dashboard", icon: LayoutDashboard, label: t("overview"), exact: true },
    { href: "/dashboard/stats", icon: BarChart2, label: t("stats"), exact: false },
    { href: "/dashboard/new", icon: Plus, label: t("new"), exact: false },
    { href: "/dashboard/settings", icon: Settings, label: t("settings"), exact: false },
  ];
  const adminTab = { href: "/admin", icon: ShieldCheck, label: t("admin"), exact: false };
  const tabs = isAdmin
    ? [baseTabs[0], baseTabs[1], baseTabs[2], adminTab, baseTabs[3]]
    : baseTabs;

  return (
    <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-40 pb-safe">
      <div className="flex h-16">
        {tabs.map((tab) => {
          const active = tab.exact
            ? pathname === tab.href
            : pathname.startsWith(tab.href);
          const Icon = tab.icon;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${
                active ? "text-gray-900" : "text-gray-400 hover:text-gray-600"
              }`}
            >
              <Icon size={22} strokeWidth={1.75} />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </Link>
          );
        })}
      </div>
      <div className="flex items-center justify-between text-[8px] text-gray-300 pb-1 px-4">
        <a href="https://fetlife.com/trublue_2" target="_blank" rel="noopener noreferrer" className="hover:text-gray-400 transition">© trublue {year}</a>
        <span className="flex items-center gap-2">
          <span>{t("build")} {buildDate ?? "local"}</span>
          <Link href="/dashboard/changelog" className="font-mono bg-gray-100 text-gray-400 px-1 py-0.5 rounded hover:bg-gray-200 transition">{pkg.version}</Link>
        </span>
      </div>
    </nav>
  );
}
