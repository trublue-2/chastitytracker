"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { THEME_WRAPPER_SELECTOR } from "@/lib/theme";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  icon: ReactNode;
  iconBg: string;  // CSS value, e.g. "var(--color-inspect-bg)"
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
 * `<html>` trägt (`applyTheme`) — und ohne das eben `:root`, genau wie der Rest jener Seite.
 * Eine `theme`-Prop gibt es deshalb nicht: sie konnte nur die Rolle ausdrücken, nie hell/dunkel,
 * und stand an drei Aufrufstellen falsch.
 *
 * Fixed-Positioning setzt voraus, dass die Wrapper schlichte Divs bleiben — sitzt ein Modal am
 * falschen Fleck statt über dem Fenster, ist einer von ihnen (oder ein Vorfahre) Containing-Block
 * geworden. Welche Eigenschaften das auslösen, steht bei `THEME_WRAPPER_SELECTOR`.
 */
export default function ActionModal({ open, onClose, title, icon, iconBg, children }: Props) {
  const [container, setContainer] = useState<HTMLElement | null>(null);

  const anchorRef = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    const wrapper = el.closest<HTMLElement>(THEME_WRAPPER_SELECTOR);
    setContainer(wrapper && wrapper !== document.documentElement ? wrapper : document.body);
  }, []);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      {/* `hidden` erzeugt keine Box — kein Lücken-Effekt in einem Flex-/Grid-Elternteil. */}
      <span ref={anchorRef} hidden />
      {open && container && createPortal(
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[9999]">
          <div className="bg-background rounded-2xl border border-border w-full max-w-md shadow-2xl flex flex-col max-h-[calc(100dvh-2rem)]">
            <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between gap-3 flex-shrink-0">
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
