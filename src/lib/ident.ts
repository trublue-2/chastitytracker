/**
 * Die Farbwelt als Umschalter am Gerät.
 *
 * Die Entscheidung steht noch aus, und sie lässt sich nicht an einer Beschreibung treffen: die
 * App war grün, der Entwurf schlägt Rosa vor, und eine dritte Fassung gibt jeder Rolle ihre eigene
 * Farbe. Das sieht man erst am eigenen Bildschirm mit den eigenen Daten. Deshalb liegen ALLE
 * Fassungen im Blatt (`docs/design/tokens.mjs --write` erzeugt sie), und dieses Modul entscheidet
 * zur Laufzeit, welche gilt.
 *
 * Getrennt von `theme.ts`, obwohl es dasselbe Muster hat: `theme.ts` beschreibt eine dauerhafte
 * Einstellung, dies hier eine Frage, die einmal beantwortet und dann samt Umschalter entfernt
 * wird. Was wieder verschwindet, soll man in einer Datei finden.
 */

/**
 * `rosa` und `gruen` sind zwei Fassungen derselben Idee: EIN Identitäts-Ton für die ganze App,
 * der Keyholder-Bereich als Gegenpol in Indigo.
 *
 * `geteilt` ist die andere Idee — die ROLLE selbst wird die Farbe: Grün beim Träger, Rot bei der
 * Keyholderin. „Verschlossen" bleibt dabei in beiden Bereichen grün; es ist dieselbe Tatsache,
 * egal wer hinsieht.
 */
export type Ident = "rosa" | "gruen" | "geteilt";

/**
 * Die Welten samt Beschriftung — EINE Quelle für den Umschalter und für die Prüfung.
 *
 * Sie muss zur `WELTEN`-Tabelle in `docs/design/tokens.mjs` passen; erzwingen lässt sich das von
 * hier aus nicht (die eine Seite ist ein Build-Skript, die andere App-Code). Dafür hält
 * `ident.test.ts` beide gegen die `[data-ident="…"]`-Selektoren, die tatsächlich im Blatt stehen —
 * eine Welt ohne Regeln wäre sonst ein Knopf, der nichts tut.
 */
export const IDENT_LABELS: Record<Ident, string> = {
  rosa: "Rosa",
  gruen: "Grün",
  geteilt: "Geteilt",
};

export const IDENTS = Object.keys(IDENT_LABELS) as Ident[];

export const IDENT_STORAGE_KEY = "design-ident";
export const IDENT_ATTRIBUTE = "data-ident";
export const IDENT_DEFAULT: Ident = "rosa";

function isIdent(value: unknown): value is Ident {
  return IDENTS.includes(value as Ident);
}

export function readStoredIdent(): Ident {
  if (typeof window === "undefined") return IDENT_DEFAULT;
  const raw = localStorage.getItem(IDENT_STORAGE_KEY);
  return isIdent(raw) ? raw : IDENT_DEFAULT;
}

/**
 * Schreibt den Ton an `<html>` — und NUR dorthin.
 *
 * `data-theme` hängt an zwei Stellen (Wurzel und Bereichs-Wrapper), weil beide je eigene Teile des
 * Baums versorgen. Der Ton braucht das nicht: die erzeugten Regeln adressieren den Wrapper als
 * Nachfahren der Wurzel mit. Zwei Träger für dieselbe Tatsache wären zwei Stellen, die auseinander
 * laufen können.
 */
function applyIdent(ident: Ident = readStoredIdent()): void {
  if (ident === IDENT_DEFAULT) document.documentElement.removeAttribute(IDENT_ATTRIBUTE);
  else document.documentElement.setAttribute(IDENT_ATTRIBUTE, ident);
}

export function setStoredIdent(ident: Ident): void {
  localStorage.setItem(IDENT_STORAGE_KEY, ident);
  applyIdent(ident);
}
