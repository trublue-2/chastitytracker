import { describe, it, expect } from "vitest";
import {
  bmi, breachToAnnounce, corridorBreach, corridorProblem, effectiveCorridor, heightAt, heightProblem,
  isUnderweightTarget, keyholderCorridorProblem, normalWeightRangeKg, weightForDisplay,
  weightInputToKg, weightProblem, WEIGHT_PROBLEMS,
} from "./weight";

describe("Einheiten", () => {
  it("speichert metrisch und gibt in der Einheit des Betrachters zurück", () => {
    expect(weightInputToKg(75.6, "metric")).toBe(75.6);
    expect(weightForDisplay(75.6, "metric")).toBe(75.6);
  });

  it("rundet die Pfund-Eingabe NICHT auf 0,1 kg", () => {
    // 165,4 lbs = 75,0242 kg. Würde beim Speichern auf 75,0 gerundet, zeigte die Anzeige 165,3 —
    // eine Zahl, die der Nutzer nie eingegeben hat.
    const kg = weightInputToKg(165.4, "imperial");
    expect(kg).toBeCloseTo(75.0242, 4);
    expect(weightForDisplay(kg, "imperial")).toBe(165.4);
  });
});

describe("bmi", () => {
  it("rechnet kg durch Meter im Quadrat", () => {
    expect(bmi(80, 180)).toBeCloseTo(24.69, 2);
  });

  it("ist null ohne bekannte Grösse", () => {
    expect(bmi(80, null)).toBeNull();
    expect(bmi(80, 0)).toBeNull();
  });

  it("bleibt ungerundet, damit die Untergewicht-Schwelle scharf bleibt", () => {
    // BMI 18,46 — auf eine Kommastelle gerundet wäre es 18,5 und ginge als „nicht untergewichtig"
    // durch.
    const value = bmi(59.8, 180)!;
    expect(value).toBeLessThan(18.5);
    expect(isUnderweightTarget(59.8, 180)).toBe(true);
  });

  it("warnt nicht ohne Grösse — ohne sie ist nichts bekannt", () => {
    expect(isUnderweightTarget(45, null)).toBe(false);
  });
});

describe("normalWeightRangeKg", () => {
  it("gibt die Spanne in Kilogramm, nicht in BMI-Punkten", () => {
    const r = normalWeightRangeKg(180, "m")!;
    expect(r.minKg).toBeCloseTo(64.8, 1);
    expect(r.maxKg).toBeCloseTo(81, 1);
  });

  it("nimmt ohne Angabe den geschlechtsneutralen WHO-Bereich", () => {
    expect(normalWeightRangeKg(180, null)!.minKg).toBeCloseTo(59.9, 1);
  });
});

describe("Korridor — Prüfung", () => {
  it("nimmt einen einseitigen Korridor an (nur Obergrenze ist der Normalfall)", () => {
    expect(corridorProblem({ minKg: null, maxKg: 84 })).toBeNull();
  });

  it("weist eine Untergrenze über der Obergrenze ab", () => {
    expect(corridorProblem({ minKg: 90, maxKg: 84 })).toBe(WEIGHT_PROBLEMS.corridorInverted);
  });

  it("weist unplausible Gewichte ab", () => {
    expect(weightProblem(5)).toBe(WEIGHT_PROBLEMS.weightOutOfRange);
    expect(weightProblem(400)).toBe(WEIGHT_PROBLEMS.weightOutOfRange);
    expect(weightProblem("75")).toBe(WEIGHT_PROBLEMS.weightOutOfRange);
    expect(weightProblem(75.6)).toBeNull();
  });

  it("verlangt eine ganzzahlige Körpergrösse im plausiblen Bereich", () => {
    expect(heightProblem(180)).toBeNull();
    expect(heightProblem(180.5)).toBe(WEIGHT_PROBLEMS.heightOutOfRange);
    expect(heightProblem(17)).toBe(WEIGHT_PROBLEMS.heightOutOfRange);
  });
});

describe("Korridor — die Keyholderin darf nur weiten", () => {
  const sub = { minKg: null, maxKg: 84 };

  it("lässt die weitere Obergrenze zu (Beispiel des Nutzers: 84 → 87)", () => {
    expect(keyholderCorridorProblem(sub, { minKg: null, maxKg: 87 })).toBeNull();
  });

  it("weist die engere Obergrenze ab (84 → 80)", () => {
    expect(keyholderCorridorProblem(sub, { minKg: null, maxKg: 80 })).toBe(WEIGHT_PROBLEMS.corridorNarrower);
  });

  it("weist eine Grenze ab, wo der Sub gar keine gesetzt hat", () => {
    // Von unbegrenzt auf begrenzt ist die grösstmögliche Verengung, nicht ihr Gegenteil.
    expect(keyholderCorridorProblem(sub, { minKg: 70, maxKg: 84 })).toBe(WEIGHT_PROBLEMS.corridorNarrower);
  });

  it("lässt die Rücknahme der Nachbesserung zu", () => {
    expect(keyholderCorridorProblem(sub, { minKg: null, maxKg: null })).toBeNull();
  });

  it("weist einen in sich widersprüchlichen Korridor auch dann ab, wenn er weiter wäre", () => {
    expect(keyholderCorridorProblem({ minKg: 70, maxKg: 84 }, { minKg: 90, maxKg: 85 }))
      .toBe(WEIGHT_PROBLEMS.corridorInverted);
  });
});

