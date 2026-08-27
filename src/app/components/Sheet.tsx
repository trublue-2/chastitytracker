"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { useDialogBehaviour } from "@/app/hooks/useDialogBehaviour";
import { hapticMedium } from "@/lib/haptics";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  /**
   * Der Name des Dialogs, wenn KEIN sichtbarer Titel gesetzt ist — etwa weil der Aufrufer seine
   * Überschrift selbst gestaltet (`RiskConfirmSheet` setzt sie neben ein Warnsymbol). Ohne ihn
   * hätte so ein Sheet gar keinen Namen: der Screenreader sagte „Dialog" und sonst nichts.
   */
  label?: string;
  /**
   * Läuft im Sheet eine Anfrage? Dann schliesst weder Escape noch ein Klick auf den Hintergrund —
   * dieselbe Zusage wie in `ActionModal`, und ein Sheet mit laufender Aktion gibt es real
   * (`RiskConfirmSheet` mit `proceeding`).
   */
  busy?: boolean;
  children: ReactNode;
}

export default function Sheet({ open, onClose, title, label, busy = false, children }: SheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Haptic feedback on open
  useEffect(() => {
    if (open) hapticMedium();
  }, [open]);

  // Fokus-Falle, Escape, Autofokus, Fokus-Rückgabe und Scroll-Sperre über den geteilten Hook.
  //
  // Hier stand die Vorlage, von der `ActionModal` in #89 abgeschrieben hat — und dabei fiel auf,
  // dass sie drei Fehler hatte, die man mit der Maus nie bemerkt:
  //
  //  1. Der Selektor nahm `button` roh. Sobald ein Knopf im Dialog lädt, setzt `Button` ihn auf
  //     `disabled`; er stand dann als „letztes fokussierbares Element" in der Liste, war aber nie
  //     `document.activeElement` — und der nächste Tab fiel aus dem Dialog heraus.
  //  2. Der Fokus ging beim Schliessen nicht an den Auslöser zurück; man stand danach wieder am
  //     Seitenanfang.
  //  3. Fokussiert wurde das erste Element statt des Dialogs, weshalb der Screenreader den Titel
  //     nicht ansagte, sondern gleich das erste Feld.
  //
  // Genau deshalb der Hook: zwei Fassungen derselben Mechanik laufen garantiert auseinander, wenn
  // ihre Fehler unsichtbar sind.
  useDialogBehaviour(sheetRef, { open, onClose, busy });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop. Bei laufender Anfrage tot: sonst nähme ein Klick daneben die Rückfrage weg,
          während die Aktion im Hintergrund weiterläuft — derselbe Fall, den `busy` bei Escape
          abstellt. */}
      <div
        className="absolute inset-0 bg-black/50 animate-fade-in"
        onClick={busy ? undefined : onClose}
        aria-hidden="true"
      />
      {/* Sheet */}
      {/* `tabIndex={-1}`: der Hook gibt dem Dialog selbst den Fokus, wenn ihn kein Feld im Inhalt
          beansprucht — damit der Screenreader den Titel ansagt statt gleich das erste Feld. Ohne
          diesen Wert nimmt ein `div` keinen Fokus an.

          Rolle, `aria-modal` und der Name sitzen am SELBEN Element wie die Falle — der Hook
          verlangt das, und vorher trugen sie die Overlay-Fläche darüber. Der Fokus landete damit
          auf einem Element ohne Rolle: der Screenreader sagte beim Öffnen nichts, obwohl direkt
          darüber ein sauber ausgezeichneter Dialog stand. */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        {...(title ? { "aria-labelledby": titleId } : { "aria-label": label })}
        tabIndex={-1}
        className="absolute bottom-0 left-0 right-0 max-h-[90vh] overflow-y-auto bg-surface rounded-t-2xl animate-slide-up"
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-border-strong" />
        </div>
        {title && (
          <div className="px-4 pb-3 pt-1">
            <h2 id={titleId} className="text-lg font-semibold text-foreground">{title}</h2>
          </div>
        )}
        <div className="px-4 pb-safe pb-6">
          {children}
        </div>
      </div>
    </div>
  );
}
