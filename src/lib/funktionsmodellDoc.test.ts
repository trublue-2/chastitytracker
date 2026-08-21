/**
 * Das Gate des Funktionsmodells. Es prüft drei Dinge, und jedes davon ist eine Art, wie eine
 * Funktionsdokumentation still falsch wird:
 *
 * 1. **Lücke** — ein neues Schema-Feld, an das beim Dokumentieren niemand gedacht hat. Genau diese
 *    Felder fallen später als unerklärliches Verhalten auf.
 * 2. **Leiche** — ein Registry-Eintrag zu einem Feld, das umbenannt oder entfernt wurde. Er liest
 *    sich wie eine gültige Aussage über das System und ist keine.
 * 3. **Drift** — die eingecheckte Markdown-Datei passt nicht mehr zu Schema + Registry, weil jemand
 *    `npm run funktionsmodell` vergessen hat.
 *
 * Ohne (3) wäre das Register ein Dokument, das man pflegen MUSS; mit (3) ist es eines, das man
 * pflegen KANN, ohne es zu können — der Test sagt, wann.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parsePrismaSchema, checkRegistry, renderStellschrauben, renderAbhaengigkeiten } from "./funktionsmodellDoc";
import { FM_REGISTRY, FM_SCANNED_MODELS } from "./funktionsmodellRegistry";
import { SELF_EDITABLE_USER_FIELDS } from "./constants";

const root = path.resolve(__dirname, "../..");
const schema = parsePrismaSchema(fs.readFileSync(path.join(root, "prisma/schema.prisma"), "utf8"));
const DOC = path.join(root, "docs/funktionsmodell/stellschrauben.md");
const DEPS = path.join(root, "docs/funktionsmodell/05-abhaengigkeiten.md");
const problems = checkRegistry(schema);

describe("Funktionsmodell-Register", () => {
  it("kennt jedes Feld der geprüften Modelle", () => {
    // Die Fehlermeldung nennt die Felder beim Namen: wer sie sieht, weiss ohne Nachschlagen, welche
    // Zeilen in `funktionsmodellRegistry.ts` fehlen.
    expect(problems.undocumented).toEqual([]);
  });

  it("beschreibt keine Felder, die es nicht gibt", () => {
    expect(problems.orphaned).toEqual([]);
  });

  it("beschreibt jedes Feld genau einmal", () => {
    expect(problems.duplicated).toEqual([]);
  });

  it("ordnet jede Stellschraube einer bekannten Domäne zu", () => {
    expect(problems.unknownDomain).toEqual([]);
  });

  it("hat die geprüften Modelle wirklich im Schema", () => {
    // Ein umbenanntes Modell würde die Vollständigkeitsprüfung sonst lautlos leerlaufen lassen:
    // `schema.get("User") ?? []` findet nichts und beanstandet folgerichtig nichts.
    for (const model of FM_SCANNED_MODELS) expect(schema.has(model), model).toBe(true);
  });

  it("liest die eingecheckte Datei als das, was der Generator schreiben würde", () => {
    const expected = renderStellschrauben(schema);
    const actual = fs.existsSync(DOC) ? fs.readFileSync(DOC, "utf8") : "";
    expect(actual, "docs/funktionsmodell/stellschrauben.md ist veraltet — `npm run funktionsmodell`")
      .toBe(expected);
  });

  it("hält auch die Abhängigkeits-Ansicht auf Stand", () => {
    // Sie ist vollständig abgeleitet — veraltet also genau dann, wenn jemand `affects` oder eine
    // feste Kante ändert und nicht neu erzeugt. Ohne diese Prüfung wäre die Karte die erste Datei,
    // die still falsch wird: dass eine Kante FEHLT, sieht man ihr nicht an.
    const actual = fs.existsSync(DEPS) ? fs.readFileSync(DEPS, "utf8") : "";
    expect(actual, "docs/funktionsmodell/05-abhaengigkeiten.md ist veraltet — `npm run funktionsmodell`")
      .toBe(renderAbhaengigkeiten());
  });
});

describe("Abhängigkeits-Ansicht", () => {
  const deps = renderAbhaengigkeiten();

  it("gibt keinen Mermaid-Knoten zwei verschiedenen Mechaniken", () => {
    // Die Knoten-Kennung entsteht, indem alles ausser Buchstaben wegfällt („Sessions/Statistik" →
    // „nSessionsStatistik"). Zwei Mechaniken, die sich nur in Sonderzeichen unterscheiden, bekämen
    // dieselbe Kennung — und das Diagramm zöge sie lautlos zu EINEM Knoten zusammen. Ein falscher
    // Graph sieht dabei aus wie ein richtiger, deshalb wird die Eindeutigkeit hier geprüft und nicht
    // beim Lesen bemerkt.
    const labelOf = new Map<string, string>();
    for (const [, id, label] of deps.matchAll(/(?:^ {2}|-> )(n[A-Za-z]+)\["([^"]+)"\]/gm)) {
      const seen = labelOf.get(id);
      expect(seen ?? label, `Knoten ${id}`).toBe(label);
      labelOf.set(id, label);
    }
    expect(labelOf.size).toBeGreaterThan(0);
  });

  it("trennt Kanten mit Schalter von fest verdrahteten", () => {
    // Die Unterscheidung ist der Kern dieser Seite: wer eine feste Regel für eine Einstellung hält,
    // sucht nach einem Schalter, den es nicht gibt.
    expect(deps).toContain("*feste Regel*");
    expect(deps).toMatch(/\| `\w+\.\w+` \|/);
  });
});

describe("Registry-Inhalt", () => {
  it("gibt jeder Stellschraube mindestens einen Schreibweg und eine Wirkung", () => {
    // Eine Stellschraube, die niemand schreiben darf, ist keine; eine ohne Wirkungsziel beantwortet
    // die Frage nicht, für die das Register gebaut ist („was steuert was").
    for (const e of FM_REGISTRY) {
      if (e.kind !== "setting") continue;
      expect(e.writers.length, `${e.model}.${e.field}`).toBeGreaterThan(0);
      expect(e.affects.length, `${e.model}.${e.field}`).toBeGreaterThan(0);
      expect(e.effect.trim().length, `${e.model}.${e.field}`).toBeGreaterThan(0);
    }
  });

  /**
   * Die Spalte „Schreibt" ist die einzige Angabe im Register, die der Code an anderer Stelle bereits
   * kennt — und deshalb die einzige, die man nachschlagen statt behaupten kann.
   * `SELF_EDITABLE_USER_FIELDS` ist die Whitelist, gegen die `userSelfFieldRoute` compiliert: was
   * dort steht, darf der Sub selbst schreiben, alles andere nicht. Ohne diese Verklammerung würde
   * eine Erweiterung der Whitelist das Register still falsch machen — und zwar ausgerechnet bei der
   * Frage, die sicherheitsrelevant ist („darf der Sub das umlegen?").
   */
  it("nennt beim Sub genau die Felder als seine, die er selbst schreiben darf", () => {
    const claimsSub = FM_REGISTRY
      .filter((e) => e.model === "User" && e.kind === "setting" && e.writers.includes("sub"))
      .map((e) => e.field)
      .sort();
    expect(claimsSub).toEqual([...SELF_EDITABLE_USER_FIELDS].sort());
  });

  it("nennt zu jedem Nicht-Schalter einen Grund", () => {
    for (const e of FM_REGISTRY) {
      if (e.kind === "setting") continue;
      expect(e.note.trim().length, `${e.model}.${e.field}`).toBeGreaterThan(0);
    }
  });
});
