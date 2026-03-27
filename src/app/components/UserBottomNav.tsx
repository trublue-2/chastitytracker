"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, BarChart2, Plus, ShieldCheck, ClipboardList } from "lucide-react";
import NewEntrySheet from "./NewEntrySheet";

export type FabState = "none" | "unlocked" | "locked" | "kontrolle";

interface Props {
  fabState: FabState;
  isLocked?: boolean;
  isAdmin?: boolean;
  version?: string;
  buildDate?: string;
}

export default function UserBottomNav({ fabState: _fabState, isLocked, isAdmin, version, buildDate }: Props) {
  const pathname = usePathname();
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const overviewActive = pathname === "/dashboard";
  const eintraegeActive = pathname.startsWith("/dashboard/eintraege");
  const statsActive = pathname.startsWith("/dashboard/stats");

  const tabCls = (active: boolean) =>
    `flex-1 flex flex-col items-center justify-center gap-1 transition-colors h-full ${
      active ? "text-foreground" : "text-nav-inactive-text hover:text-foreground-muted"
    }`;

  return (
    <>
      <NewEntrySheet
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
        isLocked={isLocked}
      />

      <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-xl border-t border-black/5 z-40 pb-safe">
        <div className="flex h-16 items-center">
          <Link href="/dashboard" className={tabCls(overviewActive)}>
            <LayoutDashboard size={22} strokeWidth={1.75} />
            <span className="text-[11px] font-medium">Übersicht</span>
          </Link>

          <Link href="/dashboard/eintraege" className={tabCls(eintraegeActive)}>
            <ClipboardList size={22} strokeWidth={1.75} />
            <span className="text-[11px] font-medium">Einträge</span>
          </Link>

          <button
            onClick={() => setIsSheetOpen((v) => !v)}
            className={tabCls(isSheetOpen)}
          >
            <Plus size={22} strokeWidth={1.75} />
            <span className="text-[11px] font-medium">Neu</span>
          </button>

          <Link href="/dashboard/stats" className={tabCls(statsActive)}>
            <BarChart2 size={22} strokeWidth={1.75} />
            <span className="text-[11px] font-medium">Statistik</span>
          </Link>

          {isAdmin && (
            <Link href="/admin" className={tabCls(false)}>
              <ShieldCheck size={22} strokeWidth={1.75} />
              <span className="text-[11px] font-medium">Admin</span>
            </Link>
          )}
        </div>
        {(version || buildDate) && (
          <div className="flex items-center justify-between px-4 pb-1">
            <a href="https://fetlife.com/trublue_2" target="_blank" rel="noopener noreferrer" className="text-[10px] text-foreground-faint hover:text-foreground-muted transition">
              © trublue {new Date().getFullYear()}
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
    </>
  );
}
