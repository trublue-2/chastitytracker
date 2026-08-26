import { createLucideIcon } from "lucide-react";

/**
 * Das GEÖFFNETE Schloss — eine eigene Zeichnung statt `LockOpen` aus lucide.
 *
 * Lucide unterscheidet die beiden Zustände an einer einzigen Stelle:
 *
 *   Lock      `M7 11V7a5 5 0 0 1 10 0v4`   — voller Bügel, beide Schenkel am Korpus
 *   LockOpen  `M7 11V7a5 5 0 0 1 9.9-1`    — derselbe Bügel, rechter Schenkel fehlt
 *
 * Der Unterschied ist ein fehlender Stummel von 5 px im 24er-Raster. Bei den Grössen, in denen das
 * Zeichen in dieser App wirklich vorkommt — 11 bis 18 px —, ist das ein halbes Bildschirm-Pixel:
 * beide sahen aus wie ein zugesperrtes Schloss. Gemeldet wurde genau das.
 *
 * Diese Fassung verschiebt den Bügel, statt ihm ein Stück wegzunehmen: er sitzt höher und
 * versetzt, sodass sich die UMRISSLINIE unterscheidet und nicht nur ein Detail darin. Der Korpus
 * bleibt Zeichen für Zeichen der von lucide — die beiden Zustände müssen als derselbe Gegenstand
 * lesbar bleiben, sonst wird aus dem Unterschied ein anderes Ding.
 *
 * Die Werte sind am Bildschirm verglichen worden, nicht gerechnet: sechs Kandidaten in 14, 16, 18,
 * 24 und 44 px nebeneinander gegen das geschlossene Schloss. Alle Varianten, die den Bügel an
 * seinem Platz liessen und nur öffneten, waren bei 14 px vom geschlossenen nicht zu unterscheiden.
 *
 * Gebaut über `createLucideIcon` und nicht als eigenes `<svg>`: so ist es ein echtes `LucideIcon`
 * mit derselben Schnittstelle (`size`, `strokeWidth`, `absoluteStrokeWidth`, Ref-Weitergabe) und
 * passt in die Tabellen, die einen solchen Typ verlangen — `actionSign.tsx` und `NewEntrySheet`
 * halten Icons als Werte. Eine eigene Funktion wäre dort ein Typfehler gewesen.
 */
const LockOpenIcon = createLucideIcon("lock-open-offset", [
  // Der Korpus ist Zeichen für Zeichen der von lucide — nur der Bügel ist neu.
  ["rect", { width: "18", height: "11", x: "3", y: "11", rx: "2", ry: "2", key: "body" }],
  ["path", { d: "M9 11V6a4 4 0 1 1 8 0", key: "shackle" }],
]);

export default LockOpenIcon;
