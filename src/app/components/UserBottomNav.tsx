"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, BarChart2, Lock, LockOpen, ClipboardList } from "lucide-react";
import pkg from "../../../package.json";

export type FabState = "none" | "unlocked" | "locked" | "kontrolle";

interface Props {
  fabState: FabState;
  buildDate?: string;
}

const tabs = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Übersicht", exact: true },
  { href: "/dashboard/stats", icon: BarChart2, label: "Statistik", exact: false },
];

function Fab({ state }: { state: FabState }) {
  const fabMap: Record<FabState, { href: string; icon: React.ReactNode; cls: string }> = {
    none:      { href: "/dashboard/new/verschluss", icon: <Lock    size={22} strokeWidth={2} />, cls: "bg-emerald-600 hover:bg-emerald-700" },
    unlocked:  { href: "/dashboard/new/verschluss", icon: <Lock    size={22} strokeWidth={2} />, cls: "bg-emerald-600 hover:bg-emerald-700" },
    locked:    { href: "/dashboard/new/oeffnen",    icon: <LockOpen size={22} strokeWidth={2} />, cls: "bg-gray-900 hover:bg-gray-800" },
    kontrolle: { href: "/dashboard/new/pruefung",  icon: <ClipboardList size={22} strokeWidth={2} />, cls: "bg-amber-500 hover:bg-amber-600 animate-pulse" },
  };

  const { href, icon, cls } = fabMap[state];

  return (
    <Link
      href={href}
      className={`w-14 h-14 rounded-full flex items-center justify-center text-white shadow-raised transition-colors -mt-6 flex-shrink-0 ${cls}`}
      aria-label="Neue Erfassung"
    >
      {icon}
    </Link>
  );
}

export default function UserBottomNav({ fabState, buildDate }: Props) {
  const pathname = usePathname();
  const year = new Date().getFullYear();

  return (
    <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-nav-bg border-t border-nav-border z-40 pb-safe">
      <div className="flex h-16 items-center">
        {/* Left tabs */}
        {tabs.map((tab) => {
          const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors h-full ${
                active ? "text-nav-active-text" : "text-nav-inactive-text hover:text-foreground-muted"
              }`}
            >
              <Icon size={22} strokeWidth={1.75} />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </Link>
          );
        })}

        {/* FAB slot */}
        <div className="flex-1 flex items-center justify-center">
          <Fab state={fabState} />
        </div>

        {/* Right spacers (reserved for future features) */}
        <div className="flex-1" />
        <div className="flex-1" />
      </div>

      <div className="flex items-center justify-between text-[8px] text-nav-inactive-text pb-1 px-4">
        <a href="https://fetlife.com/trublue_2" target="_blank" rel="noopener noreferrer" className="hover:text-foreground-faint transition">© trublue {year}</a>
        <span className="flex items-center gap-2">
          <span>Build {buildDate ?? "local"}</span>
          <Link href="/dashboard/changelog" className="font-mono bg-background-subtle text-foreground-faint px-1 py-0.5 rounded hover:text-foreground-muted transition">{pkg.version}</Link>
        </span>
      </div>
    </nav>
  );
}
