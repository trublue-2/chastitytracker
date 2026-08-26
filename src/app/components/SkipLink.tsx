"use client";

import { type MouseEvent } from "react";
import { useTranslations } from "next-intl";

/** Die id, die der Sprunglink anspringt. Steht als Konstante hier, damit Link und Ziel nicht
 *  getrennt voneinander umbenannt werden können. */
const MAIN_LANDMARK_ID = "main-content";

/**
 * „Zum Inhalt springen" — der erste fokussierbare Punkt jeder Seite.
 *
 * Ohne ihn führte der Tab-Weg auf dem Desktop vor JEDEM Seiteninhalt erneut durch die Kopfzeile
 * und die sechs Einträge der Seitenleiste; wer die Tastatur benutzt, zahlt diese Strecke auf jeder
 * einzelnen Seite noch einmal.
 *
 * Er hängt an der Kopfzeile und nicht an den Seiten, weil er sonst so oft fehlt, wie es Seiten
 * gibt. Aus demselben Grund holt sich das Ziel seine id hier statt an über zwei Dutzend
 * `<main>`-Elementen: eine vergessene id wäre ein Sprunglink, der ins Leere zeigt — und das fällt
 * beim Bauen niemandem auf, weil man ihn nicht sieht.
 *
 * Das Ziel wird beim KLICK gesucht, nicht beim Rendern. Ein Effekt, der die Landmarke nach dem
 * Einhängen anschreibt, trifft sie nicht verlässlich: Seiten mit `loading.tsx` zeigen zuerst ihr
 * Skelett, und wenn der echte Inhalt nachrückt, hat sich der Pfad nicht geändert — der Effekt liefe
 * kein zweites Mal und der Link zeigte auf eine id, die es nur im Skelett gab. Zum Zeitpunkt des
 * Klicks steht die Landmarke dagegen immer.
 */
export default function SkipLink() {
  const t = useTranslations("nav");

  function jumpToMain(e: MouseEvent<HTMLAnchorElement>) {
    const main = document.querySelector("main");
    if (!main) return;
    e.preventDefault();
    main.id = MAIN_LANDMARK_ID;
    // `tabindex="-1"`, weil ein `<main>` von sich aus nicht fokussierbar ist. Ohne diesen Wert
    // scrollt der Browser zwar zum Anker, lässt den Fokus aber am Sprunglink stehen — die nächste
    // Tab-Taste führte dann zurück in die Navigation, die man gerade übersprungen hat.
    main.tabIndex = -1;
    main.focus();
    main.scrollIntoView({ block: "start" });
  }

  return (
    <a
      href={`#${MAIN_LANDMARK_ID}`}
      onClick={jumpToMain}
      // `sr-only`, bis er den Fokus hat — dann sichtbar. Ein Sprunglink, den man nur hört, hilft
      // genau der Gruppe nicht, die ihn am dringendsten braucht: Tastatur-Nutzer ohne Screenreader.
      //
      // Die erste Fassung schob ihn stattdessen mit `-translate-y-full` aus der Kopfzeile heraus.
      // Das rechnet aber nur mit seiner EIGENEN Höhe (rund 38 px), während `headerBarCls` ein
      // `pt-safe` trägt und `viewportFit: "cover"` gesetzt ist: auf einem Gerät mit Notch beginnt
      // die Kopfzeile erst unterhalb von `env(safe-area-inset-top)` (47–59 px), und der Link stand
      // dauerhaft sichtbar über der Statusleiste. `sr-only` nimmt ihn aus dem Fluss, statt auf eine
      // Höhe zu wetten.
      //
      // `focus:`, nicht `focus-visible:`: erreichbar ist er ohnehin nur mit der Tastatur.
      // Den Fokusring stellt die globale `:focus-visible`-Regel.
      className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-40 focus:rounded-xl focus:border focus:border-border focus:bg-surface-raised focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground"
    >
      {t("skipToContent")}
    </a>
  );
}
