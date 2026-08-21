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
import { parsePrismaSchema, checkRegistry, renderStellschrauben } from "./funktionsmodellDoc";
import { FM_REGISTRY, FM_SCANNED_MODELS } from "./funktionsmodellRegistry";
import { SELF_EDITABLE_USER_FIELDS } from "./constants";

const root = path.resolve(__dirname, "../..");
const schema = parsePrismaSchema(fs.readFileSync(path.join(root, "prisma/schema.prisma"), "utf8"));
const DOC = path.join(root, "docs/funktionsmodell/stellschrauben.md");
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