describe("Korridor — wirksamer Stand", () => {
  it("nimmt stets den weiteren der beiden Werte", () => {
    expect(effectiveCorridor({ minKg: 70, maxKg: 84 }, { minKg: 65, maxKg: 87 }))
      .toEqual({ minKg: 65, maxKg: 87 });
  });

  it("lässt eine strengere Keyholder-Zahl wirkungslos, falls sie doch in die Spalte gerät", () => {
    // Zweite Verteidigungslinie: die Prüfung weist so etwas ab, aber Alt-Daten und Roh-SQL fragen
    // nicht. Wirksam bleibt der Wunsch des Subs.
    expect(effectiveCorridor({ minKg: null, maxKg: 84 }, { minKg: null, maxKg: 80 }))
      .toEqual({ minKg: null, maxKg: 84 });
  });

  it("übernimmt die Keyholder-Grenze, wo der Sub keine hat", () => {
    expect(effectiveCorridor({ minKg: null, maxKg: null }, { minKg: 60, maxKg: 90 }))
      .toEqual({ minKg: 60, maxKg: 90 });
  });
});

describe("corridorBreach", () => {
  const c = { minKg: 70, maxKg: 84 };
  it("meldet die Seite des Austritts", () => {
    expect(corridorBreach(85, c)).toBe("above");
    expect(corridorBreach(69.9, c)).toBe("below");
    expect(corridorBreach(84, c)).toBeNull();
  });

  it("meldet nichts, wo keine Grenze gesetzt ist", () => {
    expect(corridorBreach(200, { minKg: null, maxKg: null })).toBeNull();
  });
});

describe("heightAt", () => {
  const rows = [
    { heightCm: 178, effectiveFrom: new Date(0) },
    { heightCm: 180, effectiveFrom: new Date("2026-06-01T00:00:00Z") },
  ];

  it("nimmt die Grösse, die zum Messzeitpunkt galt", () => {
    expect(heightAt(rows, new Date("2026-05-31T23:00:00Z"))).toBe(178);
    expect(heightAt(rows, new Date("2026-08-01T00:00:00Z"))).toBe(180);
  });

  it("lässt vor der ersten Zeile keine Lücke — die Grundzeile gilt seit jeher", () => {
    expect(heightAt(rows, new Date("1999-01-01T00:00:00Z"))).toBe(178);
  });

  it("ist null, solange keine Grösse bekannt ist", () => {
    expect(heightAt([], new Date())).toBeNull();
  });
});

describe("breachToAnnounce — einmal je Austritt", () => {
  const corridor = { minKg: 70, maxKg: 84 };
  const call = (currentKg: number, previousKg: number | null, heightCm: number | null = 180) =>
    breachToAnnounce({ currentKg, previousKg, corridor, heightCm });

  it("meldet den Austritt nach oben", () => {
    expect(call(85, 83)).toBe("above");
  });

  it("schweigt, solange er draussen BLEIBT", () => {
    // Fünf Tage 200 g über der Grenze sollen eine Meldung erzeugen, nicht fünf.
    expect(call(85.2, 85)).toBeNull();
  });

  it("meldet wieder, wenn er zurückkehrt und erneut austritt", () => {
    expect(call(83, 85)).toBeNull();
    expect(call(85, 83)).toBe("above");
  });

  it("behandelt den Seitenwechsel als neuen Austritt", () => {
    expect(call(69, 85)).toBe("below");
  });

  it("meldet die erste Messung, wenn sie schon ausserhalb liegt", () => {
    expect(call(90, null)).toBe("above");
  });

  it("schweigt innerhalb des Korridors", () => {
    expect(call(80, 90)).toBeNull();
  });

  it("meldet nichts zu einer Grenze im Untergewicht", () => {
    // Untergrenze 55 kg bei 1,85 m ist BMI 16 — die App fordert nicht ein, was sie beim Setzen
    // selbst als bedenklich anzeigt.
    expect(breachToAnnounce({
      currentKg: 54, previousKg: 60, corridor: { minKg: 55, maxKg: null }, heightCm: 185,
    })).toBeNull();
  });

  it("meldet weiterhin die andere, unbedenkliche Grenze", () => {
    expect(breachToAnnounce({
      currentKg: 95, previousKg: 80, corridor: { minKg: 55, maxKg: 90 }, heightCm: 185,
    })).toBe("above");
  });
});
