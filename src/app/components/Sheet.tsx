"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useDialogBehaviour } from "@/app/hooks/useDialogBehaviour";
import { hapticMedium } from "@/lib/haptics";

/** Ab welcher zurückgelegten Strecke (px) das Loslassen schliesst statt zurückzufedern. */
const SCHLIESS_WEG = 90;
/** …oder ab welchem Tempo (px/ms), damit auch ein kurzer, schneller Wisch zählt. */
const SCHLIESS_TEMPO = 0.5;

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
  const t = useTranslations("common");
  const sheetRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // ── Nach unten wischen schliesst ───────────────────────────────────────────
  //
  // Ein Sheet, das nur über den Hintergrund oder Escape zugeht, ist auf dem Handy die einzige
  // Fläche der App, die sich nicht so bedienen lässt, wie sie aussieht: der Griff oben verspricht
  // eine Geste, die es nicht gab.
  //
  // Die Geste beginnt NUR bei `scrollTop <= 0` — sonst nähme sie dem Inhalt das Scrollen weg,
  // sobald die Liste länger ist als das Sheet (die Erfassungs-Liste ist genau das). Der Griff
  // selbst zieht immer, auch mitten im gescrollten Inhalt: er ist das Bauteil für die Geste.
  // Der Weg des Fingers geht DIREKT an den Knoten, nicht durch React: `pointermove` feuert auf
  // einem 120-Hz-Gerät bis zu 120-mal je Sekunde, und ein `setState` je Ereignis rendert den
  // Sheet-Teilbaum ebenso oft. Gerendert wird nur EINMAL je Geste — für `ziehend`, das die
  // Übergangszeit und `touch-action` umschaltet.
  const [ziehend, setZiehend] = useState(false);
  const geste = useRef<{ y0: number; t0: number } | null>(null);
  // Ob überhaupt schon einmal gezogen wurde: davon hängt die Einblend-Animation ab. An `ziehend`
  // gehängt liefe sie bei JEDEM Zurückfedern erneut — zusätzlich zur Übergangszeit, die dieselbe
  // Bewegung schon macht.
  const jeGezogen = useRef(false);

  const setzeZug = (px: number) => {
    const el = sheetRef.current;
    if (el) el.style.transform = px > 0 ? `translateY(${px}px)` : "";
  };

  const zugStart = (e: React.PointerEvent, amGriff: boolean) => {
    if (busy || e.pointerType === "mouse") return; // Maus zieht nicht — dort gibt es den Klick
    const el = sheetRef.current;
    if (!el) return;
    if (!amGriff && el.scrollTop > 0) return;
    geste.current = { y0: e.clientY, t0: e.timeStamp };
    // Den Zeiger festhalten: ohne das gehen `pointermove`/`pointerup` an das Element unter dem
    // Finger, sobald er die Sheet-Fläche verlässt (Zug über die untere Bildschirmkante hinaus).
    // Das Loslassen käme dann nie an, und das Sheet bliebe verschoben stehen.
    try { el.setPointerCapture(e.pointerId); } catch { /* ältere WebViews: dann eben ohne */ }
  };

  const zugBewegung = (e: React.PointerEvent) => {
    const g = geste.current;
    if (!g) return;
    const d = e.clientY - g.y0;
    if (d <= 0) { setzeZug(0); return; }  // nach oben zieht nicht
    if (!ziehend) {
      if (d < 6) return;                  // Wackeln ist keine Geste
      jeGezogen.current = true;
      setZiehend(true);
    }
    setzeZug(d);
  };

  const zugEnde = (e: React.PointerEvent) => {
    const g = geste.current;
    geste.current = null;
    setzeZug(0);
    setZiehend(false);
    // `g` statt `ziehend` als Wächter: `ziehend` stammt aus dem Render zum Ereigniszeitpunkt und
    // kann bei zwei Ereignissen im selben Takt (up + cancel) noch `true` sein, während die Geste
    // schon verworfen ist — ein `g!` liefe dort in einen Null-Zugriff.
    if (!g) return;
    const d = e.clientY - g.y0;
    const tempo = d / Math.max(1, e.timeStamp - g.t0);
    if (d < 6) return;                    // Wackeln ist keine Geste
    if (!busy && (d > SCHLIESS_WEG || tempo > SCHLIESS_TEMPO)) onClose();
  };

  // Ein Sheet, das zugeht, darf keinen halben Zug behalten — sonst steht der nächste Aufruf
  // verschoben da. Auch der Auslöser der Geste wird verworfen: geschlossen werden kann auch
  // MITTEN im Zug (Escape, Hintergrund), und es gibt kein `setPointerCapture`.
  useEffect(() => {
    if (!open) { setZiehend(false); geste.current = null; jeGezogen.current = false; setzeZug(0); }
  }, [open]);

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
        onPointerDown={(e) => zugStart(e, false)}
        onPointerMove={zugBewegung}
        onPointerUp={zugEnde}
        onPointerCancel={zugEnde}
        // Während des Zuges keine Übergangszeit — sonst hinkt das Sheet dem Finger hinterher.
        // Beim Loslassen federt es über den Übergang zurück. Die Einblend-Animation hängt an
        // „wurde noch nie gezogen", nicht am laufenden Zug.
        className={`absolute bottom-0 left-0 right-0 max-h-[90vh] overflow-y-auto bg-surface rounded-t-2xl${jeGezogen.current ? "" : " animate-slide-up"}`}
        style={ziehend
          ? { touchAction: "none" }
          : { transition: "transform 0.25s cubic-bezier(0.32, 0.72, 0, 1)" }}
      >
        {/* Der Griff ist jetzt ein Knopf: er SAGTE schon immer „zieh mich", konnte aber nichts.
            Ein Klick schliesst, ein Zug nach unten ebenfalls — und beides erreicht damit denselben
            Ausgang wie Escape und der Hintergrund. `aria-label`, weil ein Strich keinen Text hat;
            `touch-none`, damit der Zug am Griff nicht als Scroll-Versuch verpufft. */}
        <button
          type="button"
          onClick={busy ? undefined : onClose}
          onPointerDown={(e) => zugStart(e, true)}
          aria-label={t("close")}
          className="w-full flex justify-center pt-3 pb-1 touch-none"
        >
          <span className="w-10 h-1 rounded-full bg-border-strong" />
        </button>
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
