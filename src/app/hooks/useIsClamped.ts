"use client";

import { useCallback, useEffect, useState } from "react";

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
 * Neu gemessen wird bei jeder Grössenänderung des Elements (Fenster gedreht, Schrift geändert) und
 * wenn der Aufrufer über `deps` eine inhaltliche Änderung meldet.
 */
export default function useIsClamped(deps: unknown[] = []): [(el: HTMLElement | null) => void, boolean] {
  const [clamped, setClamped] = useState(false);
  const [node, setNode] = useState<HTMLElement | null>(null);

  const ref = useCallback((el: HTMLElement | null) => setNode(el), []);

  useEffect(() => {
    if (!node) return;
    const measure = () => setClamped(node.scrollHeight > node.clientHeight + 1);
    measure();
    // `ResizeObserver` statt eines Fenster-Listeners: die Spalte kann sich auch ohne Fenster-Resize
    // ändern (Sidebar, aufklappende Nachbarzeile).
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node, ...deps]);

  return [ref, clamped];
}
