"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import { iconButtonCls } from "@/app/components/inputStyles";

/**
 * Das kleine **ⓘ**: eine Nebensache, die auf Antippen erscheint.
 *
 * Es gibt einen Platz zwischen „steht dauerhaft da" und „gibt es nicht". Bis v6 hatte die App den
 * nicht: eine Angabe war entweder eine eigene Zeile im Dauerbild oder sie fehlte. Deshalb belegten
 * Support-Angaben wie Seriennummer und Firmware dieselbe Fläche wie eine laufende Frist. Was hier
 * hineingeht, ist die dritte Sorte — man braucht es selten, aber wenn, dann genau hier und nicht
 * drei Bildschirme weiter.
 *
 * **Antippen, nicht Überfahren.** Ein Tooltip am Hover gibt es auf dem Handy nicht, und die App ist
 * zuerst eine Handy-App. Deshalb ein Knopf mit `aria-expanded` und eine Fläche darunter — eine
 * Offenlegung, kein Tooltip. Das ist zugleich die Bauform, die ohne Positionsrechnerei auskommt
 * und mit der Tastatur von selbst funktioniert.
 *
 * Was NICHT hineingehört: alles, wonach jemand handeln soll. Eine Aktion hinter einem ⓘ ist
 * versteckt, nicht entlastet.
 */
export default function InfoDot({
  label,
  children,
  align = "left",
}: {
  /** Was das Zeichen ankündigt — der zugängliche Name des Knopfes, z.B. „Angaben zum Gerät".
   *
   *  NICHT die Überschrift daneben durchreichen: der Screenreader sagte sonst „Box, Box
   *  Schaltfläche". Der Name muss sagen, was hinter dem Zeichen STEHT. */
  label: string;
  children: ReactNode;
  /** An welcher Kante die Fläche hängt. `right`, wenn das Zeichen selbst rechts aussen sitzt —
   *  sonst öffnet sie nach rechts aus dem Bild. Ein Ersatz für echte Kollisionsprüfung, siehe
   *  den Vermerk am Panel. */
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrapRef = useRef<HTMLSpanElement>(null);

  // Escape und ein Tipp daneben schliessen. Bewusst NICHT über `useDialogBehaviour`: der bringt
  // Fokus-Falle und Scroll-Sperre mit, und beides wäre für eine Fussnote eine Zumutung — sie hält
  // niemanden fest.
  useEffect(() => {
    if (!open) return;
    // Zwei Ereignisse, zwei Handler: eine gemeinsame Funktion brauchte `instanceof` UND einen
    // `e.type`-Vergleich, also zwei verschiedene Arten, dieselbe Frage zu stellen.
    const beiTaste = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const beiTipp = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", beiTaste);
    document.addEventListener("pointerdown", beiTipp);
    return () => {
      document.removeEventListener("keydown", beiTaste);
      document.removeEventListener("pointerdown", beiTipp);
    };
  }, [open]);

  return (
    <span ref={wrapRef} className="relative inline-flex align-middle">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={id}
        aria-label={label}
        className={`${iconButtonCls} justify-center text-foreground-faint hover:text-foreground-muted`}
      >
        <Info size={14} aria-hidden />
      </button>
      {open && (
        // `w-max` mit Deckel: der Inhalt ist eine kurze Angabe, keine Prosa — er soll seine Breite
        // selbst bestimmen dürfen, aber nicht aus der Spalte laufen. Eine Fläche ist hier richtig
        // und keine Ausnahme von der Kasten-Regel: sie ist ein eingeblendetes Blatt ÜBER dem
        // Inhalt, nicht ein Abschnitt der Seite — deshalb `shadow-overlay`, wie bei den Menüs.
        //
        // `z-50` und nicht 30: die Ebenen-Ordnung dieses Baums ist 50 = Menüs und Blätter,
        // 40 = untere Leiste, 30 = klebender Kopf. Auf 30 öffnete ein Zeichen im unteren
        // Bildschirmdrittel UNTER der Navigationsleiste.
        //
        // OFFEN: `align` ist eine Handangabe, keine Fähigkeit. Die Fläche ist `absolute`, wird in
        // einem Vorfahren mit `overflow-hidden` abgeschnitten und öffnet ganz unten ins Nichts.
        // Für die heutigen Stellen trägt das; VOR dem breiten Einsatz braucht es die berechnete
        // Position, die `RowActionsMenu` bereits vormacht (`fixed` plus Messung).
        <span
          id={id}
          className={`absolute top-full mt-1 z-50 w-max max-w-64 max-h-64 overflow-y-auto rounded-lg border border-border bg-surface shadow-overlay px-3 py-2 text-neben text-foreground-muted ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {children}
        </span>
      )}
    </span>
  );
}
