import { describe, it, expect } from "vitest";
import {
  periodOverlapRatio, periodTarget, periodBounds, proratedVorgabeTargets,
  goalBoundaryInPeriod, hasVisibleGoalRow,
} from "./goalFulfillment";

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

describe("periodTarget", () => {
  const monthStart = D("2026-07-01T00:00:00Z");
  const monthEnd = D("2026-08-01T00:00:00Z");
  const full = { gueltigAb: D("2026-01-01T00:00:00Z"), gueltigBis: null };

  it("null-Ziel bleibt null und gilt nie als geteilt", () => {
    expect(periodTarget(null, "month", monthStart, monthEnd, full)).toEqual({ targetH: null, displayH: null, changedInPeriod: false });
    expect(periodTarget(undefined, "month", monthStart, monthEnd, full)).toEqual({ targetH: null, displayH: null, changedInPeriod: false });
  });

  it("volle Abdeckung → Ziel unverändert, Periode ungeteilt", () => {
    expect(periodTarget(200, "month", monthStart, monthEnd, full)).toEqual({ targetH: 200, displayH: 200, changedInPeriod: false });
  });

  it("halbe Abdeckung → das anteilige Ziel steht nur noch in displayH, nicht mehr in targetH", () => {
    // Der Kern der Umkehrung: wer rechnet, greift targetH und bekommt null. Wer anzeigt, greift
    // displayH und bekommt die 150 Stunden, die neben den Ist-Stunden stehen dürfen.
    const t = periodTarget(310, "month", monthStart, monthEnd, { gueltigAb: D("2026-07-17T00:00:00Z"), gueltigBis: null });
    expect(t.targetH).toBeNull();
    expect(t.displayH).toBeCloseTo(310 * 15 / 31, 6);
    expect(t.changedInPeriod).toBe(true);
  });

  it("kein Overlap → 0, und NICHT geteilt (die Vorgabe berührt die Periode gar nicht)", () => {
    expect(periodTarget(200, "month", monthStart, monthEnd, { gueltigAb: D("2026-09-01T00:00:00Z"), gueltigBis: null }))
      .toEqual({ targetH: 0, displayH: 0, changedInPeriod: false });
  });

  it("Regel 3: ein angebrochener TAG bekommt gar kein Ziel statt eines gekürzten", () => {
    const dayStart = D("2026-07-15T00:00:00Z");
    const dayEnd = D("2026-07-16T00:00:00Z");
    const startsMidday = { gueltigAb: D("2026-07-15T12:00:00Z"), gueltigBis: null };
    expect(periodTarget(15, "day", dayStart, dayEnd, startsMidday)).toEqual({ targetH: null, displayH: null, changedInPeriod: true });
    // Woche/Monat zeigen dagegen weiterhin ihr anteiliges Ziel — bewertet wird auch dort nicht.
    const week = periodTarget(15, "week", dayStart, dayEnd, startsMidday);
    expect(week.targetH).toBeNull();
    expect(week.displayH).toBeCloseTo(7.5, 6);
  });

  it("ein Ziel, das GENAU an der Periodengrenze beginnt, teilt sie nicht", () => {
    // Der Normalfall aus Regel 1: ohne validFrom startet ein Ziel an der nächsten Mitternacht.
    expect(periodTarget(200, "month", monthStart, monthEnd, { gueltigAb: monthStart, gueltigBis: null }))
      .toEqual({ targetH: 200, displayH: 200, changedInPeriod: false });
    expect(periodTarget(200, "month", monthStart, monthEnd, { gueltigAb: D("2026-06-01T00:00:00Z"), gueltigBis: monthEnd }))
      .toEqual({ targetH: 200, displayH: 200, changedInPeriod: false });
  });

  it("auch ein ENDE mitten in der Periode teilt sie", () => {
    const t = periodTarget(200, "month", monthStart, monthEnd, { gueltigAb: D("2026-06-01T00:00:00Z"), gueltigBis: D("2026-07-16T00:00:00Z") });
    expect(t.changedInPeriod).toBe(true);
    expect(t.targetH).toBeNull();
    expect(t.displayH).toBeCloseTo(200 * 15 / 31, 6);
  });
});

