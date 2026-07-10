import { describe, it, expect } from "vitest";
import {
  tzOffsetMsAt, midnightInTZ, dateAtLocalMinutes, fromDatetimeLocal,
  decomposeMs, formatMs, formatDuration, formatElapsedMs, formatHours,
} from "./utils";

/**
 * Golden-Fixtures für die Zeit-/Formatier-Primitive.
 *
 * Entstanden aus einem Differential-Test, der bewies, dass die Extraktion von `tzOffsetMsAt` und
 * `decomposeMs` das Verhalten NICHT verändert (Sweep über beide Zeitumstellungstage + Fuzz gegen
 * die Vor-Refactor-Implementierungen). Die alten Implementierungen sind bewusst NICHT eingecheckt
 * — eine zweite, ausführbare Kopie der Produktionslogik wäre eine zweite Wahrheit, die verrottet.
 * Stattdessen sind hier die damals verifizierten Werte als Literale eingefroren: eine einzige
 * Wahrheit, und eine absichtliche Verhaltensänderung zeigt genau, welcher Wert sich bewegt.
 *
 * Zeitzone durchgehend Europe/Zurich; die Umstellungstage 2026 sind der 29.03. und der 25.10.
 */

const TZ = "Europe/Zurich";

describe("tzOffsetMsAt — Golden", () => {
  const rows: [string, number][] = [
    ["2026-01-15T12:00:00Z", 3_600_000], // CET  = +1h
    ["2026-07-15T12:00:00Z", 7_200_000], // CEST = +2h
    ["2026-03-29T00:30:00Z", 3_600_000], // vor der Frühjahrs-Umstellung
    ["2026-03-29T02:00:00Z", 7_200_000], // nach der Frühjahrs-Umstellung
    ["2026-10-25T00:30:00Z", 7_200_000], // vor der Herbst-Umstellung
  ];
  it.each(rows)("%s → %i ms", (instant, expected) => {
    expect(tzOffsetMsAt(Date.parse(instant), TZ)).toBe(expected);
  });

  it("UTC hat keinen Offset", () => {
    expect(tzOffsetMsAt(Date.parse("2026-07-15T12:00:00Z"), "UTC")).toBe(0);
  });
});

describe("decomposeMs", () => {
  it("zerlegt rest-basiert und abgerundet", () => {
    expect(decomposeMs(0)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
    expect(decomposeMs(1000 * (86400 + 3600 * 2 + 60 * 3 + 4)))
      .toEqual({ days: 1, hours: 2, minutes: 3, seconds: 4 });
    expect(decomposeMs(59_999)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 59 });
  });
});

describe("midnightInTZ — Golden (Anker Mittag, DST-fest)", () => {
  const rows: [string, string][] = [
    ["2026-03-29T00:30:00Z", "2026-03-28T22:00:00.000Z"], // Umstellungstag, vor der Wende
    ["2026-03-29T12:00:00Z", "2026-03-28T22:00:00.000Z"], // Umstellungstag, nach der Wende
    ["2026-10-25T00:30:00Z", "2026-10-24T23:00:00.000Z"],
    ["2026-10-25T12:00:00Z", "2026-10-24T23:00:00.000Z"],
    ["2026-07-09T22:30:00Z", "2026-07-09T22:00:00.000Z"], // 00:30 Ortszeit → Mitternacht desselben Tages
  ];
  it.each(rows)("%s → %s", (instant, expected) => {
    expect(midnightInTZ(new Date(instant), TZ).toISOString()).toBe(expected);
  });

  it("liefert für einen lokalen Tag denselben Wert, egal wann er gemessen wird", () => {
    // 20:00Z = 22:00 Ortszeit, noch derselbe lokale Tag. (22:00Z wäre bereits der 30.03.)
    const a = midnightInTZ(new Date("2026-03-29T00:30:00Z"), TZ).getTime();
    const b = midnightInTZ(new Date("2026-03-29T20:00:00Z"), TZ).getTime();
    expect(a).toBe(b);
  });

  it("am Frühjahrs-Umstellungstag misst der Mittags-Anker mit dem Nachher-Offset (CEST)", () => {
    // Vor-Refactor-Verhalten, bewusst festgehalten: die echte lokale Mitternacht des 29.03. liegt
    // bei 23:00Z (noch CET), der Mittags-Anker liefert 22:00Z. Für die Konsumenten (Tages-Buckets,
    // „heute verbraucht") folgenlos, da über den ganzen Tag derselbe Wert herauskommt (Test oben).
    expect(midnightInTZ(new Date("2026-03-29T12:00:00Z"), TZ).toISOString()).toBe("2026-03-28T22:00:00.000Z");
  });
});

