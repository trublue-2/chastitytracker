"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ArrowLeftRight, Lock, LockOpen } from "lucide-react";

interface UserEntry {
  id: string;
  username: string;
  isLocked: boolean;
}

interface Props {
  userId: string;
  username: string;
  currentStatus: "VERSCHLUSS" | "OEFFNEN" | null;
  since: string | null; // ISO string
  users: UserEntry[];
}

function LiveTimer({ since }: { since: string }) {
  const [display, setDisplay] = useState("");

  useEffect(() => {
    function tick() {
      const ms = Date.now() - new Date(since).getTime();
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      const s = Math.floor((ms % 60_000) / 1_000);
      setDisplay(
        `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      );
    }
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [since]);

  return <span className="font-mono tabular-nums">{display}</span>;
}

export default function UserContextBar({ userId, username, currentStatus, since, users }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const router = useRouter();
  const isLocked = currentStatus === "VERSCHLUSS";

  function handleUserSelect(id: string) {
    setSheetOpen(false);
    // Save to localStorage
    try { localStorage.setItem("lastSelectedUserId", id); } catch {}
    router.push(`/admin/users/${id}`);
  }

  return (
    <>
      {/* Context bar */}
      <div className="sticky top-14 z-20 bg-surface border-b border-border px-4 sm:px-6 h-13 flex items-center gap-3">
        <Link
          href="/admin"
          className="flex items-center gap-1 text-foreground-faint hover:text-foreground-muted transition-colors text-sm flex-shrink-0"
        >
          <ChevronLeft size={16} strokeWidth={2} />
          <span className="hidden sm:inline">Alle Benutzer</span>
        </Link>

        <div className="w-px h-4 bg-border flex-shrink-0" />

        {/* User + status */}
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <span className="font-bold text-foreground text-sm truncate">{username}</span>
          <span className={`flex items-center gap-1 text-xs font-medium flex-shrink-0 ${isLocked ? "text-lock" : "text-foreground-faint"}`}>
            {isLocked
              ? <><Lock size={11} strokeWidth={2} /> {since ? <LiveTimer since={since} /> : "GESPERRT"}</>
              : currentStatus
                ? <><LockOpen size={11} strokeWidth={2} /> OFFEN</>
                : <span className="text-foreground-faint">–</span>
            }
          </span>
        </div>

        {/* Switch button */}
        <button
          onClick={() => setSheetOpen(true)}
          className="flex items-center gap-1.5 text-xs font-semibold text-foreground-muted hover:text-foreground bg-surface-raised border border-border px-2.5 py-1.5 rounded-xl transition-colors flex-shrink-0"
        >
          <ArrowLeftRight size={12} strokeWidth={2} />
          <span className="hidden sm:inline">Benutzer wechseln</span>
          <span className="sm:hidden">Wechseln</span>
        </button>
      </div>

      {/* User switch sheet */}
      {sheetOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSheetOpen(false)} />
          <div className="relative w-full sm:w-96 bg-surface border border-border rounded-t-3xl sm:rounded-2xl overflow-hidden shadow-overlay animate-slide-up">
            {/* Handle */}
            <div className="sm:hidden w-10 h-1 bg-border-strong rounded-full mx-auto mt-3 mb-1" />
            <div className="px-5 py-4 border-b border-border-subtle">
              <p className="text-sm font-bold text-foreground">Benutzer wechseln</p>
              <p className="text-xs text-foreground-faint mt-0.5">Wähle einen Benutzer zum Betreuen</p>
            </div>
            <div className="overflow-y-auto max-h-80">
              {users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => handleUserSelect(u.id)}
                  className={`w-full flex items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-raised border-b border-border-subtle last:border-0 ${
                    u.id === userId ? "bg-surface-raised" : ""
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    u.isLocked ? "bg-lock-bg text-lock" : "bg-surface-raised text-foreground-muted"
                  }`}>
                    {u.username[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${u.id === userId ? "text-foreground" : "text-foreground-muted"}`}>
                      {u.username}
                    </p>
                  </div>
                  {u.isLocked
                    ? <Lock size={14} strokeWidth={1.75} className="text-lock flex-shrink-0" />
                    : <LockOpen size={14} strokeWidth={1.75} className="text-foreground-faint flex-shrink-0" />
                  }
                  {u.id === userId && (
                    <span className="text-xs text-foreground-faint bg-surface border border-border px-2 py-0.5 rounded-full flex-shrink-0">aktiv</span>
                  )}
                </button>
              ))}
            </div>
            <div className="p-4 border-t border-border-subtle">
              <button
                onClick={() => setSheetOpen(false)}
                className="w-full py-2.5 rounded-xl text-sm font-medium text-foreground-muted hover:bg-surface-raised transition-colors"
              >
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
