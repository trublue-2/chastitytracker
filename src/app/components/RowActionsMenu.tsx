"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { MoreVertical } from "lucide-react";
import { useTranslations } from "next-intl";

export interface RowAction {
  /** Fertiger Text — die Komponente übersetzt nicht, der Aufrufer kennt seinen Namensraum. */
  label: string;
  icon: ReactNode;
  /** Entweder ein Ziel (Link) oder eine Handlung (Button) — nie beides. */
  href?: string;
  onSelect?: () => void;
  /** Warnfarbe für zerstörende Einträge (Löschen). */
  danger?: boolean;
  /**
   * Bestätigungsfarbe für den einen Eintrag, der etwas ABSCHLIESST statt es zu entfernen (eine
   * Kontrolle von Hand anerkennen). Bewusst nur diese eine Zusatzfarbe: sie steht in denselben
   * Menüs unmittelbar über einem `danger`-Eintrag, und die beiden gegenläufigen Ausgänge — anerkennen
   * oder ablehnen — dürfen nicht gleich aussehen.
   */
  ok?: boolean;
}

/**
 * Das Drei-Punkte-Menü einer Listenzeile: Knopf, Auswahlliste, Schliessen.
 *
 * Extrahiert aus `EntryActions`, als der Posteingang dasselbe Menü brauchte — die Hausregel verlangt
 * das Extrahieren beim zweiten Vorkommen, und die Mechanik ist heikler als sie aussieht:
 *
 *  - Die Liste ist `fixed` und wird aus `getBoundingClientRect()` positioniert, weil sie in einer
 *    Card mit `overflow` sonst abgeschnitten würde.
 *  - Weil die Position EINMAL gemessen wird, schliesst Scrollen oder Grössenänderung das Menü.
 *    Sonst bliebe es an seinen Bildschirm-Koordinaten stehen, während die Zeile darunter wegscrollt
 *    — und der letzte Eintrag ist ein Löschen, das dann scheinbar zur falschen Zeile gehört.
 *  - Das Schliessen hört auf `mousedown` UND `touchstart`; nur `click` lässt es auf dem Handy offen.
 *  - Bewusst OHNE `role="menu"`: das verspricht Pfeiltasten-Navigation, die es hier nicht gibt, und
 *    schaltet Screenreader in einen Modus, in dem sie nur eigene `menuitem`-Kinder aufzählen. Als
 *    schlichte Liste aus Link und Knopf wird der Inhalt korrekt angekündigt.
 *
 * Was NICHT hierher gehört: Rückfragen und Modals. Die bleiben beim Aufrufer, weil jede Zeile andere
 * Folgen erklärt (Kettenbruch beim Eintrag, verlorener Straftext bei der Nachricht).
 */
export default function RowActionsMenu({ items, ariaLabel }: { items: RowAction[]; ariaLabel?: string }) {
  const t = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    }
    setOpen(true);
  }

  /** Schliesst und gibt den Fokus zurück an den Knopf — sonst landet er nach dem Schliessen im Nichts. */
  function close() {
    setOpen(false);
    btnRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent | TouchEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    const onViewportChange = () => setOpen(false);
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("touchstart", onOutside);
    document.addEventListener("keydown", onKey);
    // `capture`, damit auch das Scrollen eines inneren Containers zählt (scroll blubbert nicht).
    window.addEventListener("scroll", onViewportChange, true);
    window.addEventListener("resize", onViewportChange);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("touchstart", onOutside);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onViewportChange, true);
      window.removeEventListener("resize", onViewportChange);
    };
  }, [open]);

  const itemCls = (item: RowAction, first: boolean) =>
    [
      "w-full flex items-center gap-2.5 px-4 py-3 text-sm transition",
      first ? "" : "border-t border-border-subtle",
      item.danger ? "text-warn hover:bg-warn-bg"
        : item.ok ? "text-[var(--color-ok)] hover:bg-ok-bg"
        : "text-foreground-muted hover:bg-surface-raised",
    ].filter(Boolean).join(" ");

  return (
    <div className="flex-shrink-0">
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        className="w-6 h-6 flex items-center justify-center rounded-lg text-foreground-faint hover:text-foreground hover:bg-surface-raised active:bg-border transition"
        aria-label={ariaLabel ?? t("actions")}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <MoreVertical size={16} />
      </button>

      {open && (
        <div
          ref={menuRef}
          style={{ top: pos.top, right: pos.right }}
          className="fixed w-44 bg-surface border border-border-subtle rounded-xl shadow-lg z-50 overflow-hidden"
        >
          {items.map((item, i) =>
            item.href ? (
              <Link key={item.label} href={item.href} onClick={close} className={itemCls(item, i === 0)}>
                {item.icon}
                {item.label}
              </Link>
            ) : (
              <button
                key={item.label}
                type="button"
                onClick={() => { close(); item.onSelect?.(); }}
                className={itemCls(item, i === 0)}
              >
                {item.icon}
                {item.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
