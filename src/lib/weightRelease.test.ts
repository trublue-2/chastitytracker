import { describe, it, expect } from "vitest";
import { evaluateRelease, thresholdOn, type ReleaseRule } from "@/lib/weightRelease";
import type { WeightPoint } from "@/lib/weightSeries";

const TZ = "Europe/Zurich";
const at = (day: string, hour = 7) => new Date(`${day}T0${hour}:00:00+02:00`);

const rule = (over: Partial<ReleaseRule> = {}): ReleaseRule => ({
  thresholdKg: 74,
  direction: "below",
  averageDays: 3,
  minMeasurements: 2,
  stepKg: 0,
  notBeforeAt: at("2026-08-20"),
  armedAt: at("2026-08-20"),
  ...over,
});

const point = (dayKey: string, weightKg: number): WeightPoint => ({ dayKey, weightKg, inWindow: true });

describe("die Schwelle des Tages", () => {
  it("bleibt ohne Anstieg konstant", () => {
    expect(thresholdOn(rule(), "2026-08-30", TZ)).toBe(74);
  });

  it("kommt beim Abnehmen täglich entgegen — sie STEIGT", () => {
    const r = rule({ stepKg: 0.5 });
    expect(thresholdOn(r, "2026-08-20", TZ)).toBe(74);
    expect(thresholdOn(r, "2026-08-21", TZ)).toBe(74.5);
    expect(thresholdOn(r, "2026-08-23", TZ)).toBe(75.5);
  });

  it("kommt beim Zunehmen ebenfalls entgegen — dort SINKT sie", () => {
    const r = rule({ direction: "above", stepKg: 0.5 });
    expect(thresholdOn(r, "2026-08-22", TZ)).toBe(73);
  });

  it("rechnet nicht rückwärts: vor dem Stellen gilt die unveränderte Schwelle", () => {
    // Sonst wäre die Vorgabe für Tage schärfer, an denen es sie noch gar nicht gab.
    expect(thresholdOn(rule({ stepKg: 0.5 }), "2026-08-10", TZ)).toBe(74);
  });
});

describe("die Auswertung der Vorgabe", () => {
  it("greift nicht, solange zu wenige Messungen im Fenster liegen", () => {
    const res = evaluateRelease(rule(), [point("2026-08-23", 73.0)], at("2026-08-23"), TZ);
    expect(res.released).toBe(false);
    expect(res.reason).toBe("too_few_measurements");
    // Kein Mittel aus einem einzigen Wert: das wäre der Tageswert und damit das Rauschen zurück.
    expect(res.averageKg).toBeNull();
  });

  it("rechnet mit dem MITTEL, nicht mit dem Tageswert", () => {
    // Der letzte Wert liegt unter der Schwelle, das Mittel nicht — es öffnet nichts.
    const points = [point("2026-08-21", 75.0), point("2026-08-22", 74.8), point("2026-08-23", 73.8)];
    const res = evaluateRelease(rule(), points, at("2026-08-23"), TZ);
    expect(res.averageKg).toBe(74.5);
    expect(res.released).toBe(false);
    expect(res.reason).toBe("above_threshold");
    expect(res.remainingKg).toBe(0.5);
  });

  it("öffnet, sobald das Mittel unter der Schwelle liegt", () => {
    const points = [point("2026-08-21", 74.2), point("2026-08-22", 73.8), point("2026-08-23", 73.6)];
    const res = evaluateRelease(rule(), points, at("2026-08-23"), TZ);
    expect(res.averageKg).toBe(73.9);
    expect(res.released).toBe(true);
    expect(res.reason).toBeNull();
  });

  it("zählt nur das KALENDER-Fenster — alte Werte ziehen das Mittel nicht mehr hoch", () => {
    const points = [point("2026-08-10", 80), point("2026-08-22", 73.8), point("2026-08-23", 73.6)];
    const res = evaluateRelease(rule(), points, at("2026-08-23"), TZ);
    expect(res.measurements).toBe(2);
    expect(res.averageKg).toBe(73.7);
    expect(res.released).toBe(true);
  });

  it("vor der Mindestlaufzeit öffnet nichts — zeigt aber schon, wo er steht", () => {
    const points = [point("2026-08-17", 73.0), point("2026-08-18", 72.8)];
    const res = evaluateRelease(
      rule({ notBeforeAt: at("2026-08-25"), armedAt: at("2026-08-16") }),
      points, at("2026-08-18"), TZ,
    );
    expect(res.released).toBe(false);
    expect(res.reason).toBe("not_yet");
    expect(res.averageKg).toBe(72.9);
    // Der Abstand steht auch während der Mindestlaufzeit — er ist der ganze Grund für die Anzeige.
    expect(res.remainingKg).toBe(0);
  });

  it("nennt den Abstand auch während der Mindestlaufzeit, wenn die Schwelle noch nicht hält", () => {
    const points = [point("2026-08-17", 75.0), point("2026-08-18", 74.6)];
    const res = evaluateRelease(
      rule({ notBeforeAt: at("2026-08-25"), armedAt: at("2026-08-16") }),
      points, at("2026-08-18"), TZ,
    );
    expect(res.reason).toBe("not_yet");
    expect(res.remainingKg).toBe(0.8);
  });

  it("bei Richtung above muss das Mittel DARÜBER liegen", () => {
    const points = [point("2026-08-22", 74.2), point("2026-08-23", 74.6)];
    const r = rule({ direction: "above" });
    expect(evaluateRelease(r, points, at("2026-08-23"), TZ).released).toBe(true);
    const tooLight = [point("2026-08-22", 73.2), point("2026-08-23", 73.6)];
    const res = evaluateRelease(r, tooLight, at("2026-08-23"), TZ);
    expect(res.released).toBe(false);
    expect(res.reason).toBe("below_threshold");
    expect(res.remainingKg).toBe(0.6);
  });

  it("genau auf der Schwelle reicht nicht: unter 74,0 heisst unter 74,0", () => {
    const points = [point("2026-08-22", 74.0), point("2026-08-23", 74.0)];
    expect(evaluateRelease(rule(), points, at("2026-08-23"), TZ).released).toBe(false);
  });

  it("mit Tagesanstieg öffnet dieselbe Reihe ein paar Tage später von selbst", () => {
    // Am Tag des Stellens gilt die Schwelle unverändert: 75,0 liegt über 74,0.
    const armed = rule({ stepKg: 0.5, armedAt: at("2026-08-23"), notBeforeAt: at("2026-08-23") });
    const points = [point("2026-08-22", 75.0), point("2026-08-23", 75.0)];
    expect(evaluateRelease(armed, points, at("2026-08-23"), TZ).released).toBe(false);
    // Dieselben Werte drei Tage später: die Schwelle steht inzwischen bei 75,5.
    const later = [point("2026-08-25", 75.0), point("2026-08-26", 75.0)];
    const res = evaluateRelease(armed, later, at("2026-08-26"), TZ);
    expect(res.thresholdKg).toBe(75.5);
    expect(res.released).toBe(true);
  });
});
