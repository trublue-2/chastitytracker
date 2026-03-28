"use client";

import Link from "next/link";
import { Lock, LockOpen, ClipboardCheck, Droplets } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  isLocked?: boolean;
}

export default function NewEntrySheet({ isOpen, onClose, isLocked }: Props) {
  if (!isOpen) return null;

  return (
    <div className="sm:hidden fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div className="relative bg-surface rounded-t-3xl animate-slide-up pb-safe">
        {/* Handle */}
        <div className="w-10 h-1 bg-border rounded-full mx-auto mt-3 mb-4" />

        {/* Title */}
        <p className="text-base font-semibold text-foreground text-center mb-4 px-5">
          Neuer Eintrag
        </p>

        {/* Options */}
        <div className="flex flex-col gap-1 px-3 pb-2">
          {/* Verschluss */}
          {isLocked ? (
            <div className="flex items-center gap-4 px-5 py-4 rounded-2xl bg-surface-raised opacity-50 cursor-not-allowed">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-surface-raised flex-shrink-0">
                <Lock size={22} strokeWidth={2} className="text-foreground-faint" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground-muted">Verschluss</p>
                <p className="text-xs text-foreground-faint">Nur möglich wenn offen</p>
              </div>
            </div>
          ) : (
            <Link
              href="/dashboard/new/verschluss"
              onClick={onClose}
              className="flex items-center gap-4 px-5 py-4 rounded-2xl hover:bg-surface-raised transition active:scale-[0.98]"
            >
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: "var(--color-lock-bg)" }}
              >
                <Lock size={22} strokeWidth={2} style={{ color: "var(--color-lock)" }} />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Verschluss</p>
                <p className="text-xs text-foreground-faint">Gürtel angelegt</p>
              </div>
            </Link>
          )}

          {/* Öffnen */}
          {isLocked ? (
            <Link
              href="/dashboard/new/oeffnen"
              onClick={onClose}
              className="flex items-center gap-4 px-5 py-4 rounded-2xl hover:bg-surface-raised transition active:scale-[0.98]"
            >
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: "var(--color-unlock-bg)" }}
              >
                <LockOpen size={22} strokeWidth={2} style={{ color: "var(--color-unlock)" }} />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Öffnen</p>
                <p className="text-xs text-foreground-faint">Gürtel abgelegt</p>
              </div>
            </Link>
          ) : (
            <div className="flex items-center gap-4 px-5 py-4 rounded-2xl bg-surface-raised opacity-50 cursor-not-allowed">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-surface-raised flex-shrink-0">
                <LockOpen size={22} strokeWidth={2} className="text-foreground-faint" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground-muted">Öffnen</p>
                <p className="text-xs text-foreground-faint">Nur möglich wenn verschlossen</p>
              </div>
            </div>
          )}

          {/* Divider */}
          <div className="border-t border-border mx-2 my-1" />

          {/* Kontrolle */}
          <Link
            href="/dashboard/new/pruefung"
            onClick={onClose}
            className="flex items-center gap-4 px-5 py-4 rounded-2xl hover:bg-surface-raised transition active:scale-[0.98]"
          >
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: "var(--color-inspect-bg)" }}
            >
              <ClipboardCheck size={22} strokeWidth={2} style={{ color: "var(--color-inspect)" }} />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Prüfung</p>
              <p className="text-xs text-foreground-faint">Kontrolle durchgeführt</p>
            </div>
          </Link>

          {/* Orgasmus */}
          <Link
            href="/dashboard/new/orgasmus"
            onClick={onClose}
            className="flex items-center gap-4 px-5 py-4 rounded-2xl hover:bg-surface-raised transition active:scale-[0.98]"
          >
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: "var(--color-orgasm-bg)" }}
            >
              <Droplets size={22} strokeWidth={2} style={{ color: "var(--color-orgasm)" }} />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Orgasmus</p>
              <p className="text-xs text-foreground-faint">Orgasmus erfasst</p>
            </div>
          </Link>
        </div>

        {/* Cancel */}
        <button
          onClick={onClose}
          className="w-full py-4 text-sm font-medium text-foreground-faint hover:text-foreground-muted transition"
        >
          Abbrechen
        </button>
      </div>
    </div>
  );
}
