"use client";

import { ChevronRight } from "lucide-react";

interface ExpandRowProps {
  label: string;
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

export default function ExpandRow({ label, subtitle, open, onToggle, children }: ExpandRowProps) {
  return (
    <div>
      <button
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-raised transition text-left"
        onClick={onToggle}
      >
        <div>
          <span className="text-sm text-foreground">{label}</span>
          {subtitle && <p className="text-xs text-foreground-faint mt-0.5">{subtitle}</p>}
        </div>
        <ChevronRight
          size={16}
          className={`text-foreground-faint transition-transform duration-200 ${open ? "rotate-90" : ""}`}
        />
      </button>
      {open && (
        <div className="px-5 pb-5">
          {children}
        </div>
      )}
    </div>
  );
}
