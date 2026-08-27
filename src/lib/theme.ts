/**
 * Welche Farbwelt gilt — abgeleitet, nicht gewählt.
 *
 * Bis v6 war das eine EINSTELLUNG: hell/dunkel/System je Rolle in `localStorage`, dazu ein
 * Umschalter für den Identitäts-Ton, und ein Inline-Skript, das beides vor der Hydration ans
 * Dokument schrieb. Der Umschalter war eine Frage („welche Fassung nehmen wir?"), keine Funktion —
 * beantwortet ist sie mit: gar keine Wahl. Die Welt sagt jetzt den ZUSTAND.
 *
 *   sub-open    Träger, nicht verschlossen — die Rose
 *   sub-locked  Träger, verschlossen — Grün
 *   keyholder   Keyholder-Bereich — immer Indigo
 *
 * Alle drei sind dunkel. Damit fällt auch der Grund weg, aus dem die Auflösung im Client sass: sie
 * musste `prefers-color-scheme` lesen. Jetzt hängt sie an Daten, die der Server ohnehin hat, und
 * wird beim Rendern gesetzt — kein Aufblitzen der falschen Welt, kein `localStorage`, das zwischen
 * Handy und Rechner auseinanderläuft (der Fehler, der als #88 gemeldet war).
 *
 * **Die Welt wechselt mitten in der Sitzung.** Schliesst der Träger auf, wird die App rosa;
 * schliesst er zu, grün. Eine Reinigungspause öffnet den Verschluss und zählt deshalb als
 * „offen" — das ist eine bewusste Entscheidung gegen die Alternative, laufende Sitzungen
 * durchgehend grün zu lassen: die Farbe soll sagen, was JETZT ist.
 *
 * Ein **Gesundheits-Halt** gehört ausdrücklich NICHT dazu: er setzt Pflichten aus, erzeugt aber
 * keinen Öffnungs-Eintrag und berührt `getIsLocked()` nicht. Die App bleibt dabei grün, und das
 * ist richtig — der Träger ist ja verschlossen.
 */

export type World = "sub-open" | "sub-locked" | "keyholder";

/** Alle Welten — für alles, was über sie iteriert (Bauteil-Schau, Blatt-Prüfung). */
export const WORLDS: readonly World[] = ["sub-open", "sub-locked", "keyholder"];

/**
 * Die Welt für Bildschirme OHNE Zustand: Anmeldung, Passwort-Reset, Info. Dieselbe, die `:root` im
 * Blatt trägt — hier benannt, damit die Anmeldeseite nicht dasselbe Literal ein viertes Mal führt
 * und man am Aufruf sieht, WARUM sie ausgerechnet diese Welt bekommt.
 */
export const DEFAULT_WORLD: World = "sub-open";

/** Die Welt des Träger-Bereichs. Einziges Argument ist der Verschluss-Zustand — `getIsLocked()`. */
export function subWorld(isLocked: boolean): World {
  return isLocked ? "sub-locked" : "sub-open";
}

/**
 * Die Welt des Keyholder-Bereichs. Eine Funktion ohne Argumente, kein Literal an den Aufrufstellen:
 * sie ist der Ort, an dem eine spätere Verzweigung stünde, und sie liest sich am Aufruf wie ihre
 * Schwester darüber.
 */
export function keyholderWorld(): World {
  return "keyholder";
}

/**
 * Erkennungsmerkmal eines Theme-Wrappers, rollenunabhängig — für Code, der den NÄCHSTGELEGENEN
 * Wrapper sucht statt den einer bestimmten Rolle (`ActionModal` portiert dorthin).
 *
 * WEIL dorthin portiert wird, muss ein Wrapper ein schlichtes Div BLEIBEN — er UND jeder seiner
 * Vorfahren. Sobald einer transform-artig wirkt (`transform`, `translate`, `rotate`, `scale`,
 * `perspective`, `filter`, `backdrop-filter`) oder Layout-/Paint-Containment auslöst (`contain`
 * mit `layout`/`paint`/`content`/`strict`, `container-type`, `content-visibility`), wird er
 * Containing-Block für `position: fixed` und fesselt jedes Modal darin an sich statt ans Fenster.
 * `will-change` zählt mit, wenn es eine dieser Eigenschaften nennt. Der unauffällige Weg dahin ist
 * Tailwind: `@container` IST `container-type: inline-size`, und die Utility ist bereits im Einsatz.
 *
 * `theme.test.ts` prüft das für alle Wrapper-Tags und die `[data-theme]`-Blöcke in `globals.css` —
 * geprüft statt nur behauptet, wie bei `expectImportFree`. Nicht sehen kann der Test Vorfahren und
 * CSS, das einen Wrapper über einen anderen Selektor trifft (Klasse, `#admin-root`).
 */
export const THEME_WRAPPER_SELECTOR = "[data-theme]";
