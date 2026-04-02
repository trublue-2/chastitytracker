"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  icon: ReactNode;
  iconBg: string;  // CSS value, e.g. "var(--color-inspect-bg)"
  children: ReactNode;
}

export default function ActionModal({ open, onClose, title, icon, iconBg, children }: Props) {
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  const modal = (
    <div data-theme="admin" className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[9999]">
      <div className="bg-background rounded-2xl border border-border overflow-hidden w-full max-w-md shadow-2xl">
        <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: iconBg }}>
              {icon}
            </div>
            <span className="text-base font-semibold text-foreground">{title}</span>
          </div>
          <button type="button" onClick={onClose}
            className="text-foreground-faint hover:text-foreground transition p-1">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-5">
          {children}
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return modal;
  return createPortal(modal, document.body);
}
