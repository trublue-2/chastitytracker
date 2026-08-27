"use client";

import { useCallback, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { THEME_WRAPPER_SELECTOR } from "@/lib/theme";
import { useDialogBehaviour } from "@/app/hooks/useDialogBehaviour";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  icon: ReactNode;
  iconBg: string;  // CSS value, e.g. "var(--color-inspect-bg)"
  /**
   * Läuft im Dialog gerade eine Anfrage? Dann schliesst Escape nicht — die Rückfrage darf nicht
   * unter der Aktion verschwinden, die sie gerade ausgelöst hat.
   */
  busy?: boolean;
  children: ReactNode;
}

/**
 * Modal über der Seite — als Portal, damit kein Sticky-Header und kein Stacking-Context der Seite
 * es beschneiden kann.
 *
 * Portal-Ziel ist der Theme-Wrapper der Seite, gefunden per `closest` von einem unsichtbaren Anker
 * an der EIGENEN Stelle im React-Baum aus. So erbt jedes Modal die CSS-Variablen des Bereichs, in
 * dem es wirklich steht — was die Komponenten-Schau braucht, die beide Themes nebeneinander
 * stellt. Auf einer Seite ohne Wrapper bleibt `document.body` übrig; dort erbt das Modal, was
 * `<html>` trägt (`ThemeRootSync`) — und ohne das eben `:root`, genau wie der Rest jener Seite.
 * Eine `theme`-Prop gibt es deshalb nicht: sie konnte nur die Rolle ausdrücken, nie die Welt, und
 * stand an drei Aufrufstellen falsch.
 *
 * Fixed-Positioning setzt voraus, dass die Wrapper schlichte Divs bleiben — sitzt ein Modal am
 * falschen Fleck statt über dem Fenster, ist einer von ihnen (oder ein Vorfahre) Containing-Block
 * geworden. Welche Eigenschaften das auslösen, steht bei `THEME_WRAPPER_SELECTOR`.
 *
 * Die Tastatur- und Screenreader-Mechanik (Fokus hinein, Fokus-Falle, Escape, Fokus zurück an den
 * Auslöser) liegt in `useDialogBehaviour` — sie steht auch in `Sheet` und darf nicht zweimal
 * dastehen. Warum eine Fokus-Falle statt `inert` auf dem Hintergrund: siehe dort, es hängt an
 * eben diesem Portal-Ziel.
 */
export default function ActionModal({ open, onClose, title, icon, iconBg, busy = false, children }: Props) {
  const t = useTranslations("common");
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const anchorRef = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    const wrapper = el.closest<HTMLElement>(THEME_WRAPPER_SELECTOR);
    setContainer(wrapper && wrapper !== document.documentElement ? wrapper : document.body);
  }, []);

  // `open && container` statt `open`: der Dialog hängt erst im Baum, wenn das Portal-Ziel steht,
  // und vorher gibt es kein Element, in das der Fokus wandern könnte.
  useDialogBehaviour(dialogRef, { open: open && container !== null, onClose, busy });

  return (
    <>
      {/* `hidden` erzeugt keine Box — kein Lücken-Effekt in einem Flex-/Grid-Elternteil. */}
      <span ref={anchorRef} hidden />
      {open && container && createPortal(
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[9999]">
          {/* `tabIndex={-1}`: der Dialog nimmt den Fokus beim Öffnen selbst entgegen, damit der
              Screenreader Rolle und Titel ansagt. Ein Tab-Ziel wird er dadurch nicht, deshalb auch
              kein Fokus-Ring — der läge als Rahmen um das ganze Fenster und benennte etwas, das
              ohnehin schon abgesetzt ist. */}
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className="bg-background rounded-2xl border border-border w-full max-w-md shadow-2xl flex flex-col max-h-[calc(100dvh-2rem)]"
          >
            <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between gap-3 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: iconBg }}>
                  {icon}
                </div>
                <h2 id={titleId} className="text-base font-semibold text-foreground">{title}</h2>
              </div>
              {/* Erster Tab-Halt im Dialog — also braucht er einen Namen und einen sichtbaren Ring.
                  Mit blossem Symbol sagte der Screenreader hier nur „Schaltfläche". */}
              {/* `disabled` bei laufender Anfrage: `busy` sperrte bisher nur Escape, und dieses X
                  schloss die Rückfrage trotzdem — die Aktion lief im Hintergrund weiter, der
                  Nutzer sah eine unveränderte Seite und hielt den Abbruch für gelungen. */}
              <button type="button" onClick={onClose} disabled={busy} aria-label={t("close")}
                className="text-foreground-faint hover:text-foreground transition p-1 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="flex flex-col gap-4 px-5 py-5 overflow-y-auto">
              {children}
            </div>
          </div>
        </div>,
        container,
      )}
    </>
  );
}
