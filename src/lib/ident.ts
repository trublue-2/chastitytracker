/**
 * Der Identitäts-Farbton — Rosa oder Grün — als Umschalter am Gerät.
 *
 * Die Entscheidung steht noch aus, und sie lässt sich nicht an einer Beschreibung treffen: die
 * App war grün, der Entwurf schlägt Rosa vor, und beides sieht man erst am eigenen Bildschirm mit
 * den eigenen Daten. Deshalb liegen BEIDE Fassungen im Blatt (`docs/design/tokens.mjs --write`
 * erzeugt sie), und dieses Modul entscheidet zur Laufzeit, welche gilt.
 *
 * Getrennt von `theme.ts`, obwohl es dasselbe Muster hat: `theme.ts` beschreibt eine dauerhafte
 * Einstellung, dies hier eine Frage, die einmal beantwortet und dann samt Umschalter entfernt
 * wird. Was wieder verschwindet, soll man in einer Datei finden.
 */

export type Ident = "rosa" | "gruen";

export const IDENT_STORAGE_KEY = "design-ident";
export const IDENT_ATTRIBUTE = "data-ident";
export const IDENT_DEFAULT: Ident = "rosa";

function isIdent(value: unknown): value is Ident {
  return value === "rosa" || value === "gruen";
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
