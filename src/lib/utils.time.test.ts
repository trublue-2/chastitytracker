import { describe, it, expect } from "vitest";
import {
  tzOffsetMsAt, midnightInTZ, dateAtLocalMinutes, fromDatetimeLocal,
  decomposeMs, formatDurationMs, formatDurationBetween, formatElapsedMs, formatDurationHours,
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

describe("midnightInTZ — Golden (Anker Ziel-Instant, DST-fest)", () => {
  const rows: [string, string][] = [
    // Frühjahrs-Umstellungstag: 00:00 des 29.03. liegt noch in CET (+1) → 23:00Z des Vortags. Vor und
    // nach der Wende gemessen — der Anker ist die Ziel-Mitternacht, nicht der Mess-Instant.
    ["2026-03-29T00:30:00Z", "2026-03-28T23:00:00.000Z"],
    ["2026-03-29T12:00:00Z", "2026-03-28T23:00:00.000Z"],
    // Herbst-Umstellungstag: 00:00 des 25.10. liegt noch in CEST (+2) → 22:00Z des Vortags.
    ["2026-10-25T00:30:00Z", "2026-10-24T22:00:00.000Z"],
    ["2026-10-25T12:00:00Z", "2026-10-24T22:00:00.000Z"],
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
  // Eine Dauer, EINE Schreibweise (Etappe A, 22.08.2026). Vorher schrieben sechs Formatierer
  // dieselbe Dauer unterschiedlich; die Golden-Zeilen hier halten fest, was davon übrig ist —
  // und die drei Fehler, die dabei behoben wurden, bekommen eigene Fälle weiter unten.
  //
  // [ms, locale, formatDurationMs, formatElapsedMs(showSeconds)]
  const rows: [number, string, string, string][] = [
    [-1, "de", "–", "0min 00s"],
    [0, "de", "0min", "0min 00s"],
    [45_000, "de", "<1min", "0min 45s"],
    [59_999, "de", "<1min", "0min 59s"],
    [60_000, "de", "1min", "1min 00s"],
    [3_599_999, "de", "59min", "59min 59s"],
    [3_600_000, "de", "1h", "1h 0min 00s"],
    [86_399_999, "de", "23h 59min", "23h 59min 59s"],
    [86_400_000, "de", "1T", "1T 0min 00s"],
    [90_061_000, "de", "1T 1h 1min", "1T 1h 1min 01s"],
    [90_061_000, "en", "1d 1h 1min", "1d 1h 1min 01s"],
  ];
  it.each(rows)("%i ms / %s", (ms, locale, expMs, expElapsed) => {
    expect(formatDurationMs(ms, locale)).toBe(expMs);
    // Die Zeitpunkt-Fassung ist derselbe Formatierer, nur mit anderer Eingabe.
    expect(formatDurationBetween(new Date(0), new Date(ms), locale)).toBe(expMs);
    expect(formatElapsedMs(ms, locale, true)).toBe(expElapsed);
  });

  it("alle Formatter nutzen dieselbe Tages-Einheit bei regionalen Locale-Tags", () => {
    // Einzige Stelle, die die Regionaltag-Regel festhält — alle gehen über dayUnit().
    expect(formatDurationMs(86_400_000, "en-US")).toBe("1d");
    expect(formatDurationBetween(new Date(0), new Date(86_400_000), "en-US")).toBe("1d");
    expect(formatElapsedMs(86_400_000, "en-US", true)).toBe("1d 0min 00s");
    expect(formatDurationHours(24, "en-US")).toBe("1d");

    expect(formatDurationMs(86_400_000, "de-CH")).toBe("1T");
    expect(formatDurationBetween(new Date(0), new Date(86_400_000), "de-CH")).toBe("1T");
    expect(formatElapsedMs(86_400_000, "de-CH", true)).toBe("1T 0min 00s");
    expect(formatDurationHours(24, "de-CH")).toBe("1T");
  });

  // ── Die drei Fehler der abgelösten Formatierer. Je ein Fall, damit keiner zurückkommt. ──

  it("rundet NIE auf — 23 h 59 min ist kein Tag", () => {
    // `formatHours` schrieb hier „24h": eine Minute vor dem Tag, zu lesen wie ein voller.
    // Betroffen waren Tragekalender und Monatsübersicht, also genau die Stellen, an denen
    // jemand nachzählt, ob ein Tagesziel erreicht ist.
    expect(formatDurationHours(23 + 59 / 60, "de")).toBe("23h 59min");
    expect(formatDurationHours(25.7, "de")).toBe("1T 1h 42min");
    expect(formatDurationHours(0.99, "de")).toBe("59min");
  });

  it("lässt nichts unter einer Minute verschwinden", () => {
    // `formatMs` schrieb dafür „–", also wie „kein Wert" — eine 45-Sekunden-Session war in
    // Gesamtdauer, Durchschnitt und Rekorden nicht von „keine Daten" zu unterscheiden.
    expect(formatDurationMs(45_000, "de")).toBe("<1min");
    expect(formatDurationMs(1, "de")).toBe("<1min");
    expect(formatDurationMs(0, "de")).toBe("0min");
  });

  it("behält Minuten, auch wenn Tage im Spiel sind", () => {
    // `formatMs` zeigte für beide Fälle „5T".
    const fiveDays = 5 * 86_400_000;
    expect(formatDurationMs(fiveDays + 30 * 60_000, "de")).toBe("5T 30min");
    expect(formatDurationMs(fiveDays, "de")).toBe("5T");
  });

  it("lässt Null-Teile weg, aber nie die einzige Stelle", () => {
    expect(formatDurationMs(5 * 86_400_000 + 30 * 60_000, "de")).toBe("5T 30min"); // Stunde = 0
    expect(formatDurationMs(2 * 3_600_000, "de")).toBe("2h");                      // Minute = 0
    expect(formatDurationMs(0, "de")).toBe("0min");                                // alles 0
  });

  it("formatDurationHours überlebt Gleitkomma-Reste", () => {
    // `(2 + 3/60) * 3_600_000` ist 7_379_999.999… — ohne Rundung auf die Millisekunde stünde
    // dort „2h 2min" für zwei Stunden und drei Minuten. Stunden kommen als Float aus
    // `calculateWearingHoursByRange` und aus den prorata-Zielen, der Fall ist also der Normalfall.
    expect(formatDurationHours(2 + 3 / 60, "de")).toBe("2h 3min");
    expect(formatDurationHours(17.5, "de")).toBe("17h 30min");
    expect(formatDurationHours(23 + 59 / 60, "de")).toBe("23h 59min");
    expect(formatDurationHours(0, "de")).toBe("0min");
  });
});
