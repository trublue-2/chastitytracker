import { describe, it, expect } from "vitest";
import { resolveYearGoal, resolveGoalTargetsWithYear, type YearGoalSegment } from "./goalYear";
import type { WearPair } from "./utils";

const D = (s: string) => new Date(s);
const TZ = "Europe/Zurich";

/** `now` = Mo 31.08.2026, 14:00 Ortszeit. 243 Tage des Jahres sind vorbei, 122 liegen noch an. */
const NOW = D("2026-08-31T12:00:00Z");

// Ortszeit-Mitternachte als Instants. Januar/Februar/Dezember = CET (UTC+1), Juni = CEST (UTC+2).
const JAN_1 = D("2025-12-31T23:00:00Z"); // 01.01.2026 00:00
const MAR_1 = D("2026-02-28T23:00:00Z"); // 01.03.2026 00:00
const APR_1 = D("2026-03-31T22:00:00Z"); // 01.04.2026 00:00
const JUN_1 = D("2026-05-31T22:00:00Z"); // 01.06.2026 00:00
const DEZ_31 = D("2026-12-30T23:00:00Z"); // 31.12.2026 00:00

/** 30 % ≙ 2628 h/Jahr, 50 % ≙ 4380 h/Jahr (Anteil von 8760 h). */
const H30 = 2628;
const H50 = 4380;

const seg = (gueltigAb: Date, gueltigBis: Date | null, minProJahrH: number | null, validUntilManual = false): YearGoalSegment =>
  ({ gueltigAb, gueltigBis, validUntilManual, minProJahrH });

/** Das aktive Ziel — nur `minProJahrH` entscheidet über die Sichtbarkeit. */
const active = (minProJahrH: number | null) =>
  ({ minProTagH: null, minProWocheH: null, minProMonatH: null, minProJahrH });

/** Durchgehend getragen vom Jahresanfang bis `now` — macht die Fenster-Grenzen im Ist sichtbar. */
const GANZES_JAHR: WearPair[] = [{ start: JAN_1, end: NOW }];

