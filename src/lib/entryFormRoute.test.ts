import { describe, it, expect } from "vitest";
import { expectImportFree } from "@/test/importFree";
import { isEntryFormRoute, inspectionHref, taskFormHref, openInspections, pendingInspection, type PendingInspectionLike } from "./entryFormRoute";

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

describe("taskFormHref — der Bauplatz des Aufgaben-Formulars", () => {
  it("bleibt ohne Zusatz die nackte Route", () => {
    expect(taskFormHref("u1")).toBe("/admin/users/u1/aktionen/aufgabe");
  });

  it("hängt Vergehens-ref und Anlass als Query an", () => {
    expect(taskFormHref("u1", { offenseRef: "t-9", anlass: "Kontrolle 38185" }))
      .toBe("/admin/users/u1/aktionen/aufgabe?offenseRef=t-9&anlass=Kontrolle+38185");
  });

  it("kodiert einen Anlass mit & und # — sonst zerfiele der Link still", () => {
    // Der Anlass kommt aus Freitext (Aufgaben-Titel des Subs), er darf alles enthalten.
    const href = taskFormHref("u1", { offenseRef: "t-9", anlass: "Wohnung & Bad #2" });
    expect(href).toContain("anlass=Wohnung+%26+Bad+%232");
    expect(new URL(href, "https://x").searchParams.get("anlass")).toBe("Wohnung & Bad #2");
  });

  it("lässt leere Werte weg, statt sie als leere Query mitzuschleppen", () => {
    expect(taskFormHref("u1", { offenseRef: null, anlass: "" })).toBe("/admin/users/u1/aktionen/aufgabe");
  });
});

describe("pendingInspection", () => {
  const k = (o: Partial<PendingInspectionLike> & { deadline: Date }): PendingInspectionLike =>
    ({ code: "11111", ...o });

  it("ohne Anforderungen: nichts offen", () => {
    expect(pendingInspection([])).toBeNull();
  });

  it("nimmt die Anforderung mit der KNAPPSTEN Frist", () => {
    const spaet = k({ code: "22222", deadline: new Date("2026-08-25T20:00:00Z") });
    const frueh = k({ code: "33333", deadline: new Date("2026-08-25T09:00:00Z") });
    expect(pendingInspection([spaet, frueh])?.code).toBe("33333");
  });

  it("beantwortete und zurückgezogene zählen nicht als offen", () => {
    const beantwortet = k({ code: "44444", deadline: new Date("2026-08-25T08:00:00Z"), entryId: "e1" });
    const zurueck = k({ code: "55555", deadline: new Date("2026-08-25T09:00:00Z"), withdrawnAt: new Date() });
    const offen = k({ code: "66666", deadline: new Date("2026-08-25T20:00:00Z") });
    expect(pendingInspection([beantwortet, zurueck, offen])?.code).toBe("66666");
    expect(pendingInspection([beantwortet, zurueck])).toBeNull();
  });

  /** Der eigentliche Anlass: der (+)-Knopf führte auf das nackte Formular, und das WÜRFELT einen
   *  Code. Der Weg muss den Code der Anforderung tragen, sonst beantwortet die Erfassung sie nicht. */
  it("der Weg trägt den Code der Anforderung", () => {
    const treffer = pendingInspection([k({ code: "48219", deadline: new Date("2026-08-25T20:00:00Z") })]);
    expect(treffer?.href).toContain("code=48219");
  });

  it("reicht Kommentar und Ziel-Kategorie mit", () => {
    const treffer = pendingInspection([
      k({ deadline: new Date("2026-08-25T20:00:00Z"), kommentar: "Bitte mit Datum", categoryId: "cat1" }),
    ]);
    expect(treffer?.href).toContain("kommentar=");
    expect(treffer?.href).toContain("cat=cat1");
  });

  /** Eine Anforderung ohne Code-Pflicht ist trotzdem offen — sie trägt nur keine Zahl. */
  it("ohne Code bleibt der Weg gültig", () => {
    const treffer = pendingInspection([k({ code: null, deadline: new Date("2026-08-25T20:00:00Z") })]);
    expect(treffer).not.toBeNull();
    expect(treffer?.code).toBeNull();
    expect(treffer?.href).not.toContain("code=");
  });

  /** NUR der Sub-Pfad: erfasst die Keyholderin für ihren Träger, hakt das die Anforderung ohnehin
   *  nicht ab (`entryFulfilment.ts`), und ihr Formular liest den vorbelegten Code gar nicht. Ein
   *  Weg, dessen Vorbelegung still verdunstet, wäre genau die Falle, die hier zugemacht wurde. */
  it("baut immer den Weg des TRÄGERS", () => {
    const treffer = pendingInspection([k({ deadline: new Date("2026-08-25T20:00:00Z") })]);
    expect(treffer?.href).toContain("/dashboard/new/pruefung");
    expect(treffer?.href).not.toContain("/admin/");
  });

  it("openInspections ordnet nach Frist und lässt Erledigtes weg", () => {
    const rows = [
      k({ code: "a", deadline: new Date("2026-08-25T20:00:00Z") }),
      k({ code: "b", deadline: new Date("2026-08-25T08:00:00Z"), entryId: "e" }),
      k({ code: "c", deadline: new Date("2026-08-25T09:00:00Z") }),
    ];
    expect(openInspections(rows).map((r) => r.code)).toEqual(["c", "a"]);
  });
});