describe("dateAtLocalMinutes — Golden (Anker Ziel-Instant)", () => {
  const rows: [string, number, string][] = [
    ["2026-03-29T00:30:00Z", 0, "2026-03-28T23:00:00.000Z"],
    ["2026-03-29T00:30:00Z", 90, "2026-03-28T23:30:00.000Z"],
    ["2026-03-29T00:30:00Z", 180, "2026-03-29T01:00:00.000Z"], // 03:00 CEST, nach der Wende
    ["2026-03-29T00:30:00Z", 240, "2026-03-29T02:00:00.000Z"], // 04:00 CEST
    ["2026-03-29T00:30:00Z", 1439, "2026-03-29T21:59:00.000Z"],
    ["2026-10-25T00:30:00Z", 0, "2026-10-24T22:00:00.000Z"],
    ["2026-10-25T00:30:00Z", 180, "2026-10-25T02:00:00.000Z"],
    ["2026-10-25T00:30:00Z", 1439, "2026-10-25T22:59:00.000Z"],
  ];
  it.each(rows)("%s +%imin → %s", (instant, minutes, expected) => {
    expect(dateAtLocalMinutes(new Date(instant), minutes, TZ).toISOString()).toBe(expected);
  });
});

describe("fromDatetimeLocal — Golden (zwei Pässe, am genauesten)", () => {
  const rows: [string, string][] = [
    ["2026-03-29T01:30", "2026-03-29T00:30:00.000Z"], // existiert (CET)
    ["2026-03-29T03:30", "2026-03-29T01:30:00.000Z"], // existiert (CEST)
    ["2026-10-25T02:30", "2026-10-25T01:30:00.000Z"], // doppelte Stunde → zweite Lesart
    ["2026-07-09T20:00", "2026-07-09T18:00:00.000Z"],
  ];
  it.each(rows)("%s → %s", (local, expected) => {
    expect(fromDatetimeLocal(local, TZ).toISOString()).toBe(expected);
  });

  it("02:30 am Frühjahrs-Umstellungstag existiert lokal nicht — fällt auf denselben Instant wie 03:30", () => {
    expect(fromDatetimeLocal("2026-03-29T02:30", TZ).toISOString())
      .toBe(fromDatetimeLocal("2026-03-29T03:30", TZ).toISOString());
  });
});

describe("Formatter — Golden (Rundungs-/Einheiten-/Locale-Regeln)", () => {
  // [ms, locale, formatMs, formatDuration, formatElapsedMs(showSeconds)]
  const rows: [number, string, string, string, string][] = [
    [-1, "de", "–", "–", "0min 00s"],
    [0, "de", "–", "0min", "0min 00s"],          // formatMs: ≤0 → "–"; formatDuration: <0 → "–"
    [59_999, "de", "–", "0min", "0min 59s"],
    [60_000, "de", "1m", "1min", "1min 00s"],    // Einheit "m" vs "min"
    [3_599_999, "de", "59m", "59min", "59min 59s"],
    [3_600_000, "de", "1h", "1h", "1h 0min 00s"],
    [86_399_999, "de", "23h 59m", "23h 59min", "23h 59min 59s"],
    [86_400_000, "de", "1T", "1T", "1T 0min 00s"], // formatMs unterdrückt Minuten sobald Tage da sind
    [90_061_000, "de", "1T 1h", "1T 1h 1min", "1T 1h 1min 01s"],
    [90_061_000, "en", "1d 1h", "1d 1h 1min", "1d 1h 1min 01s"],
  ];
  it.each(rows)("%i ms / %s", (ms, locale, expMs, expDur, expElapsed) => {
    expect(formatMs(ms, locale)).toBe(expMs);
    expect(formatDuration(new Date(0), new Date(ms), locale)).toBe(expDur);
    expect(formatElapsedMs(ms, locale, true)).toBe(expElapsed);
  });

  it("BEKANNTE Drift, hier nur festgehalten: bei 'en-US' nutzt formatElapsedMs 'T', formatMs 'd'", () => {
    // formatMs/formatDuration prüfen locale.startsWith("en"), formatElapsedMs prüft locale === "en".
    // Bewusst NICHT in diesem verhaltenserhaltenden Refactor korrigiert — siehe eigener Fix-Task.
    expect(formatMs(86_400_000, "en-US")).toBe("1d");
    expect(formatDuration(new Date(0), new Date(86_400_000), "en-US")).toBe("1d");
    expect(formatElapsedMs(86_400_000, "en-US", true)).toBe("1T 0min 00s"); // ← die Drift
  });

  it("formatHours rundet (nicht floor) und nutzt decomposeMs bewusst nicht", () => {
    expect(formatHours(25.7)).toBe("1T 2h"); // 1.7h → round → 2h
    expect(formatHours(25.4)).toBe("1T 1h");
    expect(formatHours(0)).toBe("0h");
  });
});
