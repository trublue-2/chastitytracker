"use client";

import { useEffect } from "react";
import { setAppBadgeSafe } from "@/lib/swMessages";

/**
 * Hält das App-Badge am ZUSTAND — beim Seitenaufruf und bei jedem Resume.
 *
 * Vorher stand im Layout ein unbedingtes `navigator.clearAppBadge()`: jeder Start und jeder
 * Wechsel zurück in die App setzte das Badge auf 0, egal wie viel ungelesen war. Solange das
 * Badge eine feste 1 war, fiel das nicht auf — es war ohnehin bedeutungslos. Mit einer echten
 * Zahl wäre daraus ein Badge geworden, das nach dem ersten Blick in die App für immer
 * verschwindet, obwohl die Nachrichten ungelesen sind.
 *
 * `unread` kommt vom Server (Header) und ist damit beim Rendern frisch. Ein Resume danach setzt
 * denselben Stand erneut, statt ihn zu löschen: das ist im Zweifel zu hoch, aber nie zu tief —
 * die günstigere Richtung, wenn eine Pflicht mit Frist dranhängt.
 */
export default function AppBadgeSync({ unread }: { unread: number }) {
  useEffect(() => {
    setAppBadgeSafe(unread);
    const onVisible = () => {
      if (document.visibilityState === "visible") setAppBadgeSafe(unread);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [unread]);

  return null;
}
