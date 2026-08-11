"use client";

import { useId } from "react";
import { ChevronRight } from "lucide-react";

interface ExpandRowProps {
  /** Bewusst ReactNode statt string: eine Zeile darf ihren Titel auszeichnen (fett bei ungelesen,
   *  Punkt, sr-only-Text) — ohne dass diese Komponente je Anwendungsfall ein Flag bekommt. */
  label: React.ReactNode;
  subtitle?: React.ReactNode;
  open: boolean;
  /** Fehlt `onToggle`, gibt es nichts aufzuklappen: die Zeile behält Geometrie, Hover und
   *  Aktions-Spalte, verliert aber Knopf, Chevron und Panel. Sonst baut jeder Aufrufer mit einem
   *  solchen Fall die Zeile ein zweites Mal nach — und sie läuft auseinander (im Posteingang stand
   *  die Aktions-Spalte prompt auf `pr-2` statt `pr-4 pl-1`, das Menü sprang von Zeile zu Zeile). */
  onToggle?: () => void;
  /** Aktionen der Zeile (z.B. ein Drei-Punkte-Menü). Steht NEBEN der Aufklapp-Fläche, nicht darin:
   *  ein Knopf in einem Knopf ist ungültiges Markup und verschluckt beide Klicks. */
  actions?: React.ReactNode;
  /** Nur relevant, wenn `onToggle` gesetzt ist. */
  children?: React.ReactNode;
}

/** Geometrie der Zeile — geteilt von der aufklappbaren und der statischen Fassung. */
const ROW_CLS = "min-w-0 flex-1 flex items-center justify-between gap-3 px-5 py-4 text-left";

/** min-w-0: ohne das sprengt ein langer Freitext ohne Umbruchpunkt die Zeile, statt zu umbrechen —
 *  der Chevron rutscht dann aus dem Bild. */
function RowText({ label, subtitle }: { label: React.ReactNode; subtitle?: React.ReactNode }) {
  return (
    <div className="min-w-0 flex-1">
      <span className="text-sm text-foreground">{label}</span>
      {subtitle && <p className="text-xs text-foreground-faint mt-0.5">{subtitle}</p>}
    </div>
  );
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
        {/* Ein `button` nur, wenn es etwas zu tun gibt. Ohne `onToggle` dasselbe Element als `div`:
            gleiche Klassen, gleicher Platz — nur ohne Rolle, ohne `aria-expanded` und ohne Chevron,
            das ein Aufklappen verspräche, das nicht kommt. */}
        {onToggle ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={open ? panelId : undefined}
            className={ROW_CLS}
            onClick={onToggle}
          >
            <RowText label={label} subtitle={subtitle} />
            <ChevronRight
              size={16}
              className={`shrink-0 text-foreground-faint transition-transform duration-200 ${open ? "rotate-90" : ""}`}
            />
          </button>
        ) : (
          <div className={ROW_CLS}>
            <RowText label={label} subtitle={subtitle} />
          </div>
        )}
        {actions && <div className="pr-4 pl-1">{actions}</div>}
      </div>
      {onToggle && open && (
        <div id={panelId} className="px-5 pb-5 pt-2">
          {children}
        </div>
      )}
    </div>
  );
}
