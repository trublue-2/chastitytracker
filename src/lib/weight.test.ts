import { describe, it, expect } from "vitest";
import {
  bmi, effectiveTarget, heightAt, heightProblem, isUnderweightTarget, targetEventToAnnounce,
  targetProgress, targetReached, weightForDisplay, weightInputToKg, weightProblem, WEIGHT_PROBLEMS,
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

describe("Plausibilität", () => {
  it("weist unplausible Gewichte ab — als Messwert wie als Ziel", () => {
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

describe("Ziel — wer gilt", () => {
  const setAt = new Date("2026-08-01T00:00:00Z");

  it("nimmt das der Keyholderin, solange sie eines führt", () => {
    expect(effectiveTarget({
      targetWeightKg: 84, targetWeightSetAt: setAt,
      targetWeightKeyholderKg: 80, targetWeightKeyholderSetAt: setAt,
    })).toEqual({ kg: 80, setAt, source: "keyholder" });
  });

  it("fällt auf das des Trägers zurück, wenn sie ihres zurücknimmt", () => {
    expect(effectiveTarget({
      targetWeightKg: 84, targetWeightSetAt: setAt,
      targetWeightKeyholderKg: null, targetWeightKeyholderSetAt: null,
    })).toEqual({ kg: 84, setAt, source: "sub" });
  });

  it("ist null, solange niemand eines gesetzt hat", () => {
    expect(effectiveTarget({
      targetWeightKg: null, targetWeightSetAt: null,
      targetWeightKeyholderKg: null, targetWeightKeyholderSetAt: null,
    })).toBeNull();
  });

  it("gilt auch dann, wenn ihre Zahl strenger ist als seine — die Nur-Weiten-Regel ist gestrichen", () => {
    expect(effectiveTarget({
      targetWeightKg: 84, targetWeightSetAt: setAt,
      targetWeightKeyholderKg: 78, targetWeightKeyholderSetAt: setAt,
    })?.kg).toBe(78);
  });
});

describe("Ziel — erreicht", () => {
  it("zählt beim Abnehmen jeden Wert darunter mit", () => {
    expect(targetReached(84, 84, "down")).toBe(true);
    expect(targetReached(80, 84, "down")).toBe(true);
    expect(targetReached(84.1, 84, "down")).toBe(false);
  });

  it("dreht die Richtung beim Zunehmen um", () => {
    expect(targetReached(84, 84, "up")).toBe(true);
    expect(targetReached(86, 84, "up")).toBe(true);
    expect(targetReached(83, 84, "up")).toBe(false);
  });

  it("lässt ohne Richtung die Toleranz nach beiden Seiten gelten", () => {
    expect(targetReached(84.9, 84, "hold")).toBe(true);
    expect(targetReached(83.1, 84, "hold")).toBe(true);
    expect(targetReached(85.5, 84, "hold")).toBe(false);
  });
});

describe("Ziel — Fortschritt", () => {
  it("misst die Strecke vom Startgewicht zum Ziel", () => {
    const p = targetProgress({ targetKg: 90, startKg: 100, currentKg: 96 });
    expect(p).toMatchObject({ direction: "down", remainingKg: 6, percent: 40, reached: false });
  });

  it("steht bei erreichtem Ziel auf null Rest und voller Strecke", () => {
    const p = targetProgress({ targetKg: 90, startKg: 100, currentKg: 88 });
    expect(p).toMatchObject({ remainingKg: 0, percent: 100, reached: true });
  });

  it("gibt 0 %, wer sich vom Ziel entfernt hat — statt eines negativen Balkens", () => {
    expect(targetProgress({ targetKg: 90, startKg: 100, currentKg: 103 }).percent).toBe(0);
  });

  it("lässt den Anteil ohne Startwert weg, statt ihn zu erfinden", () => {
    const p = targetProgress({ targetKg: 90, startKg: null, currentKg: 96 });
    expect(p.percent).toBeNull();
    expect(p.remainingKg).toBe(6);
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

describe("targetEventToAnnounce — einmal je Übergang", () => {
  const target = { kg: 90, setAt: new Date("2026-08-01T00:00:00Z"), source: "keyholder" as const };
  const base = { target, startKg: 100, heightCm: 180 };

  it("meldet das erreichte Ziel", () => {
    expect(targetEventToAnnounce({ ...base, previousKg: 91, currentKg: 89.5 })).toBe("reached");
  });

  it("schweigt, solange es erreicht BLEIBT", () => {
    expect(targetEventToAnnounce({ ...base, previousKg: 89.5, currentKg: 89 })).toBeNull();
  });

  it("schweigt, solange es unerreicht bleibt", () => {
    expect(targetEventToAnnounce({ ...base, previousKg: 95, currentKg: 94 })).toBeNull();
  });

  it("meldet den Rückfall erst jenseits der Toleranz", () => {
    expect(targetEventToAnnounce({ ...base, previousKg: 89, currentKg: 90.5 })).toBeNull();
    expect(targetEventToAnnounce({ ...base, previousKg: 89, currentKg: 91.5 })).toBe("relapsed");
  });

  it("meldet die erste Messung, wenn sie das Ziel schon trifft", () => {
    expect(targetEventToAnnounce({ ...base, previousKg: null, currentKg: 88 })).toBe("reached");
  });

  it("meldet nichts zu einem Ziel im Untergewicht", () => {
    // Die App fordert nicht ein, was sie beim Setzen selbst als bedenklich anzeigt.
    const dünn = { kg: 55, setAt: null, source: "sub" as const };
    expect(targetEventToAnnounce({ target: dünn, startKg: 70, heightCm: 180, previousKg: 60, currentKg: 54 }))
      .toBeNull();
  });
});
