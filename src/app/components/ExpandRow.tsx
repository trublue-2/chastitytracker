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
  /** Aktionen der Zeile (z.B. ein Drei-Punkte-Menü). Steht NEBEN der Aufklapp-Fläche, nicht darin:
   *  ein Knopf in einem Knopf ist ungültiges Markup und verschluckt beide Klicks. */
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export default function ExpandRow({ label, subtitle, open, onToggle, actions, children }: ExpandRowProps) {
  // `aria-controls` zeigt nur, solange das Panel wirklich im DOM steht — ein IDREF ins Leere ist
  // schlechter als keiner. Den Zustand trägt in beiden Fällen `aria-expanded`.
  const panelId = useId();

  return (
    <div>
      {/* Der Aufklapp-Knopf trägt den Innenabstand selbst (statt des Elters), damit die Zeile ohne
          `actions` genau aussieht wie vorher und die volle Fläche klickbar bleibt.

          Der Hover liegt am CONTAINER, nicht am Knopf: sonst endete die Aufhellung an der Kante des
          Knopfes und die Aktions-Spalte daneben bliebe weiss — ein abgeschnittener Block mitten in
          der Zeile. */}
      <div className="flex items-center transition hover:bg-surface-raised">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          className="min-w-0 flex-1 flex items-center justify-between gap-3 px-5 py-4 text-left"
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
        {actions && <div className="pr-4 pl-1">{actions}</div>}
      </div>
      {open && (
        <div id={panelId} className="px-5 pb-5 pt-2">
          {children}
        </div>
      )}
    </div>
  );
}
