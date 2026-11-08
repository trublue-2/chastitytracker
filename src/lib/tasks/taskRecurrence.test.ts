import { describe, it, expect } from "vitest";
import {
  recurrenceProblem, occurrencesBetween, upcomingOccurrences, parseExclusionDates,
  type RecurrenceRule,
} from "./taskRecurrence";

const TZ = "Europe/Zurich";

// Januar 2026: 01-01 = Do. Montage: 5, 12, 19, 26. Donnerstage: 1, 8, 15, 22, 29. Freitage: 2,9,16,23,30.
const rule = (over: Partial<RecurrenceRule>): RecurrenceRule => ({
  freq: "DAILY", interval: 1, weekdayMask: null, ordinal: null,
  timeOfDay: "09:30", startsOn: new Date("2026-01-05T00:00:00Z"), until: null, exclusionDates: null,
  ...over,
});

/** Termine als lokale "YYYY-MM-DD HH:mm"-Marken, damit die Erwartungen lesbar bleiben. */
const marks = (dates: Date[]) =>
  dates.map((d) => new Intl.DateTimeFormat("sv-SE", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d).replace(" ", "T"));

const RANGE_A = new Date("2026-01-01T00:00:00Z");
const RANGE_B = new Date("2026-01-31T23:59:00Z");

describe("recurrenceProblem", () => {
  it("akzeptiert eine einfache Tagesregel", () => {
    expect(recurrenceProblem(rule({}))).toBeNull();
  });
  it("weist unbekannte Frequenz ab", () => {
    expect(recurrenceProblem(rule({ freq: "YEARLY" as never }))).toBe("RECURRENCE_FREQ");
  });
  it("weist Intervall < 1 und über dem Maximum ab", () => {
    expect(recurrenceProblem(rule({ interval: 0 }))).toBe("RECURRENCE_INTERVAL");
    expect(recurrenceProblem(rule({ interval: 400 }))).toBe("RECURRENCE_INTERVAL");
  });
  it("weist ungültige Uhrzeit ab", () => {
    expect(recurrenceProblem(rule({ timeOfDay: "24:00" }))).toBe("RECURRENCE_TIME");
    expect(recurrenceProblem(rule({ timeOfDay: "9:30" }))).toBe("RECURRENCE_TIME");
  });
  it("verlangt bei WEEKLY/MONTHLY eine nichtleere Wochentagsmaske", () => {
    expect(recurrenceProblem(rule({ freq: "WEEKLY", weekdayMask: 0 }))).toBe("RECURRENCE_WEEKDAYS");
    expect(recurrenceProblem(rule({ freq: "MONTHLY", weekdayMask: null, ordinal: 1 }))).toBe("RECURRENCE_WEEKDAYS");
  });
  it("weist ein Ordinal bei DAILY/WEEKLY ab, verlangt es bei MONTHLY", () => {
    expect(recurrenceProblem(rule({ freq: "DAILY", ordinal: 1 }))).toBe("RECURRENCE_ORDINAL");
    expect(recurrenceProblem(rule({ freq: "WEEKLY", weekdayMask: 1, ordinal: 2 }))).toBe("RECURRENCE_ORDINAL");
    expect(recurrenceProblem(rule({ freq: "MONTHLY", weekdayMask: 1, ordinal: 0 }))).toBe("RECURRENCE_ORDINAL");
    expect(recurrenceProblem(rule({ freq: "MONTHLY", weekdayMask: 1, ordinal: -1 }))).toBeNull();
  });
  it("weist ein until vor startsOn ab", () => {
    expect(recurrenceProblem(rule({ until: new Date("2026-01-04T00:00:00Z") }))).toBe("RECURRENCE_UNTIL");
  });
});

describe("occurrencesBetween — DAILY", () => {
  it("jeden Tag ab startsOn, mit der gesetzten Uhrzeit", () => {
    const got = marks(occurrencesBetween(rule({}), RANGE_A, new Date("2026-01-08T00:00:00Z"), TZ));
    expect(got).toEqual(["2026-01-05T09:30", "2026-01-06T09:30", "2026-01-07T09:30"]);
  });
  it("jeden 2. Tag", () => {
    const got = marks(occurrencesBetween(rule({ interval: 2 }), RANGE_A, new Date("2026-01-12T00:00:00Z"), TZ));
    expect(got).toEqual(["2026-01-05T09:30", "2026-01-07T09:30", "2026-01-09T09:30", "2026-01-11T09:30"]);
  });
});

describe("occurrencesBetween — WEEKLY", () => {
  it("Montags und Donnerstags (Maske 9)", () => {
    const got = marks(occurrencesBetween(rule({ freq: "WEEKLY", weekdayMask: 0b1001 }), RANGE_A, new Date("2026-01-16T00:00:00Z"), TZ));
    expect(got).toEqual(["2026-01-05T09:30", "2026-01-08T09:30", "2026-01-12T09:30", "2026-01-15T09:30"]);
  });
  it("jede 2. Woche montags", () => {
    const got = marks(occurrencesBetween(rule({ freq: "WEEKLY", weekdayMask: 0b1, interval: 2 }), RANGE_A, RANGE_B, TZ));
    expect(got).toEqual(["2026-01-05T09:30", "2026-01-19T09:30"]);
  });
});

