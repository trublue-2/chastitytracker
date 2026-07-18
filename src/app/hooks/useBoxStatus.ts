"use client";

import { useEffect, useState } from "react";
import type { BoxRow } from "@/lib/boxStatus";

/**
 * Pollt `/api/box` im 5s-Takt — reine Status-Anzeige (die Box folgt den Verschluss-/Öffnen-Einträgen,
 * keine Kommandos). Konsument: die Dashboard-Box-Status-Karte.
 *
 * Im Hintergrund-Tab (`document.hidden`) wird der Poll übersprungen;
 * beim Sichtbarwerden holt ein SOFORT-Tick den frischen Stand (wer vom Knopfdrücken an der Box
 * zurück in die App kommt, schaut sonst genau in die 5s-Lücke). `cache: "no-store"` doppelt den
 * Server-Header ab — v.a. der WKWebView (iOS-App) beantwortete den Poll sonst aus dem HTTP-Cache,
 * und der Zustand stimmte erst nach einem Seitenwechsel (realer Vorfall 16.07). `now` wird bei
 * jedem Poll neu gesetzt, damit die Frische-Anzeige („zuletzt vor X") mitläuft.
 */
export function useBoxStatus(): { boxes: BoxRow[]; now: number } {
  const [boxes, setBoxes] = useState<BoxRow[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    // Läuft nur client-seitig (useEffect) — `document` ist hier immer vorhanden.
    const tick = () => {
      if (document.hidden) return;
      setNow(Date.now());
      fetch("/api/box", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : []))
        .then((rows: BoxRow[]) => setBoxes(rows))
        .catch(() => {});
    };
    const onVisible = () => {
      if (!document.hidden) tick();
    };
    tick();
    const iv = setInterval(tick, 5000);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return { boxes, now };
}