describe("resolveYearGoal", () => {
  it("Fall 1: ein Ziel über das ganze Jahr → voller Jahreswert", () => {
    const r = resolveYearGoal(active(H50), [seg(JAN_1, null, H50)], GANZES_JAHR, NOW, TZ);
    expect(r.targetH).toBeCloseTo(H50, 6);
    // Ist = die ganze verstrichene Zeit des Jahres (durchgehend getragen).
    expect(r.actualH).toBeCloseTo(5821, 0);
  });

  it("Fall 3: ein Ziel ab 1.6. → anteilig auf sein eigenes Fenster, Ist erst ab 1.6.", () => {
    const r = resolveYearGoal(active(H50), [seg(JUN_1, null, H50)], GANZES_JAHR, NOW, TZ);
    // 214 von 365 Tagen: 4380 × 214/365 = 2568
    expect(r.targetH).toBeCloseTo(2568, 6);
    // Jan–Mai zählen NICHT mit, obwohl durchgehend getragen wurde.
    expect(r.actualH).toBeCloseTo(2198, 0);
  });

  it("Fall 2: 30 % ab 1.1., ab 1.6. auf 50 % erhöht → Mischrechnung über beide Segmente", () => {
    // Die alte Vorgabe wird von `reorderVorgabenDates` auf den Start der neuen verkettet
    // (`validUntilManual: false` → exklusiver Übergabepunkt, keine Überlappung).
    const segments = [seg(JAN_1, JUN_1, H30), seg(JUN_1, null, H50)];
    const r = resolveYearGoal(active(H50), segments, GANZES_JAHR, NOW, TZ);
    // 2628 × 151/365 + 4380 × 214/365 = 1087.2 + 2568
    expect(r.targetH).toBeCloseTo(3655.2, 4);
    // Lückenlos abgedeckt → Ist zählt ab 1.1.
    expect(r.actualH).toBeCloseTo(5821, 0);
  });

  it("die Vorgeschichte ist der EINZIGE Unterschied zwischen Fall 2 und Fall 3", () => {
    // Der Sep–Dez-Anteil (50 %) ist in beiden identisch; Fall 2 trägt zusätzlich die 30 %-Phase.
    const nurAktiv = resolveYearGoal(active(H50), [seg(JUN_1, null, H50)], GANZES_JAHR, NOW, TZ);
    const gemischt = resolveYearGoal(active(H50), [seg(JAN_1, JUN_1, H30), seg(JUN_1, null, H50)], GANZES_JAHR, NOW, TZ);
    expect(gemischt.targetH! - nurAktiv.targetH!).toBeCloseTo((H30 * 151) / 365, 6);
  });

  it("Lücke im Jahr: Tage ohne Ziel zählen weder ins Soll noch ins Ist", () => {
    // Ziel Jan–Feb, dann NICHTS bis Ende Mai, dann ab 1.6. wieder eines.
    const segments = [seg(JAN_1, MAR_1, H30), seg(JUN_1, null, H50)];
    const r = resolveYearGoal(active(H50), segments, GANZES_JAHR, NOW, TZ);
    // 59 Tage (Jan+Feb) + 214 Tage (Jun–Dez); März–Mai fehlen im Nenner.
    expect(r.targetH).toBeCloseTo((H30 * 59) / 365 + (H50 * 214) / 365, 6);
    // Und im Zähler ebenso: die Trage-Zeit von März bis Mai fällt heraus.
    const janFeb = (MAR_1.getTime() - JAN_1.getTime()) / 3_600_000;
    const junBisNow = (NOW.getTime() - JUN_1.getTime()) / 3_600_000;
    expect(r.actualH).toBeCloseTo(janFeb + junBisNow, 6);
  });

  it("ein Trage-Paar, das komplett in der Lücke liegt, zählt gar nicht", () => {
    const segments = [seg(JUN_1, null, H50)];
    const nurInDerLuecke: WearPair[] = [{ start: MAR_1, end: APR_1 }];
    const r = resolveYearGoal(active(H50), segments, nurInDerLuecke, NOW, TZ);
    expect(r.targetH).toBeCloseTo(2568, 6);
    expect(r.actualH).toBe(0);
  });

  it("ein manuell auf den 31.12. datiertes Ende deckt das Jahr voll ab", () => {
    // Der Kern-Fix (einschliessendes Enddatum) trägt in die Aggregation hinein.
    const r = resolveYearGoal(active(H50), [seg(JAN_1, DEZ_31, H50, true)], GANZES_JAHR, NOW, TZ);
    expect(r.targetH).toBeCloseTo(H50, 6);
  });

  it("kein Jahresziel auf dem AKTIVEN Ziel → keine Zeile, egal was früher galt", () => {
    // Regel 1: die Sichtbarkeit hängt am aktiven Ziel, nicht an der Vorgeschichte.
    const segments = [seg(JAN_1, JUN_1, H30), seg(JUN_1, null, null)];
    const r = resolveYearGoal(active(null), segments, GANZES_JAHR, NOW, TZ);
    expect(r).toEqual({ targetH: null, actualH: 0 });
  });

  it("ein Segment OHNE eigenes Jahresziel steuert weder Tage noch Soll bei", () => {
    // Regel 2 („jedes Ziel für sich"): die zielllose Phase Jan–Mai verwässert die Quote nicht.
    const segments = [seg(JAN_1, JUN_1, null), seg(JUN_1, null, H50)];
    const r = resolveYearGoal(active(H50), segments, GANZES_JAHR, NOW, TZ);
    expect(r.targetH).toBeCloseTo(2568, 6);
    expect(r.actualH).toBeCloseTo(2198, 0);
  });

  it("Zeitumstellung: gezählt werden KALENDERTAGE, nicht 24-Stunden-Blöcke", () => {
    // Der März 2026 enthält die Sommerzeit-Wende (29.03.) und hat nur 743 statt 744 Stunden.
    // Über Millisekunden gerechnet ergäbe das 30.958 statt 31 Tage → 309.58 statt 310.
    const r = resolveYearGoal(active(3650), [seg(MAR_1, APR_1, 3650)], [], NOW, TZ);
    expect(r.targetH).toBeCloseTo((3650 * 31) / 365, 6);
    expect(r.targetH).toBeCloseTo(310, 6);
  });

  it("Segmente aus anderen Jahren und ohne Überlappung fallen heraus", () => {
    const segments = [
      seg(D("2024-01-01T00:00:00Z"), D("2025-01-01T00:00:00Z"), H50), // ganz in 2024
      seg(JUN_1, null, H50),
    ];
    const r = resolveYearGoal(active(H50), segments, GANZES_JAHR, NOW, TZ);
    expect(r.targetH).toBeCloseTo(2568, 6);
  });

  it("Zähler und Nenner kommen aus demselben Fenster (Regressionswächter 23.08.2026)", () => {
    // Der 1013-%-Bug entstand, weil der Nenner gekürzt und der Zähler voll gelassen wurde.
    // Bei durchgehendem Tragen darf die Quote deshalb nie über 100 % des VERSTRICHENEN Anteils
    // hinausschiessen: 2198 h Ist gegen 2568 h Soll ist plausibel, 5821 gegen 2568 wäre der Bug.
    const r = resolveYearGoal(active(H50), [seg(JUN_1, null, H50)], GANZES_JAHR, NOW, TZ);
    expect(r.actualH).toBeLessThan(r.targetH!);
    expect(r.actualH).toBeCloseTo(2198, 0);
  });

  it("überlappende Segmente (manuelles Ende!) zählen den geteilten Monat nur EINMAL", () => {
    // `reorderVorgabenDates` kürzt eine Vorgabe mit manuellem Enddatum NICHT auf den Start der
    // nächsten. A „bis 30.6." (einschliessend → 1.7.) und B ab 1.6. überlappen also im Juni.
    const JUN_30 = D("2026-06-29T22:00:00Z"); // 30.06.2026 00:00 Ortszeit
    const segments = [seg(JAN_1, JUN_30, H30, true), seg(JUN_1, null, H50)];
    const r = resolveYearGoal(active(H50), segments, GANZES_JAHR, NOW, TZ);
    // Der Juni gehört der SPÄTER begonnenen Vorgabe (B) — genau der, die auch `getActiveVorgabe`
    // wählt. A bleibt auf Jan–Mai: 151 + 214 = 365 Tage, nicht 181 + 214 = 395.
    expect(r.targetH).toBeCloseTo((H30 * 151) / 365 + (H50 * 214) / 365, 6);
    // Und der Ist zählt den Juni einmal, nicht doppelt: durchgehend getragen = das ganze Jahr.
    expect(r.actualH).toBeCloseTo(5821, 0);
  });

  it("eine spätere Vorgabe OHNE Jahresziel nimmt der früheren ihre Tage weg", () => {
    // Ab 1.6. gilt eine Vorgabe ohne Jahresziel → für Juni–Dezember verlangt das Jahr nichts mehr,
    // auch wenn die überlappende ältere (manuelles Ende) bis Ende Jahr liefe.
    const segments = [seg(JAN_1, DEZ_31, H30, true), seg(JUN_1, null, null)];
    const r = resolveYearGoal(active(H30), segments, GANZES_JAHR, NOW, TZ);
    expect(r.targetH).toBeCloseTo((H30 * 151) / 365, 6);
  });

  it("ohne Segmente gibt es keine Zeile", () => {
    expect(resolveYearGoal(active(H50), [], GANZES_JAHR, NOW, TZ)).toEqual({ targetH: null, actualH: 0 });
  });
});

