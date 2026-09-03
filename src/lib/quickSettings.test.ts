import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { Prisma } from "@prisma/client";
import {
  QUICK_SETTINGS, MAX_QUICK_SETTINGS, QUICK_SETTING_SELECT,
  quickSettingAvailable, quickSettingOnCard, parseQuickSettings, normalizeQuickSettings,
} from "./quickSettings";

/**
 * Die Registratur der Schnellschalter. Sie ist gleichzeitig Auswahlliste, Anzeige-Reihenfolge und
 * Schreib-Whitelist — die Tests pinnen genau die Eigenschaften, an denen das hängt.
 */
describe("Registratur", () => {
  it("Schlüssel und Felder sind eindeutig", () => {
    // Ein doppelter Schlüssel machte die gespeicherte Auswahl mehrdeutig, ein doppeltes Feld
    // stellte zwei Chips auf denselben Schalter.
    expect(new Set(QUICK_SETTINGS.map((s) => s.key)).size).toBe(QUICK_SETTINGS.length);
    expect(new Set(QUICK_SETTINGS.map((s) => s.field)).size).toBe(QUICK_SETTINGS.length);
  });

  it("jedes Feld nimmt die Sammel-Route auch entgegen", () => {
    // Der Chip schickt `field` an PATCH /api/admin/users/[id]. Steht es dort in keinem Zweig,
    // antwortet die Route mit „keine Felder" — der Schalter klickte ins Leere, und zwar still.
    const route = readFileSync("src/app/api/admin/users/[id]/route.ts", "utf8");
    for (const s of QUICK_SETTINGS) expect(route, s.field).toContain(`body.${s.field} !== undefined`);
  });

  it("das Select deckt genau die Felder der Registratur ab", () => {
    expect(Object.keys(QUICK_SETTING_SELECT).sort()).toEqual(QUICK_SETTINGS.map((s) => s.field).sort());
  });

  it("jedes Feld ist auch wirklich eine Spalte am User", () => {
    // Der Grep-Test oben findet einen Tippfehler, aber nicht ein Feld, das die Route zwar kennt und
    // das trotzdem keine Spalte ist (`cleaningWindows`, `orgasmusArtenConfig`). Ein solcher Eintrag
    // liefe durch Compiler und Suite und quittierte danach JEDEN Aufruf der Keyholder-Übersicht mit
    // einem Prisma-„Unknown field" — für alle Träger auf einmal, weil das Select geteilt ist.
    const columns = new Set(Object.values(Prisma.UserScalarFieldEnum) as string[]);
    for (const s of QUICK_SETTINGS) expect(columns, s.field).toContain(s.field);
  });

  it("jeder Oberbegriff (`dependsOn`) ist selbst ein Feld der Registratur", () => {
    // Sonst zeigte der Chip nie — die Bedingung läse eine Spalte, die gar nicht geladen wird.
    const fields = new Set(QUICK_SETTINGS.map((s) => s.field));
    for (const s of QUICK_SETTINGS) if (s.dependsOn) expect(fields).toContain(s.dependsOn);
  });

  it("zieht keinen Server-Code nach sich", () => {
    // Client-Komponente UND Server-Seiten teilen sich das Modul: ein `prisma`- oder
    // `next/server`-Import landete ohne Typfehler im Browser-Bundle.
    const source = readFileSync("src/lib/quickSettings.ts", "utf8");
    expect(source).not.toMatch(/from "@\/lib\/prisma"|from "next\/server"|@prisma\/client/);
  });
});

describe("Auf der Karte", () => {
  const dependent = QUICK_SETTINGS.find((s) => s.dependsOn)!;
  const ctx = { hasBox: true, weightFeature: true };

  it("ein Schalter mit ausgeschaltetem Oberbegriff steht nicht auf der Karte", () => {
    // Er meldete sonst „eingeschaltet" für eine Einstellung, die stillgelegt ist.
    expect(quickSettingOnCard(dependent, { [dependent.dependsOn!]: false }, ctx)).toBe(false);
  });

  it("mit eingeschaltetem Oberbegriff steht er da", () => {
    expect(quickSettingOnCard(dependent, { [dependent.dependsOn!]: true }, ctx)).toBe(true);
  });

  it("die AUSWAHL in den Einstellungen kennt diese Schranke nicht", () => {
    // Dort soll man einen Schalter vorbereiten können, dessen Oberbegriff gerade aus ist.
    expect(quickSettingAvailable(dependent, ctx)).toBe(true);
  });
});

describe("Verfügbarkeit", () => {
  const box = QUICK_SETTINGS.find((s) => s.requires === "box")!;
  const weight = QUICK_SETTINGS.find((s) => s.requires === "weightFeature")!;
  const plain = QUICK_SETTINGS.find((s) => !s.requires)!;

  it("ein Schalter mit Voraussetzung entfällt, wo sie fehlt", () => {
    // Sonst stünde auf der Karte ein Schalter, dessen Einstellung nichts bewirkt — schlimmer als
    // gar keiner, weil er eine Wirkung verspricht.
    expect(quickSettingAvailable(box, { hasBox: false, weightFeature: true })).toBe(false);
    expect(quickSettingAvailable(weight, { hasBox: true, weightFeature: false })).toBe(false);
  });

  it("mit erfüllter Voraussetzung gilt er, ohne Voraussetzung immer", () => {
    expect(quickSettingAvailable(box, { hasBox: true, weightFeature: false })).toBe(true);
    expect(quickSettingAvailable(plain, { hasBox: false, weightFeature: false })).toBe(true);
  });
});

describe("Gespeicherte Auswahl lesen", () => {
  const keys = QUICK_SETTINGS.map((s) => s.key);

  it("liest die Schlüssel aus dem JSON-String", () => {
    expect(parseQuickSettings(JSON.stringify([keys[1], keys[0]])).map((s) => s.key))
      // Reihenfolge der REGISTRATUR, nicht der Speicherung: die Chips stehen auf jeder Karte gleich.
      .toEqual([keys[0], keys[1]]);
  });

  it("wirft unbekannte Schlüssel weg, statt zu brechen", () => {
    // Eine entfernte oder umbenannte Einstellung darf die Auswahl eines Nutzers nicht zerlegen.
    expect(parseQuickSettings(JSON.stringify(["gibtsNichtMehr", keys[0]])).map((s) => s.key)).toEqual([keys[0]]);
  });

  it("klemmt auf die Zahl, die die Kartenzeile trägt", () => {
    expect(parseQuickSettings(JSON.stringify(keys))).toHaveLength(MAX_QUICK_SETTINGS);
  });

  it("kaputtes oder fehlendes JSON heisst „keine Schalter“", () => {
    for (const raw of [null, undefined, "", "{kaputt", JSON.stringify({ a: 1 }), JSON.stringify([1, 2])]) {
      expect(parseQuickSettings(raw)).toEqual([]);
    }
  });

  it("normalizeQuickSettings liefert dieselbe Auswahl als Schlüssel", () => {
    const raw = JSON.stringify([keys[2], "unbekannt", keys[0]]);
    expect(normalizeQuickSettings(raw)).toEqual(parseQuickSettings(raw).map((s) => s.key));
  });
});
