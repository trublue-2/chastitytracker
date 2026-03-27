"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, BarChart2, Lock, LockOpen, ClipboardList, X, Plus } from "lucide-react";
import NewEntrySheet from "./NewEntrySheet";

export type FabState = "none" | "unlocked" | "locked" | "kontrolle";

interface Props {
  fabState: FabState;
  isLocked?: boolean;
}

function Fab({ state, isSheetOpen, onClick }: { state: FabState; isSheetOpen: boolean; onClick: () => void }) {
  const clsMap: Record<FabState, string> = {
    none:      "bg-[var(--color-lock)] hover:opacity-90",
    unlocked:  "bg-[var(--color-lock)] hover:opacity-90",
    locked:    "bg-foreground hover:opacity-90",
    kontrolle: "bg-[var(--color-inspect)] hover:opacity-90 animate-pulse",
  };

  const iconMap: Record<FabState, React.ReactNode> = {
    none:      <Lock size={22} strokeWidth={2} />,
    unlocked:  <Lock size={22} strokeWidth={2} />,
    locked:    <LockOpen size={22} strokeWidth={2} />,
    kontrolle: <ClipboardList size={22} strokeWidth={2} />,
  };

  return (
    <button
      onClick={onClick}
      className={`w-14 h-14 rounded-full flex items-center justify-center text-white shadow-xl transition-all -mt-6 flex-shrink-0 active:scale-95 ${clsMap[state]}`}
      aria-label="Neuer Eintrag"
    >
      {isSheetOpen ? <X size={22} strokeWidth={2} /> : iconMap[state]}
    </button>
  );
}

export default function UserBottomNav({ fabState, isLocked }: Props) {
  const pathname = usePathname();
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const overviewActive = pathname === "/dashboard";
  const statsActive = pathname.startsWith("/dashboard/stats");

  return (
    <>
      <NewEntrySheet
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
        isLocked={isLocked}
      />

      <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-xl border-t border-black/5 z-40 pb-safe">
        <div className="flex h-16 items-center">
          {/* Left tab: Übersicht */}
          <Link
            href="/dashboard"
            className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors h-full ${
              overviewActive
                ? "text-[var(--color-lock)]"
                : "text-nav-inactive-text hover:text-foreground-muted"
            }`}
          >
            <LayoutDashboard size={22} strokeWidth={1.75} />
            <span className="text-[11px] font-medium">Übersicht</span>
          </Link>

          {/* FAB center */}
          <div className="flex-1 flex items-center justify-center">
            <Fab
              state={fabState}
              isSheetOpen={isSheetOpen}
              onClick={() => setIsSheetOpen((v) => !v)}
            />
          </div>

          {/* Right tab: Statistik */}
          <Link
            href="/dashboard/stats"
            className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors h-full ${
              statsActive
                ? "text-[var(--color-lock)]"
                : "text-nav-inactive-text hover:text-foreground-muted"
            }`}
          >
            <BarChart2 size={22} strokeWidth={1.75} />
            <span className="text-[11px] font-medium">Statistik</span>
          </Link>
        </div>
      </nav>
    </>
  );
}
