import { describe, it, expect } from "vitest";
import { withDeltas } from "@/lib/weightRows";

/** Eine Zeile, wie die Abfrage sie liefert — nur die Felder, die `withDeltas` anfasst. */
function row(dayKey: string, weightKg: number) {
  return {
    id: dayKey,
    dayKey,
    measuredAt: new Date(`${dayKey}T07:00:00Z`),
    weightKg,
    inWindow: true,
    imageUrl: null,
    imageExifTime: null,
    imagePrunedAt: null,
    detectedKg: null,
    note: null,
    source: "user",
  };
}

describe("die Veränderung zum Vorwert", () => {
  it("die erste Messung hat keine — es gibt nichts, wovon sie abweicht", () => {
    const [first] = withDeltas([row("2026-08-01", 75.6)]);
    expect(first.deltaKg).toBeNull();
  });

  it("rechnet vorwärts: das Vorzeichen beschreibt die Bewegung seit dem Wert DAVOR", () => {
    const rows = withDeltas([row("2026-08-01", 75.6), row("2026-08-02", 75.3), row("2026-08-03", 76.1)]);
    expect(rows.map((r) => r.deltaKg)).toEqual([null, -0.3, 0.8]);
  });

  it("rundet auf eine Stelle — sonst steht dort das Fliesskomma-Rauschen der Differenz", () => {
    const [, second] = withDeltas([row("2026-08-01", 75.6), row("2026-08-02", 75.3)]);
    // 75.3 - 75.6 ist in IEEE-754 -0.29999999999999716; angezeigt gehört -0,3.
    expect(second.deltaKg).toBe(-0.3);
  });

  it("lässt die übrigen Felder unangetastet", () => {
    const source = row("2026-08-01", 75.6);
    const [only] = withDeltas([source]);
    expect(only).toEqual({ ...source, deltaKg: null });
  });

  it("eine leere Reihe bleibt leer", () => {
    expect(withDeltas([])).toEqual([]);
  });
});
