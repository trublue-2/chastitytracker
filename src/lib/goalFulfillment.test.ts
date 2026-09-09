import { describe, it, expect } from "vitest";
import type { GoalWindow } from "./goalFulfillment";
import {
  periodTarget, periodBounds, resolveGoalTargets, goalBoundaryInPeriod, hasVisibleGoalRow,
} from "./goalFulfillment";
import { weekdayMaskOf } from "./weekdays";

const D = (s: string) => new Date(s);
const TZ = "Europe/Zurich";

describe("periodTarget", () => {
  // Ortszeit-Grenzen (Europe/Zurich, Sommerzeit): 1. Juli 00:00 = 30.6. 22:00 UTC.
  const monthStart = D("2026-06-30T22:00:00Z");
  const monthEnd = D("2026-07-31T22:00:00Z");
  const full: GoalWindow = { gueltigAb: D("2026-01-01T00:00:00Z"), gueltigBis: null, validUntilManual: false };

  it("null-Ziel bleibt null und gilt nie als geteilt", () => {
    expect(periodTarget(null, monthStart, monthEnd, full, TZ)).toEqual({ targetH: null, changedInPeriod: false });
    expect(periodTarget(undefined, monthStart, monthEnd, full, TZ)).toEqual({ targetH: null, changedInPeriod: false });
  });

  it("volle Abdeckung → Ziel unverändert, Periode ungeteilt", () => {
    expect(periodTarget(200, monthStart, monthEnd, full, TZ)).toEqual({ targetH: 200, changedInPeriod: false });
  });

  it("Grenze in der Periode → gar kein Ziel, auch kein anteiliges", () => {
    // Vorher stand hier 310 × 15/31 = 150. Als Absolutwert neben Ist-Stunden der ganzen Periode
    // lud diese Zahl dazu ein, von Hand denselben Vergleich anzustellen, den der unterdrückte
    // Prozentwert schon vermied.
    expect(periodTarget(310, monthStart, monthEnd, { gueltigAb: D("2026-07-17T00:00:00Z"), gueltigBis: null, validUntilManual: false }, TZ))
      .toEqual({ targetH: null, changedInPeriod: true });
  });

  it("kein Overlap → 0, und NICHT geteilt (die Vorgabe berührt die Periode gar nicht)", () => {
    expect(periodTarget(200, monthStart, monthEnd, { gueltigAb: D("2026-09-01T00:00:00Z"), gueltigBis: null, validUntilManual: false }, TZ))
      .toEqual({ targetH: 0, changedInPeriod: false });
  });

  it("ohne Grenze in der Periode gibt es nur ganz oder gar nicht — nie einen Zwischenwert", () => {
    // Der Grund, warum das anteilige Ziel ersatzlos entfallen konnte: ein Anteil entstand
    // ausschliesslich in geteilten Perioden, und die bleiben ohnehin unbewertet.
    //
    // Jede Lage nennt ihren ERWARTETEN Wert, statt nur „einer von beiden" zuzusichern — sonst
    // bliebe eine vertauschte Abdeckungs-Prüfung unbemerkt.
    //
    // Was dieser Test NICHT leisten kann: eine Rückkehr zu `baseTargetH * ratio` in diesem Zweig
    // aufdecken. Ausserhalb einer geteilten Periode sind die beiden Formeln nicht bloss gleich
    // gross, sie sind dieselbe Funktion — der Anteil ist dort immer 0 oder 1. Genau das ist ja der
    // Grund, warum er entfallen konnte. Dass in der GETEILTEN Periode kein Anteil zurückkommt,
    // sichern die beiden Tests darüber und darunter.
    const faelle: [string, GoalWindow, number][] = [
      ["deckt weit über die Periode hinaus", full, 200],
      ["deckt sie genau ab", { gueltigAb: monthStart, gueltigBis: monthEnd, validUntilManual: false }, 200],
      ["beginnt erst danach", { gueltigAb: D("2026-09-01T00:00:00Z"), gueltigBis: null, validUntilManual: false }, 0],
      ["endete schon davor", { gueltigAb: D("2026-01-01T00:00:00Z"), gueltigBis: monthStart, validUntilManual: false }, 0],
    ];
    for (const [lage, goal, erwartet] of faelle) {
      const t = periodTarget(200, monthStart, monthEnd, goal, TZ);
      expect(t.changedInPeriod, lage).toBe(false);
      expect(t.targetH, lage).toBe(erwartet);
    }
  });

  it("ein angebrochener TAG bekommt kein Ziel", () => {
    const dayStart = D("2026-07-15T00:00:00Z");
    const dayEnd = D("2026-07-16T00:00:00Z");
    expect(periodTarget(15, dayStart, dayEnd, { gueltigAb: D("2026-07-15T12:00:00Z"), gueltigBis: null, validUntilManual: false }, TZ))
      .toEqual({ targetH: null, changedInPeriod: true });
  });

  it("ein Ziel, das GENAU an der Periodengrenze beginnt, teilt sie nicht", () => {
    // Der Normalfall aus Regel 1: ohne validFrom startet ein Ziel an der nächsten Mitternacht.
    expect(periodTarget(200, monthStart, monthEnd, { gueltigAb: monthStart, gueltigBis: null, validUntilManual: false }, TZ))
      .toEqual({ targetH: 200, changedInPeriod: false });
    expect(periodTarget(200, monthStart, monthEnd, { gueltigAb: D("2026-06-01T00:00:00Z"), gueltigBis: monthEnd, validUntilManual: false }, TZ))
      .toEqual({ targetH: 200, changedInPeriod: false });
  });

  it("auch ein ENDE mitten in der Periode teilt sie", () => {
    expect(periodTarget(200, monthStart, monthEnd, { gueltigAb: D("2026-06-01T00:00:00Z"), gueltigBis: D("2026-07-16T00:00:00Z"), validUntilManual: false }, TZ))
      .toEqual({ targetH: null, changedInPeriod: true });
  });

  it("ein manuell auf den LETZTEN Tag der Periode datiertes Ende deckt sie voll ab", () => {
    // „gültig bis 31.7." meint den 31.7. EINSCHLIESSLICH → bis 1.8. 00:00 Ortszeit = Periodenende.
    // Ohne die einschliessende Lesart fiele das Ende einen Tag zu kurz aus und teilte den Monat.
    const bisJul31 = D("2026-07-31T00:00:00Z"); // 31.7. (Uhrzeit egal, `goalEffectiveEndMs` rundet auf den Tag)
    expect(periodTarget(200, monthStart, monthEnd, { gueltigAb: monthStart, gueltigBis: bisJul31, validUntilManual: true }, TZ))
      .toEqual({ targetH: 200, changedInPeriod: false });
    // Dasselbe Enddatum als AUTOMATISCH VERKETTETER Übergabepunkt bleibt exklusiv → Monat geteilt.
    expect(periodTarget(200, monthStart, monthEnd, { gueltigAb: monthStart, gueltigBis: bisJul31, validUntilManual: false }, TZ))
      .toEqual({ targetH: null, changedInPeriod: true });
  });
});

