import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { IDENTS, IDENT_DEFAULT, IDENT_LABELS } from "@/lib/ident";

/**
 * Die Farbwelten stehen an zwei Orten: als Tabelle im Generator (`docs/design/tokens.mjs`, der die
 * `[data-ident="…"]`-Regeln erzeugt) und als Liste im App-Code (`ident.ts`, aus der der Umschalter
 * seine Knöpfe baut). Ein Build-Skript kann von einer React-Komponente nicht importiert werden,
 * also lässt sich das nicht an einer Stelle zusammenführen — aber es lässt sich PRÜFEN.
 *
 * Ohne diese Prüfung ist der Fehlerfall stumm: ein Knopf, der ein Attribut setzt, zu dem es keine
 * Regel gibt, sieht genauso aus wie einer, der die Vorgabe wiederherstellt.
 */
describe("Farbwelten", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  const imBlatt = new Set([...css.matchAll(/\[data-ident="([a-z-]+)"\]/g)].map((m) => m[1]));

  it("jede wählbare Welt ausser der Vorgabe hat Regeln im Blatt", () => {
    for (const ident of IDENTS) {
      if (ident === IDENT_DEFAULT) continue;
      expect(imBlatt, `${ident} fehlt in globals.css`).toContain(ident);
    }
  });

  it("das Blatt trägt keine Welt, die der Umschalter nicht anbietet", () => {
    for (const welt of imBlatt) expect(IDENTS).toContain(welt);
  });

  it("die Vorgabe steht in den Theme-Blöcken selbst, nicht als Abweichung", () => {
    expect(imBlatt).not.toContain(IDENT_DEFAULT);
  });

  it("jede Welt hat eine Beschriftung", () => {
    for (const ident of IDENTS) expect(IDENT_LABELS[ident]?.length).toBeGreaterThan(0);
  });
});
