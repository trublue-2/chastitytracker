"use client";

import { useEffect, useState } from "react";

/**
 * Wird dieser Text von seinem `line-clamp` tatsächlich abgeschnitten?
 *
 * Die Frage lässt sich nicht raten: sie hängt an Schriftgrösse, Spaltenbreite und Sprache. Gemessen
 * wird deshalb am gerenderten Element — `scrollHeight > clientHeight` heisst „es steht mehr da, als
 * zu sehen ist".
 *
 * Wozu: Eine Zeile aufklappbar zu machen, die nichts Weiteres zu zeigen hat, ist ein Versprechen,
 * das der Klick bricht — sie wird nur höher. Wer den Aufklapp-Knopf anbietet, soll vorher wissen,
 * ob es etwas aufzuklappen gibt.
 *
 * Neu gemessen wird bei jeder Grössenänderung des Elements (Fenster gedreht, Schrift geändert).
 * `measure: false` hält die Messung an und behält den letzten Wert.
 */
export default function useIsClamped(measure = true): [(el: HTMLElement | null) => void, boolean] {
  const [clamped, setClamped] = useState(false);
  const [node, setNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    // `measure: false` heisst „jetzt nicht messen" — der letzte Wert bleibt stehen. Für den
    // aufgeklappten Zustand: dort ist der Text nicht mehr beschnitten, eine Messung ergäbe „passt"
    // und nähme der Zeile ihren Aufklapp-Knopf, während man sie liest.
    if (!node || !measure) return;
    const check = () => setClamped(node.scrollHeight > node.clientHeight + 1);
    check();
    // `ResizeObserver` statt eines Fenster-Listeners: die Spalte kann sich auch ohne Fenster-Resize
    // ändern (Sidebar, aufklappende Nachbarzeile).
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(check);
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, measure]);

  // `setNode` direkt als Callback-Ref: der Setter ist stabil und hat genau diese Signatur — eine
  // `useCallback`-Hülle drumherum wäre eine Hülle um nichts.
  return [setNode, clamped];
}