describe("resolveGoalTargetsWithYear", () => {
  /** Aktives Ziel mit allen vier Perioden, gültig ab 1.6. — deckt Tag/Woche/Monat voll ab. */
  const aktiv = {
    gueltigAb: JUN_1, gueltigBis: null, validUntilManual: false,
    minProTagH: 16, minProWocheH: 112, minProMonatH: 480, minProJahrH: H50,
  };

  it("Tag/Woche/Monat bleiben unverändert, nur das Jahr wird aggregiert", () => {
    const segments = [seg(JAN_1, JUN_1, H30), seg(JUN_1, null, H50)];
    const r = resolveGoalTargetsWithYear(aktiv, segments, GANZES_JAHR, NOW, TZ);
    expect(r.goal.targetH.day).toBe(16);
    expect(r.goal.targetH.week).toBe(112);
    expect(r.goal.targetH.month).toBe(480);
    // Das Jahr trägt die Mischung aus 30 % (Jan–Mai) und 50 % (Jun–Dez).
    expect(r.goal.targetH.year).toBeCloseTo(3655.2, 4);
    expect(r.yearActualH).toBeCloseTo(5821, 0);
    // Ein „geteiltes" Jahr gibt es nicht mehr.
    expect(r.goal.changedInPeriod.year).toBe(false);
  });

  it("ohne bewertbare Jahres-Zeile fällt der Ist auf die schlichte Jahres-Tragezeit zurück", () => {
    // Sonst verschwände die Jahres-Tragezeit als reine Kennzahl aus der Anzeige (eine 0 stünde dort
    // falsch). Der Rückfall zählt bewusst das GANZE Jahr — es gibt ja kein Fenster, das ihn begrenzt.
    const ohneJahr = { ...aktiv, minProJahrH: null };
    const r = resolveGoalTargetsWithYear(ohneJahr, [seg(JUN_1, null, null)], GANZES_JAHR, NOW, TZ);
    expect(r.goal.targetH.year).toBeNull();
    expect(r.yearActualH).toBeCloseTo(5821, 0);
  });
});