describe("goalBoundaryInPeriod", () => {
  const start = D("2026-07-01T00:00:00Z");
  const end = D("2026-08-01T00:00:00Z");

  it("Grenzen der Periode zählen nicht als innen", () => {
    expect(goalBoundaryInPeriod(start, end, { gueltigAb: start, gueltigBis: end })).toBe(false);
  });

  it("eine Vorgabe ganz ausserhalb teilt nichts", () => {
    expect(goalBoundaryInPeriod(start, end, { gueltigAb: D("2026-09-01T00:00:00Z"), gueltigBis: null })).toBe(false);
    expect(goalBoundaryInPeriod(start, end, { gueltigAb: D("2026-01-01T00:00:00Z"), gueltigBis: D("2026-02-01T00:00:00Z") })).toBe(false);
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
  const VIER = { day: 6, week: 40, month: 200, year: 3000 };
  const KEINE = { day: null, week: null, month: null, year: null };
  const UNGETEILT = { day: false, week: false, month: false, year: false };

  it("null-Vorgabe → alle Ziele null", () => {
    expect(proratedVorgabeTargets(null, now, TZ)).toEqual({
      targetH: KEINE, displayH: KEINE, changedInPeriod: UNGETEILT,
    });
  });

  it("Vorgabe deckt alle aktuellen Perioden voll ab → Ziele unverändert", () => {
    const goal = { gueltigAb: D("2020-01-01T00:00:00Z"), gueltigBis: null, ...base };
    expect(proratedVorgabeTargets(goal, now, TZ)).toEqual({
      targetH: VIER, displayH: VIER, changedInPeriod: UNGETEILT,
    });
  });

  it("Vorgabe komplett in der Vergangenheit → alle Ziele 0 (kein Overlap mit aktuellen Perioden)", () => {
    const goal = { gueltigAb: D("2020-01-01T00:00:00Z"), gueltigBis: D("2021-01-01T00:00:00Z"), ...base };
    const NULLEN = { day: 0, week: 0, month: 0, year: 0 };
    expect(proratedVorgabeTargets(goal, now, TZ)).toEqual({
      targetH: NULLEN, displayH: NULLEN, changedInPeriod: UNGETEILT,
    });
  });

  it("der Vorfall vom 23.08.2026: Ziel 15/90/390 am Sonntag um 09:54 gesetzt", () => {
    // Sonntag ist der LETZTE Tag der ISO-Woche — von ihr blieben 14.1 der 168 Stunden.
    // Alt: goalWeekH 7.55 gegen die vollen 76.5 Ist-Stunden der Woche = 1013 %.
    const goal = {
      gueltigAb: D("2026-08-23T07:54:00Z"), gueltigBis: null,   // 09:54 Ortszeit
      minProTagH: 15, minProWocheH: 90, minProMonatH: 390, minProJahrH: null,
    };
    const t = proratedVorgabeTargets(goal, D("2026-08-23T09:08:00Z"), TZ);
    // Bewertet wird in KEINER der drei geteilten Perioden — daher auch kein Prozentwert.
    expect(t.targetH).toEqual({ day: null, week: null, month: null, year: null });
    // Der Tag zeigt nach Regel 3 auch keinen Anteil; Woche und Monat zeigen ihren.
    expect(t.displayH.day).toBeNull();
    expect(t.displayH.week).toBeCloseTo(90 * 14.1 / 168, 2);
    expect(t.changedInPeriod).toEqual({ day: true, week: true, month: true, year: false });
    // Das JAHR bleibt false, obwohl die Vorgabe mitten in ihm beginnt: es hat gar kein Ziel
    // (minProJahrH null). Wo nichts bewertet wird, gibt es auch nichts zu unterdrücken.
    expect(hasVisibleGoalRow(t.targetH)).toBe(false);
  });

  it("dasselbe Ziel am Folgetag: der Tag zählt wieder voll", () => {
    const goal = {
      gueltigAb: D("2026-08-23T07:54:00Z"), gueltigBis: null,
      minProTagH: 15, minProWocheH: 90, minProMonatH: 390, minProJahrH: null,
    };
    const t = proratedVorgabeTargets(goal, D("2026-08-24T09:00:00Z"), TZ);
    expect(t.targetH.day).toBe(15);
    // Die neue Woche beginnt am Montag → auch sie ist wieder ungeteilt und voll.
    expect(t.targetH.week).toBe(90);
    expect(t.changedInPeriod).toEqual({ day: false, week: false, month: true, year: false });
    // Der August trägt die Grenze weiterhin: kein Nenner, aber ein Anzeige-Anteil.
    expect(t.targetH.month).toBeNull();
    expect(t.displayH.month).toBeGreaterThan(0);
    expect(hasVisibleGoalRow(t.targetH)).toBe(true);
  });

  it("ein Ziel, das an der nächsten Mitternacht startet (Regel 1), teilt Tag und Woche nicht", () => {
    const goal = {
      gueltigAb: D("2026-08-23T22:00:00Z"), gueltigBis: null,   // 24.08. 00:00 Ortszeit, ein Montag
      minProTagH: 15, minProWocheH: 90, minProMonatH: 390, minProJahrH: null,
    };
    const t = proratedVorgabeTargets(goal, D("2026-08-24T09:00:00Z"), TZ);
    expect(t.targetH.day).toBe(15);
    expect(t.targetH.week).toBe(90);
    expect(t.changedInPeriod).toEqual({ day: false, week: false, month: true, year: false });
  });
});

describe("hasVisibleGoalRow", () => {
  it("eine Vorgabe mit Zielen kann trotzdem KEINE bewertbare Zeile haben", () => {
    expect(hasVisibleGoalRow({ day: 6, week: null, month: null, year: null })).toBe(true);
    expect(hasVisibleGoalRow({ day: null, week: null, month: null, year: null })).toBe(false);
  });

  it("ein Ziel von 0 gilt nicht als Zeile — wie in goalPct", () => {
    // Ein anteiliges Ziel von 0 heisst „deckt diese Periode nicht ab", nicht „zu 100 % erfüllt".
    // Mit `!= null` hätte diese Funktion Sichtbarkeit behauptet und die Zeile sich weggerendert.
    expect(hasVisibleGoalRow({ day: 0, week: 0, month: 0, year: 0 })).toBe(false);
  });
});
