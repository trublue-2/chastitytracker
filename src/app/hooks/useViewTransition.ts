"use client";

import { useCallback } from "react";
import useGuardedNavigation from "@/app/hooks/useGuardedNavigation";

/**
 * useViewTransition — Seitenwechsel mit Übergangs-Animation, wo der Browser sie kann.
 *
 * **Und mit derselben Wache wie das (+)-Blatt.** Beides läuft über `useGuardedNavigation`, weil
 * beides dasselbe Problem hat: `router.push` auf eine Server-Route holt eine RSC-Nutzlast, und bei
 * schlechtem Empfang hängt die ohne Zeitlimit und ohne Rückmeldung. Bleibt sie stecken, meldet die
 * Wache das an `connectionHealth`, und die vorhandene Zustandszeile über dem Dashboard sagt
 * „Verbindung stockt" — hier gibt es deshalb NICHTS anzuzeigen und keinen Toast.
 *
 * ⚠ **Gedeckt ist damit, was durch `ViewTransitionLink` geht — und das sind heute nur die beiden
 * Hauptnavigationen** (`BottomNav`, `DesktopSidebar`). Alle Sprünge über rohes `next/link` bleiben
 * ungewacht, darunter feldrelevante: „Jetzt erfassen" am Kontroll-Banner, „Jetzt verschliessen" im
 * offenen Zustands-Helden, die Wear- und Kategorie-Zeilen, die Aufgabenkarte. Sie hängen bei
 * schlechtem Empfang weiterhin stumm. Der saubere Schnitt wäre EIN Link-Bauteil für die ganze App
 * plus eine Lint-Regel gegen rohes `next/link`; solange es den nicht gibt, ist „gewacht" ein
 * Zufall der Animation, nicht die Regel.
 *
 * Der Übergang selbst bleibt reine Zutat: wo `startViewTransition` fehlt (alles vor Safari 18),
 * wird schlicht ohne gesprungen.
 */
export default function useViewTransition() {
  const { go } = useGuardedNavigation();

  const navigateWithTransition = useCallback(
    (href: string) => {
      // Kein Cast: `startViewTransition` steht seit TypeScript 5.9 in `lib.dom.d.ts`. Die
      // Laufzeit-Prüfung bleibt trotzdem nötig — Safari kann es erst ab 18.
      if (typeof document.startViewTransition === "function") document.startViewTransition(() => go(href));
      else go(href);
    },
    [go],
  );

  return { navigateWithTransition };
}
