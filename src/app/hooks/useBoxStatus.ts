"use client";

import { useEffect, useState } from "react";
import type { BoxRow } from "@/lib/boxStatus";

/**
 * Pollt `/api/box` im 5s-Takt — reine Status-Anzeige (die Box folgt den Verschluss-/Öffnen-Einträgen,
 * keine Kommandos). Geteilt von der Dashboard-Box-Status-Karte und der (+)-Menü-Box-Zeile.
 *
 * `enabled=false` pausiert (z.B. geschlossenes (+)-Menü). Im Hintergrund-Tab (`document.hidden`) wird
 * der Poll übersprungen — beim Zurückkehren aktualisiert der nächste Tick binnen 5s. `now` wird bei
 * jedem Poll neu gesetzt, damit die Frische-Anzeige („zuletzt vor X") mitläuft.
 */
export function useBoxStatus(enabled = true): { boxes: BoxRow[]; now: number } {
  const [boxes, setBoxes] = useState<BoxRow[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      setNow(Date.now());
      fetch("/api/box")
        .then((r) => (r.ok ? r.json() : []))
        .then((rows: BoxRow[]) => setBoxes(rows))
        .catch(() => {});
    };
    tick();
    const iv = setInterval(tick, 5000);
    return () => clearInterval(iv);
  }, [enabled]);

  return { boxes, now };
}
