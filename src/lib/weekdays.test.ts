import { describe, it, expect } from "vitest";
import {
  ALL_WEEKDAYS, datedWindowLabel, isoWeekdayInTZ, parseWeekdayMask, toggleWeekday,
  weekdayMaskHas, weekdayMaskOf, weekdayMaskValid,
} from "./weekdays";

describe("Wochentags-Maske", () => {
  it("zählt nach ISO: Montag ist das erste Bit, Sonntag das siebte", () => {
    expect(weekdayMaskOf([1])).toBe(1);
    expect(weekdayMaskOf([7])).toBe(64);
    expect(weekdayMaskOf([1, 2, 3, 4, 5, 6, 7])).toBe(ALL_WEEKDAYS);
  });

  it("beantwortet die Zugehörigkeit je Tag", () => {
    const werktags = weekdayMaskOf([1, 2, 3, 4, 5]);
    expect(weekdayMaskHas(werktags, 3)).toBe(true);
    expect(weekdayMaskHas(werktags, 6)).toBe(false);
  });

  it("schaltet einen Tag um, ohne die anderen anzufassen", () => {
    expect(toggleWeekday(ALL_WEEKDAYS, 7)).toBe(weekdayMaskOf([1, 2, 3, 4, 5, 6]));
    expect(toggleWeekday(toggleWeekday(ALL_WEEKDAYS, 7), 7)).toBe(ALL_WEEKDAYS);
  });
});

describe("isoWeekdayInTZ", () => {
  it("nennt den Wochentag in der Zone des Trägers", () => {
    // 22.08.2026 ist ein Samstag.
    expect(isoWeekdayInTZ(new Date("2026-08-22T10:00:00Z"), "Europe/Zurich")).toBe(6);
  });

  it("rechnet über die Tagesgrenze hinweg richtig", () => {
    // 23:30 UTC am Samstag ist in Zürich (Sommerzeit) bereits Sonntag, 01:30.
    expect(isoWeekdayInTZ(new Date("2026-08-22T23:30:00Z"), "Europe/Zurich")).toBe(7);
    // Derselbe Augenblick ist in New York noch Samstag, 19:30.
    expect(isoWeekdayInTZ(new Date("2026-08-22T23:30:00Z"), "America/New_York")).toBe(6);
  });
});

describe("Bestand und Schreib-Regel", () => {
  it("fällt bei Murks auf ALLE Tage zurück — eine kaputte Zahl darf nichts abschalten", () => {
    expect(parseWeekdayMask(undefined)).toBe(ALL_WEEKDAYS);
    expect(parseWeekdayMask("mo,di")).toBe(ALL_WEEKDAYS);
    expect(parseWeekdayMask(4.5)).toBe(ALL_WEEKDAYS);
    // Fremde Bits jenseits der sieben Tage fallen weg, der Rest bleibt stehen.
    expect(parseWeekdayMask(ALL_WEEKDAYS + 128)).toBe(ALL_WEEKDAYS);
  });

  it("behält die ausdrückliche Null beim Lesen, weist sie beim SCHREIBEN aber ab", () => {
    // Lesen: was in der Spalte steht, bleibt lesbar. Schreiben: ein Fenster ohne Tag gilt nie und
    // wäre eine Regel, die es nur zum Schein gibt.
    expect(parseWeekdayMask(0)).toBe(0);
    expect(weekdayMaskValid(0)).toBe(false);
    expect(weekdayMaskValid(ALL_WEEKDAYS)).toBe(true);
    expect(weekdayMaskValid(ALL_WEEKDAYS + 1)).toBe(false);
  });
});

/** Der Wochentag ist eine Aussage über die Zukunft — heute genannt, wartet der Leser eine Woche. */
describe("datedWindowLabel", () => {
  const LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  const w = (inDays: number, isoDay: number) => ({ start: "16:00", end: "20:00", inDays, isoDay });

  it("heute: nur der Bereich — ein Tagesname wäre eine Aussage über die Zukunft", () => {
    expect(datedWindowLabel(w(0, 4), LABELS, "nächste Woche")).toBe("16:00–20:00");
  });

  it("ein anderer Tag: sein Wort davor", () => {
    expect(datedWindowLabel(w(1, 5), LABELS, "nächste Woche")).toBe("Fr 16:00–20:00");
    expect(datedWindowLabel(w(3, 1), LABELS, "nächste Woche")).toBe("Mo 16:00–20:00");
  });

  /**
   * REGRESSION: bei einem einzigen Wochentag-Fenster („nur sonntags") liegt das nächste nach
   * Ablauf des heutigen in GENAU einer Woche — und trägt den heutigen Wochentagsnamen. Ohne den
   * Zusatz liest sich „So 16:00–20:00" am Sonntagabend als „heute, gerade vorbei"; wer daraufhin
   * öffnet, bekommt ein Vergehen gebucht.
   */
  it("in genau einer Woche: der Tagesname allein genügt nicht", () => {
    expect(datedWindowLabel(w(7, 7), LABELS, "nächste Woche")).toBe("So 16:00–20:00 (nächste Woche)");
  });
});
