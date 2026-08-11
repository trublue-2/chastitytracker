import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { MESSAGE_BODY_KEYS } from "./messageService";
import { messageCategory, MESSAGE_CATEGORY_PILLS, MESSAGE_CATEGORIES, bodyKeysOfCategory, bodyKeysOutsideSystem } from "./messageCategories";

describe("Kategorien", () => {
  // Ohne diesen Test rutscht ein neu hinzugefügter Body-Key stillschweigend in den Sammeltopf
  // „system" — die Zeile trägt dann eine Kennzeichnung, die nichts aussagt.
  it("jeder MESSAGE_BODY_KEY hat eine echte Kategorie (nicht system)", () => {
    for (const key of MESSAGE_BODY_KEYS) {
      expect(messageCategory(key), key).not.toBe("system");
    }
  });

  it("Freitext ohne bodyKey und ein unbekannter Schlüssel fallen auf system", () => {
    expect(messageCategory(null)).toBe("system");
    expect(messageCategory("gibtEsNicht")).toBe("system");
  });

  // `bodyKey` ist eine freie TEXT-Spalte. Ohne hasOwn-Guard liefert die Tabelle für diese Werte ein
  // geerbtes Member von Object.prototype — eine Funktion als „Kategorie", die die RSC-Antwort
  // unserialisierbar macht und damit die ganze Seite fällt, nicht nur die Zeile.
  it.each(["constructor", "__proto__", "toString", "valueOf", "hasOwnProperty"])(
    "der Prototyp-Schlüssel %s fällt auf system",
    (key) => {
      const cat = messageCategory(key);
      expect(cat).toBe("system");
      expect(MESSAGE_CATEGORY_PILLS[cat]).toBeDefined();
    },
  );

  it("jedes Kategorie-Label existiert in de.json UND en.json", () => {
    const namespaces = ["de", "en"].map(
      (loc) => JSON.parse(readFileSync(`messages/${loc}.json`, "utf8")).messages as Record<string, string>,
    );
    for (const { labelKey } of Object.values(MESSAGE_CATEGORY_PILLS)) {
      for (const ns of namespaces) expect(ns[labelKey], labelKey).toBeTruthy();
    }
  });
});

describe("Kategorie-Filter leitet vollständig ab", () => {
  it("jede Kategorie ausser system hat mindestens einen Body-Key", () => {
    // Sonst liefert `bodyKeysOfCategory` ein leeres Array, die Abfrage wird zu `bodyKey IN ()` und
    // der Filter zeigt lautlos nichts an — der einzige stille Ausgang dieser Ableitung.
    // `system` ist ausgenommen: es ist der Auffang-Topf und wird über die Umkehrung gefiltert.
    for (const category of MESSAGE_CATEGORIES) {
      if (category === "system") continue;
      expect(bodyKeysOfCategory(category).length, category).toBeGreaterThan(0);
    }
  });

  it("die Umkehrung für system lässt genau die system-Schlüssel übrig", () => {
    const outside = new Set(bodyKeysOutsideSystem());
    for (const key of bodyKeysOfCategory("system")) expect(outside.has(key)).toBe(false);
  });
});
