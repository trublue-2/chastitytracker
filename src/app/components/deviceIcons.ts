import { createLucideIcon } from "lucide-react";

/**
 * Zeichen für Geräte-Kategorien, die lucide nicht führt.
 *
 * Die Kategorie-Auswahl bot bis hierher nur allgemeine Zeichen an — ein Kreis für den Plug, ein
 * Kettenglied für Handschellen, ein Anker für alles, was sonst nirgends passte. Wer seine
 * Kategorien benennt, will sie auch wiedererkennen; in einer Liste aus zehn Kreisen sagt das
 * Zeichen nichts mehr.
 *
 * `Plug` ist dabei ein Sonderfall: lucide FÜHRT einen `Plug`, aber es ist ein Stromstecker. Der
 * Name ist hier neu belegt; wer ihn versehentlich zusätzlich aus lucide importiert, bekommt einen
 * doppelten Eigenschaftsnamen in `ICON_MAP` und damit einen Compiler-Fehler statt eines stillen
 * Tauschs. `RingO` heisst so nach dem Ring der O — `Ring` allein liesse offen, welcher.
 *
 * Alle vier sind auf dasselbe Raster gezeichnet wie lucide (24 × 24, Strichstärke 2, runde Enden)
 * und über `createLucideIcon` gebaut — sie sind damit echte `LucideIcon` und stehen in `ICON_MAP`
 * neben den übrigen, ohne Sonderbehandlung.
 *
 * Die Formen sind am Bildschirm ausgewählt worden, nicht am Papier: je drei Entwürfe in 14, 18, 24
 * und 44 px nebeneinander. Was dabei ausschied, ist so lehrreich wie das, was blieb — ein Ring aus
 * zwei konzentrischen Kreisen liest sich als Zielscheibe, ein liegendes Oval als Auge (und das ist
 * inzwischen der Bildersafe), und Riemen, die zum Ball hin abfallen, sehen aus wie Schnurrhaare.
 */

/** Plug: verjüngter Körper mit Hals und breitem Fuss — der Fuss ist das, was ihn erkennbar macht. */
export const PlugIcon = createLucideIcon("device-plug", [
  ["path", { d: "M12 2.5c-2.9 2.7-4.3 5.1-4.3 7.5 0 2 1 3.4 2.3 4.3v2.7h4v-2.7c1.3-.9 2.3-2.3 2.3-4.3 0-2.4-1.4-4.8-4.3-7.5z", key: "body" }],
  ["path", { d: "M6 19.5h12", key: "base" }],
]);

/** Handschellen: zwei Schellen und die hochstehenden Bügel — ohne die liest sich das Paar als Brille. */
export const HandcuffsIcon = createLucideIcon("device-handcuffs", [
  ["circle", { cx: "6.5", cy: "15.5", r: "4.2", key: "left" }],
  ["circle", { cx: "17.5", cy: "15.5", r: "4.2", key: "right" }],
  ["path", { d: "M10.7 15.5h2.6", key: "chain" }],
  ["path", { d: "M6.5 11.3V9a2.2 2.2 0 0 1 4.4 0", key: "arm-left" }],
  ["path", { d: "M17.5 11.3V9a2.2 2.2 0 0 0-4.4 0", key: "arm-right" }],
]);

/** Ring: das Band steht hochkant und trägt oben einen Stein — sonst wäre es eine Zielscheibe. */
export const RingOIcon = createLucideIcon("device-ring", [
  // Band weiter, Loch enger: dazwischen standen 1,5 Einheiten, also bei 14 px weniger Weiss (0,9 px)
  // als die Strichstärke selbst (1,17 px) — die beiden Konturen verschmolzen zu einem dicken Reifen.
  ["ellipse", { cx: "12", cy: "14", rx: "7", ry: "7.2", key: "band" }],
  ["ellipse", { cx: "12", cy: "14", rx: "2.8", ry: "3", key: "hole" }],
  ["path", { d: "M10 3.4h4l-1 3.4h-2z", key: "stone" }],
]);

/** Knebel: Ball mit geraden Riemen. Gerade, weil geschwungene bei 14 px wie Schnurrhaare wirken. */
export const GagIcon = createLucideIcon("device-gag", [
  ["circle", { cx: "12", cy: "12", r: "5", key: "ball" }],
  // Enden bei 3 und 21: lucide hält sein Inhaltsfeld auf 2–22, und im Auswahl-Raster wirkte das
  // Zeichen sonst grösser als seine Nachbarn.
  ["path", { d: "M3 10h4.1", key: "strap-left" }],
  ["path", { d: "M16.9 10h4.1", key: "strap-right" }],
]);
