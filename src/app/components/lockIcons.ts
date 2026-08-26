import { createLucideIcon, type IconNode } from "lucide-react";

/**
 * Das Schlosspaar der App — geschlossen und geöffnet, EIGENE Zeichnungen statt lucides `Lock`/`LockOpen`.
 *
 * ## Warum nicht lucide
 *
 * Lucide unterscheidet die beiden Zustände an einer einzigen Stelle:
 *
 *   Lock      `M7 11V7a5 5 0 0 1 10 0v4`   voller Bügel, beide Schenkel am Korpus
 *   LockOpen  `M7 11V7a5 5 0 0 1 9.9-1`    derselbe Bügel, rechter Schenkel fehlt
 *
 * Ein fehlender Stummel von 5 Einheiten. Das Zeichen kommt hier in 11 bis 18 px vor; dort ist das
 * ein halbes Bildschirm-Pixel, und beide sahen aus wie ein zugesperrtes Schloss. (`Unlock` hilft
 * nicht — in lucide nur ein anderer Name für dieselbe Datei.)
 *
 * ## Die Figur: EIN Bügel, zwei Stellungen
 *
 * Der Bügel ist in beiden Zuständen dieselbe Form und um genau seine eigene Breite versetzt —
 * geschlossen sitzt er mittig über dem Korpus, offen ist er herausgeschwenkt, sein rechter Schenkel
 * steckt noch im Korpus und sein freies Ende hängt LINKS DANEBEN. Nicht darüber: ein Ende über dem
 * Korpus lässt zwischen sich und der Oberkante nur wenige Einheiten, und die laufen bei 14 px zu
 * (siehe Regel unten). Neben dem Korpus hat es die volle Höhe.
 *
 * Dafür ist der Korpus schmaler als lucides (x 7 / Breite 14 statt x 3 / Breite 18): links muss
 * Platz für den Schenkel bleiben. Höhe, Scheitel (y = 2) und damit die Gesamtgrösse entsprechen
 * lucide — das Paar steht in Listen neben dessen Zeichen und darf dort nicht kleiner wirken.
 *
 * ## Die Regel dahinter
 *
 * Ein Zwischenraum trägt erst, wenn er breiter ist als der Strich daneben. Bei Strichstärke 2 im
 * 24er-Raster und 14 px Anzeige ist eine Einheit 0,58 px und der Strich 1,17 px — zwei Einheiten
 * Weiss laufen also mit Antialiasing zu, und aus zwei Konturen wird eine dicke. Dieselbe Rechnung
 * steht hinter den Formen in `deviceIcons.ts`.
 *
 * **Die beiden gehören zusammen und werden zusammen geändert.** Sie teilen sich Korpus und
 * Bügelform Zeichen für Zeichen; ändert sich eines, muss das andere mit. `lockIcons.test.ts` hält
 * das fest, damit es nicht bei der nächsten Anpassung auseinanderläuft.
 */

/** Der gemeinsame Korpus. Er IST die Klammer zwischen den beiden Zuständen. */
const korpus = (): IconNode[number] =>
  ["rect", { width: "14", height: "11", x: "7", y: "11", rx: "2", ry: "2", key: "body" }];

/** Der gemeinsame Bügel; `x` ist der linke Schenkel. Geschlossen 9.5 (mittig), offen 3 (daneben). */
const buegel = (x: number): IconNode[number] =>
  ["path", { d: `M${x} 11V6.5a4.5 4.5 0 0 1 9 0v4.5`, key: "shackle" }];

export const LockClosedIcon = createLucideIcon("lock-closed", [korpus(), buegel(9.5)]);
export const LockOpenIcon = createLucideIcon("lock-open", [korpus(), buegel(3)]);
