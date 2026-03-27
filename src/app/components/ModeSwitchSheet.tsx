"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, User } from "lucide-react";

interface Props {
  /** current mode — determines where we switch to */
  currentMode: "user" | "admin";
  /** label shown in the trigger chip/button */
  label: string;
}

export default function ModeSwitchSheet({ currentMode, label }: Props) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const destination = currentMode === "user" ? "/admin" : "/dashboard";
  const isGoingToAdmin = currentMode === "user";

  function handleSwitch() {
    setOpen(false);
    router.push(destination);
  }

  return (
    <>
      {/* Trigger */}
      {currentMode === "user" ? (
        // Admin chip — shown in user header for dual-role users
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 bg-foreground text-background text-xs font-semibold px-3 py-1.5 rounded-full hover:opacity-80 transition-colors"
        >
          <ShieldCheck size={12} strokeWidth={2} />
          {label}
        </button>
      ) : (
        // User mode button — shown in admin header
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 bg-surface-raised border border-border text-foreground-muted text-xs font-semibold px-3 py-1.5 rounded-full hover:text-foreground transition-colors"
        >
          <User size={12} strokeWidth={2} />
          {label}
        </button>
      )}

      {/* Bottom sheet */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          {/* Sheet */}
          <div className="relative w-full sm:w-96 bg-surface rounded-t-3xl sm:rounded-2xl px-6 pt-5 pb-10 sm:pb-6 shadow-overlay animate-slide-up">
            {/* Drag handle (mobile) */}
            <div className="sm:hidden w-10 h-1 bg-border-strong rounded-full mx-auto mb-5" />

            <div className="flex items-center gap-3 mb-4">
              {isGoingToAdmin ? (
                <div className="w-10 h-10 rounded-2xl bg-surface-raised border border-border flex items-center justify-center">
                  <ShieldCheck size={20} strokeWidth={1.75} className="text-request" />
                </div>
              ) : (
                <div className="w-10 h-10 rounded-2xl bg-surface-raised border border-border flex items-center justify-center">
                  <User size={20} strokeWidth={1.75} className="text-lock" />
                </div>
              )}
              <div>
                <div className="text-sm font-bold text-foreground">
                  {isGoingToAdmin ? "Zu Admin wechseln" : "Zu Benutzer wechseln"}
                </div>
                <div className="text-xs text-foreground-muted mt-0.5">
                  {isGoingToAdmin
                    ? "Du siehst die Verwaltungsansicht"
                    : "Du siehst deine persönliche Ansicht"}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 mt-6">
              <button
                onClick={handleSwitch}
                className={`w-full py-3 rounded-xl text-sm font-semibold transition-colors ${
                  isGoingToAdmin
                    ? "bg-foreground text-background hover:opacity-80"
                    : "bg-[var(--color-lock)] text-white hover:opacity-90"
                }`}
              >
                {isGoingToAdmin ? "Admin-Bereich öffnen" : "Benutzer-Dashboard öffnen"}
              </button>
              <button
                onClick={() => setOpen(false)}
                className="w-full py-3 rounded-xl text-sm font-medium text-foreground-muted hover:bg-surface-raised transition-colors"
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