describe("goalBoundaryInPeriod", () => {
  const start = D("2026-07-01T00:00:00Z");
  const end = D("2026-08-01T00:00:00Z");

  it("Grenzen der Periode zählen nicht als innen", () => {
    expect(goalBoundaryInPeriod(start, end, { gueltigAb: start, gueltigBis: end, validUntilManual: false }, TZ)).toBe(false);
  });

  it("eine Vorgabe ganz ausserhalb teilt nichts", () => {
    expect(goalBoundaryInPeriod(start, end, { gueltigAb: D("2026-09-01T00:00:00Z"), gueltigBis: null, validUntilManual: false }, TZ)).toBe(false);
    expect(goalBoundaryInPeriod(start, end, { gueltigAb: D("2026-01-01T00:00:00Z"), gueltigBis: D("2026-02-01T00:00:00Z"), validUntilManual: false }, TZ)).toBe(false);
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

describe("resolveGoalTargets", () => {
  const now = D("2026-07-15T12:00:00Z");
  const base = { minProTagH: 6, minProWocheH: 40, minProMonatH: 200, minProJahrH: 3000 };
  const VIER = { day: 6, week: 40, month: 200 };
  const KEINE = { day: null, week: null, month: null };
  const UNGETEILT = { day: false, week: false, month: false };

  it("null-Vorgabe → alle Ziele null", () => {
    expect(resolveGoalTargets(null, now, TZ)).toEqual({ targetH: KEINE, changedInPeriod: UNGETEILT });
  });

  it("Vorgabe deckt alle aktuellen Perioden voll ab → Ziele unverändert", () => {
    const goal = { gueltigAb: D("2020-01-01T00:00:00Z"), gueltigBis: null, validUntilManual: false, ...base };
    expect(resolveGoalTargets(goal, now, TZ)).toEqual({ targetH: VIER, changedInPeriod: UNGETEILT });
  });

  it("Vorgabe komplett in der Vergangenheit → alle Ziele 0 (kein Overlap mit aktuellen Perioden)", () => {
    const goal = { gueltigAb: D("2020-01-01T00:00:00Z"), gueltigBis: D("2021-01-01T00:00:00Z"), validUntilManual: false, ...base };
    const NULLEN = { day: 0, week: 0, month: 0 };
    expect(resolveGoalTargets(goal, now, TZ)).toEqual({ targetH: NULLEN, changedInPeriod: UNGETEILT });
  });

  it("der Vorfall vom 23.08.2026: Ziel 15/90/390 am Sonntag um 09:54 gesetzt", () => {
    // Sonntag ist der LETZTE Tag der ISO-Woche — von ihr blieben 14.1 der 168 Stunden.
    // Alt: goalWeekH 7.55 gegen die vollen 76.5 Ist-Stunden der Woche = 1013 %.
    const goal = {
      gueltigAb: D("2026-08-23T07:54:00Z"), gueltigBis: null, validUntilManual: false,   // 09:54 Ortszeit
      minProTagH: 15, minProWocheH: 90, minProMonatH: 390, minProJahrH: null,
    };
    const t = resolveGoalTargets(goal, D("2026-08-23T09:08:00Z"), TZ);
    // Bewertet wird in KEINER der drei geteilten Perioden — weder mit Prozentwert noch mit einem
    // anteiligen Ziel als Absolutwert. Vorher stand hier goalWeekH 7.55 neben week 76.5.
    expect(t.targetH).toEqual({ day: null, week: null, month: null });
    expect(t.changedInPeriod).toEqual({ day: true, week: true, month: true });
    // Das JAHR bleibt false, obwohl die Vorgabe mitten in ihm beginnt: es hat gar kein Ziel
    // (minProJahrH null). Wo nichts bewertet wird, gibt es auch nichts zu unterdrücken.
    expect(hasVisibleGoalRow(t.targetH)).toBe(false);
  });

  it("dasselbe Ziel am Folgetag: der Tag zählt wieder voll", () => {
    const goal = {
      gueltigAb: D("2026-08-23T07:54:00Z"), gueltigBis: null, validUntilManual: false,
      minProTagH: 15, minProWocheH: 90, minProMonatH: 390, minProJahrH: null,
    };
    const t = resolveGoalTargets(goal, D("2026-08-24T09:00:00Z"), TZ);
    expect(t.targetH.day).toBe(15);
    // Die neue Woche beginnt am Montag → auch sie ist wieder ungeteilt und voll.
    expect(t.targetH.week).toBe(90);
    expect(t.changedInPeriod).toEqual({ day: false, week: false, month: true });
    // Der August trägt die Grenze weiterhin — also kein Ziel für den Monat.
    expect(t.targetH.month).toBeNull();
    expect(hasVisibleGoalRow(t.targetH)).toBe(true);
  });

  it("ein Ziel, das an der nächsten Mitternacht startet (Regel 1), teilt Tag und Woche nicht", () => {
    const goal = {
      gueltigAb: D("2026-08-23T22:00:00Z"), gueltigBis: null, validUntilManual: false,   // 24.08. 00:00 Ortszeit, ein Montag
      minProTagH: 15, minProWocheH: 90, minProMonatH: 390, minProJahrH: null,
    };
    const t = resolveGoalTargets(goal, D("2026-08-24T09:00:00Z"), TZ);
    expect(t.targetH.day).toBe(15);
    expect(t.targetH.week).toBe(90);
    expect(t.changedInPeriod).toEqual({ day: false, week: false, month: true });
  });

  it("Wochentag-Ausnahmen: das TAGES-Soll folgt dem Wochentag, Woche bleibt der Summenwert", () => {
    // Basis 6 h, Sa/So 16 h, Montag Ruhetag (0). Woche/Monat/Jahr unberührt.
    const goal = {
      gueltigAb: D("2020-01-01T00:00:00Z"), gueltigBis: null, validUntilManual: false,
      minProTagH: 6, minProWocheH: 40, minProMonatH: null, minProJahrH: null,
      minProTagWochentage: JSON.stringify([
        { days: weekdayMaskOf([6, 7]), hours: 16 },
        { days: weekdayMaskOf([1]), hours: 0 },
      ]),
    };
    expect(resolveGoalTargets(goal, D("2026-08-22T09:00:00Z"), TZ).targetH.day).toBe(16); // Samstag
    expect(resolveGoalTargets(goal, D("2026-08-25T09:00:00Z"), TZ).targetH.day).toBe(6);  // Dienstag = Basis
    const montag = resolveGoalTargets(goal, D("2026-08-24T09:00:00Z"), TZ);
    expect(montag.targetH.day).toBe(0);   // Ruhetag (gesetzte 0), nicht Basis
    expect(montag.targetH.week).toBe(40); // Perioden-Summe unangetastet
  });

  it("rückwärtskompatibel: eine Vorgabe ohne Ausnahmen-Feld verhält sich wie bisher", () => {
    const goal = { gueltigAb: D("2020-01-01T00:00:00Z"), gueltigBis: null, validUntilManual: false, ...base };
    expect(resolveGoalTargets(goal, now, TZ)).toEqual({ targetH: VIER, changedInPeriod: UNGETEILT });
  });

});

// Die JAHRES-Fälle (anteilige Segment-Summe, einschliessendes Enddatum) stehen in
// `goalYear.test.ts` — `resolveGoalTargets` löst das Jahr bewusst nicht mehr auf.
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
