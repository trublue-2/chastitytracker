import { describe, it, expect } from "vitest";
import { expectImportFree } from "@/test/importFree";
import { STORED_TYPE } from "./offenseTypes";

/**
 * Die Vergehens-Taxonomie ist aus Client-Komponenten erreichbar — die Strafbuch-Seite tippt ihren
 * `offenseType` darauf. Genau das war vorher unmöglich (die Tabelle lag in `strafurteilService.ts`,
 * und der zieht Prisma), weshalb die Seite eine eigene, engere Union führte und
 * mehrere Vergehensarten dort gar nicht erscheinen konnten.
 */
describe("offenseTypes.ts bleibt importfrei", () => {
  it("enthält keine import-/require-Anweisung", () => {
    expectImportFree("src/lib/offenseTypes.ts");
  });
});

describe("STORED_TYPE", () => {
  it("bildet jede kanonische Art auf einen gespeicherten Wert ab", () => {
    // Der Typ erzwingt die Vollständigkeit bereits beim Kompilieren (`satisfies Record<…>`); dieser
    // Test hält zusätzlich fest, dass kein Wert versehentlich leer ist.
    for (const [canonical, stored] of Object.entries(STORED_TYPE)) {
      expect(stored, canonical).toBeTruthy();
    }
  });

  it("mehrere kanonische Arten dürfen sich einen gespeicherten Wert teilen", () => {
    // `late_control` und `rejected_control` sind beide KONTROLLANFORDERUNG — beabsichtigt: der
    // StrafeRecord unterscheidet sie über die refId, nicht über den Typ.
    expect(STORED_TYPE.late_control).toBe(STORED_TYPE.rejected_control);
  });

  it("Aufgaben haben einen EIGENEN gespeicherten Typ", () => {
    // Nicht unter KONTROLLANFORDERUNG mitlaufen lassen: eine nicht erfüllte Aufgabe ist etwas
    // anderes als eine verspätete Kontrolle, und das Strafbuch zeigt sie in einem eigenen Abschnitt.
    expect(STORED_TYPE.unfulfilled_task).toBe("AUFGABE");
    const others = Object.entries(STORED_TYPE).filter(([k]) => k !== "unfulfilled_task");
    expect(others.map(([, v]) => v)).not.toContain("AUFGABE");
  });
});