describe("occurrencesBetween — MONTHLY", () => {
  it("2. Montag im Monat", () => {
    const got = marks(occurrencesBetween(rule({ freq: "MONTHLY", weekdayMask: 0b1, ordinal: 2 }), RANGE_A, RANGE_B, TZ));
    expect(got).toEqual(["2026-01-12T09:30"]);
  });
  it("letzter Freitag im Monat", () => {
    const got = marks(occurrencesBetween(rule({ freq: "MONTHLY", weekdayMask: 0b10000, ordinal: -1 }), RANGE_A, RANGE_B, TZ));
    expect(got).toEqual(["2026-01-30T09:30"]);
  });
  it("mehrere Wochentage: der n-te zählt JE Wochentag (2. Mo UND 2. Do)", () => {
    // Do: 1,8,15,22,29 → 2. = 8. Mo: 5,12,19,26 → 2. = 12. Aufsteigend also 8, dann 12.
    const got = marks(occurrencesBetween(rule({ freq: "MONTHLY", weekdayMask: 0b1001, ordinal: 2 }), RANGE_A, RANGE_B, TZ));
    expect(got).toEqual(["2026-01-08T09:30", "2026-01-12T09:30"]);
  });
});

describe("occurrencesBetween — Grenzen und Ausnahmen", () => {
  it("respektiert until (einschliesslich)", () => {
    const got = marks(occurrencesBetween(rule({ until: new Date("2026-01-06T09:30:00+01:00") }), RANGE_A, RANGE_B, TZ));
    expect(got).toEqual(["2026-01-05T09:30", "2026-01-06T09:30"]);
  });
  it("lässt Ausnahme-Tage aus", () => {
    const got = marks(occurrencesBetween(rule({ exclusionDates: JSON.stringify(["2026-01-06"]) }), RANGE_A, new Date("2026-01-08T00:00:00Z"), TZ));
    expect(got).toEqual(["2026-01-05T09:30", "2026-01-07T09:30"]);
  });
  it("afterExclusive ist exklusiv, throughInclusive inklusiv", () => {
    const exact = new Date("2026-01-05T09:30:00+01:00"); // 08:30Z
    expect(occurrencesBetween(rule({}), exact, new Date("2026-01-06T00:00:00Z"), TZ)).toHaveLength(0);
    const oneMsBefore = new Date(exact.getTime() - 1);
    expect(occurrencesBetween(rule({}), oneMsBefore, exact, TZ)).toHaveLength(1);
  });
  it("liefert nichts vor startsOn", () => {
    expect(occurrencesBetween(rule({ startsOn: new Date("2026-02-01T00:00:00Z") }), RANGE_A, RANGE_B, TZ)).toHaveLength(0);
  });
});

describe("occurrencesBetween — DST", () => {
  it("hält die Wanduhr-Zeit über die Frühjahrs-Umstellung (2026-03-29)", () => {
    const got = occurrencesBetween(
      rule({ timeOfDay: "09:00", startsOn: new Date("2026-03-27T00:00:00Z") }),
      new Date("2026-03-27T00:00:00Z"), new Date("2026-03-31T00:00:00Z"), TZ,
    );
    // Lokal jeden Tag 09:00 — UTC springt von 08:00 (CET) auf 07:00 (CEST).
    expect(got.map((d) => d.toISOString())).toEqual([
      "2026-03-27T08:00:00.000Z",
      "2026-03-28T08:00:00.000Z",
      "2026-03-29T07:00:00.000Z",
      "2026-03-30T07:00:00.000Z",
    ]);
    expect(marks(got).every((m) => m.endsWith("T09:00"))).toBe(true);
  });
});

describe("upcomingOccurrences", () => {
  it("liefert höchstens count Termine innerhalb maxDays", () => {
    const got = upcomingOccurrences(rule({}), new Date("2026-01-04T23:00:00Z"), TZ, { count: 3, maxDays: 30 });
    expect(marks(got)).toEqual(["2026-01-05T09:30", "2026-01-06T09:30", "2026-01-07T09:30"]);
  });
  it("bricht ab, wenn der Horizont vor dem nächsten Termin endet", () => {
    const got = upcomingOccurrences(rule({ startsOn: new Date("2026-06-01T00:00:00Z") }), new Date("2026-01-01T00:00:00Z"), TZ, { count: 3, maxDays: 30 });
    expect(got).toHaveLength(0);
  });
});

describe("parseExclusionDates", () => {
  it("nimmt nur echte YYYY-MM-DD-Strings, verwirft Murks", () => {
    const set = parseExclusionDates(JSON.stringify(["2026-01-06", "kaputt", "2026-13-99", 42]));
    expect([...set]).toEqual(["2026-01-06", "2026-13-99"]);
  });
  it("null → leere Menge", () => {
    expect(parseExclusionDates(null).size).toBe(0);
  });
});
