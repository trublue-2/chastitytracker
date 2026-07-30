"use client";

import { useId } from "react";
import { ChevronRight } from "lucide-react";

interface ExpandRowProps {
  /** Bewusst ReactNode statt string: eine Zeile darf ihren Titel auszeichnen (fett bei ungelesen,
   *  Punkt, sr-only-Text) — ohne dass diese Komponente je Anwendungsfall ein Flag bekommt. */
  label: React.ReactNode;
  subtitle?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

export default function ExpandRow({ label, subtitle, open, onToggle, children }: ExpandRowProps) {
  // `aria-controls` zeigt nur, solange das Panel wirklich im DOM steht — ein IDREF ins Leere ist
  // schlechter als keiner. Den Zustand trägt in beiden Fällen `aria-expanded`.
  const panelId = useId();

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 hover:bg-surface-raised transition text-left"
        onClick={onToggle}
      >
        {/* min-w-0: ohne das sprengt ein langer Freitext ohne Umbruchpunkt die Zeile, statt zu
            umbrechen — der Chevron rutscht dann aus dem Bild. */}
        <div className="min-w-0 flex-1">
          <span className="text-sm text-foreground">{label}</span>
          {subtitle && <p className="text-xs text-foreground-faint mt-0.5">{subtitle}</p>}
        </div>
        <ChevronRight
          size={16}
          className={`shrink-0 text-foreground-faint transition-transform duration-200 ${open ? "rotate-90" : ""}`}
        />
      </button>
      {open && (
        <div id={panelId} className="px-5 pb-5 pt-2">
          {children}
        </div>
      )}
    </div>
  );
}
