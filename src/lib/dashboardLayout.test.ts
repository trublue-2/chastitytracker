import { describe, it, expect } from "vitest";
import { SUB_DASHBOARD_BLOCKS } from "@/lib/dashboardBlockRegistry";
import { checkLayoutPatch, mergeOrder, parseDashboardLayout, resolveLayout } from "@/lib/dashboardLayout";

const DEFAULT_IDS = SUB_DASHBOARD_BLOCKS.map((b) => b.id) as string[];

describe("mergeOrder — gespeicherte Reihenfolge trifft heutiges Register", () => {
  it("ohne gespeicherte Reihenfolge kommt der Standard heraus", () => {
    expect(mergeOrder(["a", "b", "c"], [])).toEqual(["a", "b", "c"]);
  });

  it("behält, was der Nutzer sortiert hat", () => {
    expect(mergeOrder(["a", "b", "c"], ["c", "a", "b"])).toEqual(["c", "a", "b"]);
  });

  it("wirft Ids weg, die es nicht mehr gibt", () => {
    expect(mergeOrder(["a", "b"], ["b", "geloescht", "a"])).toEqual(["b", "a"]);
  });

  /**
   * Der Fall, um den es geht. Ein neuer Block darf NICHT hinten anhängen: ein Warnblock, der oben
   * stehen soll, läge sonst unter der Historie und wäre praktisch unsichtbar.
   */
  it("setzt einen neuen Block dorthin, wo er im Standard steht", () => {
    // "neu" steht im Standard zwischen a und b — auch wenn der Nutzer b und a vertauscht hat,
    // gehört es hinter a.
    expect(mergeOrder(["a", "neu", "b"], ["b", "a"])).toEqual(["b", "a", "neu"]);
    // Und wenn der Nutzer die Standardfolge behalten hat, landet es an seiner Stelle.
    expect(mergeOrder(["a", "neu", "b"], ["a", "b"])).toEqual(["a", "neu", "b"]);
  });

  it("ein neuer Block ganz vorne landet vorne, nicht hinten", () => {
    expect(mergeOrder(["neu", "a", "b"], ["a", "b"])).toEqual(["neu", "a", "b"]);
  });

  it("mehrere neue Blöcke behalten ihre Reihenfolge zueinander", () => {
    expect(mergeOrder(["a", "n1", "n2", "b"], ["a", "b"])).toEqual(["a", "n1", "n2", "b"]);
  });

  it("liefert immer genau die Ids des Registers — keine verloren, keine doppelt", () => {
    const gemischt = [...DEFAULT_IDS].reverse().slice(0, 5);
    const result = mergeOrder(DEFAULT_IDS, gemischt);
    expect([...result].sort()).toEqual([...DEFAULT_IDS].sort());
    expect(new Set(result).size).toBe(result.length);
  });
});

describe("resolveLayout", () => {
  it("ohne gespeicherte Konfiguration steht das heutige Dashboard da", () => {
    // Die Zusage an jeden, der nie etwas einstellt — hier als Eigenschaft, nicht als Behauptung.
    const r = resolveLayout({}, "subDashboard");
    expect(r.visible.map((b) => b.id)).toEqual(DEFAULT_IDS);
    expect(r.hiddenCount).toBe(0);
  });

  it("eine kaputte Konfiguration fällt auf den Standard zurück, statt zu werfen", () => {
    for (const kaputt of ["nicht json", "[]", "null", '"text"', "", null, undefined]) {
      const r = resolveLayout(parseDashboardLayout(kaputt), "subDashboard");
      expect(r.visible.map((b) => b.id)).toEqual(DEFAULT_IDS);
    }
  });

  it("blendet aus, was ausgeblendet ist — und zählt es", () => {
    const r = resolveLayout({ subDashboard: { hidden: ["boxStatus", "taskList"] } }, "subDashboard");
    expect(r.visible.map((b) => b.id)).not.toContain("boxStatus");
    expect(r.hiddenCount).toBe(2);
    // `all` behält beide, damit der Bearbeiten-Modus sie zeigen kann.
    expect(r.all.length).toBe(DEFAULT_IDS.length);
  });

  it("ein alwaysOn-Block lässt sich nicht wegschalten", () => {
    // Ohne die Begrüssungszeile gäbe es keinen Weg zurück in den Bearbeiten-Modus.
    const r = resolveLayout({ subDashboard: { hidden: ["greeting"] } }, "subDashboard");
    expect(r.visible.map((b) => b.id)).toContain("greeting");
    expect(r.hiddenCount).toBe(0);
  });
});

describe("checkLayoutPatch — die Schreibseite", () => {
  it("nimmt eine gültige Konfiguration an und normalisiert sie", () => {
    const res = checkLayoutPatch({ subDashboard: { hidden: ["boxStatus", "boxStatus"], order: ["alerts"] } }, "sub");
    expect(res).toEqual({ layout: { subDashboard: { hidden: ["boxStatus"], order: ["alerts"] } } });
  });

  it("lehnt eine unbekannte Block-Id ab, statt sie still zu schlucken", () => {
    expect(checkLayoutPatch({ subDashboard: { hidden: ["gibtsNicht"] } }, "sub"))
      .toEqual({ error: "layoutUnknownBlock" });
  });

  it("lehnt eine fremde Oberfläche ab", () => {
    expect(checkLayoutPatch({ keyholderStats: { hidden: [] } }, "sub"))
      .toEqual({ error: "layoutUnknownSurface" });
  });

  it("lehnt Unsinn ab", () => {
    for (const müll of [null, 42, "text", [], { subDashboard: 5 }]) {
      expect(checkLayoutPatch(müll, "sub")).toHaveProperty("error");
    }
  });

  it("filtert alwaysOn still heraus, statt den ganzen Vorgang abzulehnen", () => {
    const res = checkLayoutPatch({ subDashboard: { hidden: ["greeting", "boxStatus"] } }, "sub");
    expect(res).toEqual({ layout: { subDashboard: { hidden: ["boxStatus"], order: [] } } });
  });
});
