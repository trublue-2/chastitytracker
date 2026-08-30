import { describe, it, expect } from "vitest";
import { expectImportFree } from "@/test/importFree";
import { isPendingLock, isEffectiveEntry, clampBoltTime, boltFieldsFor, latestEffectiveKgEntry } from "./lockPending";

const D = (iso: string) => new Date(iso);

// Die Regel wird sowohl in client-sichtbarem Code (`utils.ts` → Dashboard-Komponenten) als auch in
// server-only Modulen (`queries.ts` → Prisma) gebraucht — Begründung in `expectImportFree`.
describe("lockPending.ts bleibt importfrei", () => {
  it("enthält keine import-/require-Anweisung", () => {
    expectImportFree("src/lib/lockPending.ts");
  });
});

describe("isPendingLock", () => {
  it("erkennt den Verschluss ohne bestätigten Riegel", () => {
    expect(isPendingLock({ type: "VERSCHLUSS", boltConfirmedAt: null })).toBe(true);
    expect(isPendingLock({ type: "VERSCHLUSS", boltConfirmedAt: D("2026-08-30T10:00:00Z") })).toBe(false);
  });

  it("gilt nur für VERSCHLUSS — bei jedem anderen Typ ist das Feld bedeutungslos", () => {
    // Eine Öffnung trägt IMMER `null`; würde sie hier als schwebend gelesen, verschwände sie aus
    // den Paaren und jede Session bliebe für immer offen.
    expect(isPendingLock({ type: "OEFFNEN", boltConfirmedAt: null })).toBe(false);
    expect(isPendingLock({ type: "PRUEFUNG", boltConfirmedAt: null })).toBe(false);
    expect(isEffectiveEntry({ type: "OEFFNEN", boltConfirmedAt: null })).toBe(true);
  });

  it("behandelt eine Zeile ohne die Spalte als gültig, nicht als schwebend", () => {
    // Absicherung gegen ein Select, das die Spalte weglässt: die sichere Richtung ist
    // Bestandsverhalten, nicht „alle Verschlüsse verschwinden".
    expect(isPendingLock({ type: "VERSCHLUSS" } as unknown as { type: string; boltConfirmedAt: Date | null })).toBe(false);
  });
});

describe("boltFieldsFor — die Schreib-Seite", () => {
  const t = D("2026-08-30T10:00:00Z");

  it("macht einen Verschluss ohne Riegel-Erwartung sofort wirksam", () => {
    // Der Fall, der zählt: Keyholder-Pfad und Demo-Seeder. Ohne diese Vorgabe läge dort dauerhaft
    // ein schwebender Verschluss — unsichtbar für jede Ableitung, auf einer Instanz ganz ohne Box.
    expect(boltFieldsFor("VERSCHLUSS", t)).toEqual({ boltConfirmedAt: t });
  });

  it("lässt ihn offen, wenn er auf den Riegel wartet", () => {
    expect(boltFieldsFor("VERSCHLUSS", t, true)).toEqual({ boltConfirmedAt: null });
  });

  it("setzt bei jedem anderen Typ nichts — dort ist das Feld bedeutungslos", () => {
    expect(boltFieldsFor("OEFFNEN", t)).toEqual({ boltConfirmedAt: null });
    expect(boltFieldsFor("PRUEFUNG", t, true)).toEqual({ boltConfirmedAt: null });
  });
});

describe("latestEffectiveKgEntry", () => {
  // Absteigend nach startTime — so, wie die Sichten ihre Einträge laden.
  const rows = [
    { id: "v2", type: "VERSCHLUSS", boltConfirmedAt: null },
    { id: "o1", type: "OEFFNEN", boltConfirmedAt: null },
    { id: "v1", type: "VERSCHLUSS", boltConfirmedAt: D("2026-08-29T10:00:00Z") },
  ];

  it("überspringt den schwebenden Aufruf und nimmt den Eintrag darunter", () => {
    expect(latestEffectiveKgEntry(rows)?.id).toBe("o1");
  });

  it("ignoriert Nicht-KG-Einträge", () => {
    expect(latestEffectiveKgEntry([{ id: "p1", type: "PRUEFUNG", boltConfirmedAt: null }, ...rows])?.id).toBe("o1");
  });

  it("null, wenn es keinen wirksamen KG-Eintrag gibt", () => {
    expect(latestEffectiveKgEntry([{ id: "v2", type: "VERSCHLUSS", boltConfirmedAt: null }])).toBe(null);
  });
});

describe("clampBoltTime", () => {
  const called = D("2026-08-30T10:00:00Z");
  const now = D("2026-08-30T10:05:00Z");

  it("nimmt die gemeldete Zeit, wenn sie zwischen Aufruf und jetzt liegt", () => {
    expect(clampBoltTime(D("2026-08-30T10:02:00Z"), called, now)).toEqual(D("2026-08-30T10:02:00Z"));
  });

  it("hebt eine Meldung VOR dem Aufruf auf den Aufruf an", () => {
    // Sonst datierte eine nachgehende Box-Uhr den Verschluss hinter den Aufruf zurück und rettete
    // damit eine bereits verpasste Reinigungs-Frist.
    expect(clampBoltTime(D("2026-08-30T09:00:00Z"), called, now)).toEqual(called);
  });

  it("kappt eine Meldung aus der Zukunft auf jetzt", () => {
    expect(clampBoltTime(D("2026-08-30T18:00:00Z"), called, now)).toEqual(now);
  });
});
