"use client";

import { useEffect } from "react";
import { rememberWorld } from "@/lib/nativeWorld";
import type { World } from "@/lib/theme";

/**
 * Trägt die Welt des Bereichs an `<html>` nach.
 *
 * Der Bereichs-Wrapper bekommt sie serverseitig — aber nicht alles rendert darin: Toasts und die
 * Vollbild-Ansicht hängen per Portal an `document.body` und erben von `:root`. `:root` IST die
 * Welt `sub-open`; ohne diese Zeile trüge eine Meldung im Keyholder-Bereich rosa Akzente.
 *
 * Ein Effekt genügt, obwohl der Wrapper es serverseitig kann: alle drei Welten sind DUNKEL, der
 * Vorabwert liegt also höchstens im Akzent daneben und nie in der Helligkeit. Das war der Grund,
 * warum hier früher ein Inline-Skript vor der Hydration stand — es musste einen Wechsel zwischen
 * Hell und Dunkel verhindern, und den gibt es nicht mehr.
 *
 * Derselbe Effekt versorgt den zweiten Abnehmer, der den Wrapper nicht lesen kann: den nativen
 * Sperrbildschirm der iOS-Hülle. Warum er einen hinterlegten Wert braucht und was der nicht kann,
 * steht in `nativeWorld.ts` — hier nicht ein zweites Mal, sonst müssten beide Fassungen stimmen.
 *
 * Aufgeräumt wird NICHT: `<html>` behält die zuletzt gesetzte Welt, bis der nächste Bereich sie
 * überschreibt. Ein Zurücksetzen beim Verlassen fiele in die Lücke zwischen zwei Seiten und liesse
 * dort kurz `:root` gelten.
 */
export default function ThemeRootSync({ world }: { world: World }) {
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", world);
    rememberWorld(world);
  }, [world]);

  return null;
}
