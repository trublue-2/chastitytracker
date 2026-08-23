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
import {
  parsePrismaSchema, checkRegistry, renderStellschrauben, renderAbhaengigkeiten, renderFunktionen,
} from "./funktionsmodellDoc";
import { FM_CAPABILITIES, FM_EXCLUDED_ROUTES, FM_MCP_EXEMPT } from "./funktionsmodellCapabilities";
import { readApiRoutes, readMcpTools } from "./funktionsmodellSurfaces";
import { FM_REGISTRY, FM_SCANNED_MODELS } from "./funktionsmodellRegistry";
import { SELF_EDITABLE_USER_FIELDS } from "./constants";

const root = path.resolve(__dirname, "../..");
const schema = parsePrismaSchema(fs.readFileSync(path.join(root, "prisma/schema.prisma"), "utf8"));
const DOC = path.join(root, "docs/funktionsmodell/stellschrauben.md");
const DEPS = path.join(root, "docs/funktionsmodell/05-abhaengigkeiten.md");
const CAPS = path.join(root, "docs/funktionsmodell/01-funktionen.md");
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

describe("Funktionskatalog", () => {
  const routes = readApiRoutes(root).map((r) => r.route);
  const tools = readMcpTools(root);
  const claimedRoutes = new Set(FM_CAPABILITIES.flatMap((c) => c.routes ?? []));
  const claimedTools = new Set(FM_CAPABILITIES.flatMap((c) => c.tools ?? []));

  it("findet die Oberfläche überhaupt", () => {
    // Ohne diese Prüfung liefe alles Folgende ins Leere: ein umbenanntes Verzeichnis oder eine
    // geänderte Registrierungs-Schreibweise ergäbe eine leere Liste, und eine leere Liste ist
    // vollständig abgedeckt. Der Test wäre grün und hätte nichts geprüft.
    expect(routes.length).toBeGreaterThan(50);
    expect(tools.length).toBeGreaterThan(30);
  });

  it("beansprucht jede API-Route oder nimmt sie ausdrücklich aus", () => {
    const missing = routes.filter((r) => !claimedRoutes.has(r) && !(r in FM_EXCLUDED_ROUTES));
    expect(missing).toEqual([]);
  });

  it("beansprucht jedes MCP-Werkzeug", () => {
    expect(tools.filter((t) => !claimedTools.has(t))).toEqual([]);
  });

  it("verweist auf nichts, das es nicht gibt", () => {
    // Die Gegenrichtung: eine gelöschte Route oder ein umbenanntes Werkzeug lässt sonst einen
    // Eintrag stehen, der sich wie eine gültige Aussage über das System liest.
    expect([...claimedRoutes].filter((r) => !routes.includes(r))).toEqual([]);
    expect([...claimedTools].filter((t) => !tools.includes(t))).toEqual([]);
    expect(Object.keys(FM_EXCLUDED_ROUTES).filter((r) => !routes.includes(r))).toEqual([]);
  });

  it("vergibt jede Kennung nur einmal", () => {
    const ids = FM_CAPABILITIES.map((c) => c.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it("hält die eingecheckte Datei auf Stand", () => {
    const actual = fs.existsSync(CAPS) ? fs.readFileSync(CAPS, "utf8") : "";
    expect(actual, "docs/funktionsmodell/01-funktionen.md ist veraltet — `npm run funktionsmodell`")
      .toBe(renderFunktionen());
  });
});

/** Die Regel „MCP-Vollständigkeit" als Prüfung. Warum es sie braucht und was die beiden Sorten
 *  Ausnahme bedeuten, steht bei {@link FM_MCP_EXEMPT}. */
describe("MCP-Vollständigkeit", () => {
  const gaps = FM_CAPABILITIES.filter((c) => c.surfaces.includes("admin-ui") && !c.surfaces.includes("mcp"));

  it("jede Keyholder-Fähigkeit ist über den MCP erreichbar — oder ausdrücklich ausgenommen", () => {
    const unexplained = gaps.filter((c) => !FM_MCP_EXEMPT[c.id]).map((c) => `${c.id} (${c.title})`);
    expect(unexplained, "\nKeyholder-Fähigkeit ohne MCP-Weg:\n" + unexplained.join("\n") +
      "\n\nEntweder ein MCP-Werkzeug ergänzen (Regel: ein Werkzeug je Einstellungs-FAMILIE, Vorbild " +
      "set_cleaning) oder in FM_MCP_EXEMPT eintragen — mit einem Satz, warum die Fähigkeit nicht in " +
      "die Hand einer KI gehört.\n").toEqual([]);
  });

  it("jede Ausnahme deckt noch eine echte Lücke", () => {
    // Die Gegenrichtung, wie bei den Format-Ausnahmen: wer eine Lücke schliesst und den Eintrag
    // stehen lässt, deckt damit klaglos die nächste, die zufällig dieselbe Kennung trägt.
    const ids = new Set(gaps.map((c) => c.id));
    const stale = Object.keys(FM_MCP_EXEMPT).filter((id) => !ids.has(id));
    expect(stale, "\nVeraltete MCP-Ausnahme(n) — die Fähigkeit hat den MCP-Weg inzwischen (oder es gibt " +
      "sie nicht mehr):\n" + stale.join("\n") + "\n").toEqual([]);
  });

  it("nennt zu jeder Ausnahme einen Grund, der Absicht von Rückstand unterscheidet", () => {
    // „Absicht" und „OFFEN" sind keine Kosmetik: die eine Sorte bleibt für immer, die andere ist
    // eine Aufgabenliste. Ein Eintrag ohne diese Angabe verwischt genau das.
    const unclassified = Object.entries(FM_MCP_EXEMPT)
      .filter(([, grund]) => !/^(Absicht|OFFEN):/.test(grund))
      .map(([id]) => id);
    expect(unclassified, "\nAusnahme ohne Einordnung — beginne den Grund mit „Absicht:" +
      "\" (bleibt so) oder \"OFFEN:\" (Lücke, noch zu schliessen):\n" + unclassified.join("\n") + "\n")
      .toEqual([]);
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
