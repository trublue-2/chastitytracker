import { describe, it, expect } from "vitest";
import { periodOverlapRatio, proratedTargetH, periodBounds, proratedVorgabeTargets } from "./goalFulfillment";

const D = (s: string) => new Date(s);
const TZ = "Europe/Zurich";

describe("periodOverlapRatio", () => {
  const monthStart = D("2026-07-01T00:00:00Z");
  const monthEnd = D("2026-08-01T00:00:00Z"); // 31 Tage

  it("volle Abdeckung → 1 (Bestandsverhalten)", () => {
    expect(periodOverlapRatio(monthStart, monthEnd, D("2026-06-01T00:00:00Z"), null)).toBe(1);
    expect(periodOverlapRatio(monthStart, monthEnd, D("2026-07-01T00:00:00Z"), D("2026-08-01T00:00:00Z"))).toBe(1);
  });

  it("Vorgabe startet mitten in der Periode → anteilig", () => {
    // Start 17.07 → 15 der 31 Tage abgedeckt
    const r = periodOverlapRatio(monthStart, monthEnd, D("2026-07-17T00:00:00Z"), null);
    expect(r).toBeCloseTo(15 / 31, 6);
  });

  it("Vorgabe endet mitten in der Periode → anteilig", () => {
    // Ende 16.07 → 15 der 31 Tage abgedeckt (halb-offenes Intervall)
    const r = periodOverlapRatio(monthStart, monthEnd, D("2026-06-01T00:00:00Z"), D("2026-07-16T00:00:00Z"));
    expect(r).toBeCloseTo(15 / 31, 6);
  });

  it("kein Overlap → 0", () => {
    expect(periodOverlapRatio(monthStart, monthEnd, D("2026-05-01T00:00:00Z"), D("2026-06-01T00:00:00Z"))).toBe(0);
    expect(periodOverlapRatio(monthStart, monthEnd, D("2026-08-01T00:00:00Z"), null)).toBe(0);
  });

  it("Woche, Freitag-Start (User-Beispiel) → 3 von 7 Tagen (Fr/Sa/So)", () => {
    const weekStart = D("2026-07-06T00:00:00Z"); // Montag
    const weekEnd = D("2026-07-13T00:00:00Z");
    const r = periodOverlapRatio(weekStart, weekEnd, D("2026-07-10T00:00:00Z"), null); // Freitag
    expect(r).toBeCloseTo(3 / 7, 6);
  });

  it("degenerierte Periode (start==end) → 0", () => {
    expect(periodOverlapRatio(monthStart, monthStart, D("2026-01-01T00:00:00Z"), null)).toBe(0);
  });
});

describe("proratedTargetH", () => {
  const monthStart = D("2026-07-01T00:00:00Z");
  const monthEnd = D("2026-08-01T00:00:00Z");

  it("null-Ziel bleibt null", () => {
    expect(proratedTargetH(null, monthStart, monthEnd, { gueltigAb: monthStart, gueltigBis: null })).toBeNull();
    expect(proratedTargetH(undefined, monthStart, monthEnd, { gueltigAb: monthStart, gueltigBis: null })).toBeNull();
  });

  it("volle Abdeckung → Ziel unverändert", () => {
    expect(proratedTargetH(200, monthStart, monthEnd, { gueltigAb: D("2026-01-01T00:00:00Z"), gueltigBis: null })).toBe(200);
  });

  it("halbe Abdeckung → halbes Ziel", () => {
    // Start 17.07 → 15/31
    const t = proratedTargetH(310, monthStart, monthEnd, { gueltigAb: D("2026-07-17T00:00:00Z"), gueltigBis: null });
    expect(t).toBeCloseTo(310 * (15 / 31), 6);
  });

  it("kein Overlap → 0", () => {
    expect(proratedTargetH(200, monthStart, monthEnd, { gueltigAb: D("2026-09-01T00:00:00Z"), gueltigBis: null })).toBe(0);
  });
});

describe("periodBounds", () => {
  const now = D("2026-07-15T12:00:00Z"); // Mi 15. Juli 2026

  it("day: [Mitternacht, +24h)", () => {
    const { start, end } = periodBounds("day", now, TZ);
    expect(end.getTime() - start.getTime()).toBe(86_400_000);
    expect(start.getTime()).toBeLessThanOrEqual(now.getTime());
    expect(end.getTime()).toBeGreaterThan(now.getTime());
  });

  it("week: Montag-Start, 7 Tage lang, enthält now", () => {
    const { start, end } = periodBounds("week", now, TZ);
    expect(end.getTime() - start.getTime()).toBe(7 * 86_400_000);
    expect(start.getTime()).toBeLessThanOrEqual(now.getTime());
    expect(end.getTime()).toBeGreaterThan(now.getTime());
  });

  it("month: 1. Juli bis 1. August (Ortszeit)", () => {
    const { start, end } = periodBounds("month", now, TZ);
    expect(start.toISOString()).toBe("2026-06-30T22:00:00.000Z"); // 1. Juli 00:00 CEST
    expect(end.toISOString()).toBe("2026-07-31T22:00:00.000Z");   // 1. August 00:00 CEST
  });

  it("year: 1. Januar bis 1. Januar Folgejahr, 365 Tage (2026)", () => {
    const { start, end } = periodBounds("year", now, TZ);
    expect((end.getTime() - start.getTime()) / 86_400_000).toBe(365);
  });
});

describe("proratedVorgabeTargets", () => {
  const now = D("2026-07-15T12:00:00Z");
  const base = { minProTagH: 6, minProWocheH: 40, minProMonatH: 200, minProJahrH: 3000 };

  it("null-Vorgabe → alle Ziele null", () => {
    expect(proratedVorgabeTargets(null, now, TZ)).toEqual({
      minProTagH: null, minProWocheH: null, minProMonatH: null, minProJahrH: null,
    });
  });

  it("Vorgabe deckt alle aktuellen Perioden voll ab → Ziele unverändert", () => {
    const goal = { gueltigAb: D("2020-01-01T00:00:00Z"), gueltigBis: null, ...base };
    expect(proratedVorgabeTargets(goal, now, TZ)).toEqual(base);
  });

  it("Vorgabe komplett in der Vergangenheit → alle Ziele 0 (kein Overlap mit aktuellen Perioden)", () => {
    const goal = { gueltigAb: D("2020-01-01T00:00:00Z"), gueltigBis: D("2021-01-01T00:00:00Z"), ...base };
    expect(proratedVorgabeTargets(goal, now, TZ)).toEqual({
      minProTagH: 0, minProWocheH: 0, minProMonatH: 0, minProJahrH: 0,
    });
  });
});
