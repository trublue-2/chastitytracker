import { describe, it, expect } from "vitest";
import { expectImportFree } from "@/test/importFree";
import { isEntryFormRoute, inspectionHref } from "./entryFormRoute";

// Client-Komponenten (`BottomNav`, `MoreMenu`, `NewEntrySheet`) UND server-only Code
// (`kontrolleService` → Mail/Push) importieren dieses Modul — Begründung in `expectImportFree`.
describe("entryFormRoute.ts bleibt importfrei", () => {
  it("enthält keine import-/require-Anweisung", () => {
    expectImportFree("src/lib/entryFormRoute.ts");
  });
});

describe("isEntryFormRoute", () => {
  it("erkennt Erfassen- und Bearbeiten-Routen", () => {
    expect(isEntryFormRoute("/dashboard/new/pruefung")).toBe(true);
    expect(isEntryFormRoute("/dashboard/edit/abc")).toBe(true);
    expect(isEntryFormRoute("/dashboard")).toBe(false);
  });
});

describe("inspectionHref", () => {
  it("lässt die Query weg, wenn nichts vorzubelegen ist", () => {
    expect(inspectionHref()).toBe("/dashboard/new/pruefung");
    // Kontrolle ohne Code (Gerät mit `requireInspectionCode: false`) — kein `?code=null`.
    expect(inspectionHref(null, { kommentar: null })).toBe("/dashboard/new/pruefung");
  });

  it("setzt Code und Kommentar", () => {
    expect(inspectionHref("12345")).toBe("/dashboard/new/pruefung?code=12345");
    expect(inspectionHref("12345", { kommentar: "Bitte scharf" }))
      .toBe("/dashboard/new/pruefung?code=12345&kommentar=Bitte+scharf");
  });

  it("führt den Kommentar allein hinter dem Fragezeichen, nicht hinter einem Und-Zeichen", () => {
    expect(inspectionHref(null, { kommentar: "ohne Code" }))
      .toBe("/dashboard/new/pruefung?kommentar=ohne+Code");
  });

  it("kodiert Sonderzeichen, statt den Link zu zerlegen", () => {
    // Ohne Kodierung schnitte das `&` den Rest ab und `#` machte daraus einen Fragment-Anker.
    expect(inspectionHref("a&b#c")).toBe("/dashboard/new/pruefung?code=a%26b%23c");
    expect(inspectionHref("12345", { kommentar: "A & B" }))
      .toBe("/dashboard/new/pruefung?code=12345&kommentar=A+%26+B");
  });
});
