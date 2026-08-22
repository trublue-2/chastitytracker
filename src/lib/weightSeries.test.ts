import { describe, it, expect } from "vitest";
import { buildWeightSeries, dayNumber, movingAverage, type WeightPoint } from "./weightSeries";

const p = (dayKey: string, weightKg: number, inWindow = true): WeightPoint => ({ dayKey, weightKg, inWindow });
const NONE = { minKg: null, maxKg: null };

describe("dayNumber", () => {
  it("zählt aufeinanderfolgende Tage als aufeinanderfolgende Zahlen", () => {
    expect(dayNumber("2026-08-23") - dayNumber("2026-08-22")).toBe(1);
    // Über den Monatswechsel hinweg — der Grund, warum nicht auf dem Schlüssel-String verglichen wird.
    expect(dayNumber("2026-09-01") - dayNumber("2026-08-31")).toBe(1);
  });
});

describe("movingAverage", () => {
  it("mittelt über das Kalender-Fenster, nicht über die letzten Punkte", () => {
    const points = [p("2026-08-01", 80), p("2026-08-02", 82)];
    const trend = movingAverage(points);
    expect(trend[0].weightKg).toBe(80);
    expect(trend[1].weightKg).toBe(81);
  });

  it("zieht nach einer langen Lücke keinen alten Wert in die Gegenwart", () => {
    // Drei Wochen Pause: eine Zählung über „die letzten 7 Punkte" mittelte 80 und 90 zusammen und
    // zeigte 85 — einen Verlauf, den es nie gab.
    const points = [p("2026-07-01", 80), p("2026-07-02", 80), p("2026-08-01", 90)];
    const trend = movingAverage(points);
    expect(trend[2].weightKg).toBe(90);
  });

  it("glättet das Tagesrauschen", () => {
    const points = [p("2026-08-01", 80), p("2026-08-02", 82), p("2026-08-03", 78)];
    expect(movingAverage(points)[2].weightKg).toBe(80);
  });
});

describe("buildWeightSeries", () => {
  const all = [p("2026-07-01", 90), p("2026-08-20", 81), p("2026-08-21", 80), p("2026-08-22", 79)];
  const opts = { todayKey: "2026-08-22", subCorridor: NONE, keyholderCorridor: NONE };

  it("beschränkt auf den Zeitraum in Kalendertagen", () => {
    const s = buildWeightSeries(all, { ...opts, days: 30 });
    expect(s.points.map((x) => x.dayKey)).toEqual(["2026-08-20", "2026-08-21", "2026-08-22"]);
  });

  it("nimmt bei seit-Beginn alles", () => {
    expect(buildWeightSeries(all, { ...opts, days: null }).points).toHaveLength(4);
  });

  it("nennt den letzten Wert und die Veränderung im Zeitraum", () => {
    const s = buildWeightSeries(all, { ...opts, days: 30 });
    expect(s.latest?.weightKg).toBe(79);
    expect(s.changeKg).toBe(-2);
  });

  it("hat ohne zweiten Wert keine Veränderung — statt einer erfundenen Null", () => {
    const s = buildWeightSeries([p("2026-08-22", 79)], { ...opts, days: 30 });
    expect(s.changeKg).toBeNull();
  });

  it("lässt Messungen ausserhalb des Fensters aus dem Trend, behält sie aber als Punkte", () => {
    const mixed = [p("2026-08-21", 80), p("2026-08-22", 95, false)];
    const s = buildWeightSeries(mixed, { ...opts, days: 30 });
    expect(s.points).toHaveLength(2);
    expect(s.trend.map((t) => t.dayKey)).toEqual(["2026-08-21"]);
  });

  it("spannt die Achse so, dass der Korridor hineinpasst", () => {
    const s = buildWeightSeries([p("2026-08-22", 79)], {
      ...opts, days: 30, subCorridor: { minKg: 70, maxKg: 84 },
    });
    expect(s.minKg).toBe(70);
    expect(s.maxKg).toBe(84);
  });

  it("zeigt den WEITEREN Korridor — die Nachbesserung der Keyholderin lockert nur", () => {
    const s = buildWeightSeries([p("2026-08-22", 79)], {
      ...opts, days: 30, subCorridor: { minKg: null, maxKg: 84 }, keyholderCorridor: { minKg: null, maxKg: 87 },
    });
    expect(s.corridor.maxKg).toBe(87);
  });
});
