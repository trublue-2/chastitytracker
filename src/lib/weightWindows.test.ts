import { describe, it, expect } from "vitest";
import {
  activeWeighingWindow, inWeighingWindow, nextWeighingWindow, parseWeighingWindows,
  weighingWindowEnd, weighingWindowsProblem,
} from "./weightWindows";
import { ALL_WEEKDAYS, weekdayMaskOf } from "./weekdays";

/** Ein Fenster in der Form, die in der Spalte steht. `days` weglassen heisst „täglich". */
const w = (start: string, durationMin: number, over: Partial<{ days: number; remind: boolean }> = {}) =>
  ({ start, durationMin, days: ALL_WEEKDAYS, remind: false, ...over });

const MORNING = [w("06:00", 120)];
const TWICE = [w("06:00", 120), w("18:00", 120)];

describe("parseWeighingWindows", () => {
  it("liest den JSON-String der Spalte", () => {
    expect(parseWeighingWindows('[{"start":"06:00","durationMin":120,"days":127,"remind":false}]')).toEqual(MORNING);
  });

  it("liest Alt-Fenster mit Endzeit als Start plus Dauer — sonst löschte das erste Speichern sie", () => {
    expect(parseWeighingWindows('[{"start":"06:00","end":"08:00"}]')).toEqual(MORNING);
  });

  it("schaltet einem Alt-Fenster keine Erinnerung ein", () => {
    // Ein Update darf niemandem ungefragt Nachrichten bestellen.
    expect(parseWeighingWindows([{ start: "06:00", end: "08:00" }])[0].remind).toBe(false);
  });

  it("verwirft Murks still — der LESE-Pfad darf an Bestand nicht scheitern", () => {
    expect(parseWeighingWindows("kein json")).toEqual([]);
    expect(parseWeighingWindows([{ start: "08:00", end: "06:00" }])).toEqual([]);
    expect(parseWeighingWindows([{ start: "23:00", durationMin: 180 }])).toEqual([]);
    expect(parseWeighingWindows(null)).toEqual([]);
  });
});

describe("weighingWindowsProblem — die Schreib-Regel", () => {
  it("nimmt eine gültige Liste an", () => {
    expect(weighingWindowsProblem(TWICE)).toBeNull();
    expect(weighingWindowsProblem([])).toBeNull();
  });

  it("weist ein Fenster über Mitternacht ab, statt es still zu verwerfen", () => {
    // Der Lese-Pfad würde es wegwerfen — als Antwort auf ein Speichern hiesse das „ok" für ein
    // Fenster, das in Wahrheit gelöscht wurde.
    expect(weighingWindowsProblem([w("23:00", 180)])).toBe("timeRangeInvalid");
  });

  it("weist eine unsinnige Dauer ab", () => {
    expect(weighingWindowsProblem([w("06:00", 1)])).toBe("timeRangeInvalid");
    expect(weighingWindowsProblem([{ start: "06:00" }])).toBe("invalidTime");
  });

  it("weist unsinnige Uhrzeiten ab", () => {
    expect(weighingWindowsProblem([w("6:00", 120)])).toBe("invalidTime");
    expect(weighingWindowsProblem([w("25:00", 60)])).toBe("invalidTime");
    expect(weighingWindowsProblem("nichts")).toBe("invalidTime");
  });

  it("weist ein Fenster ohne Wochentag ab — es gälte nie und sähe doch nach einer Regel aus", () => {
    expect(weighingWindowsProblem([w("06:00", 120, { days: 0 })])).toBe("invalidTime");
  });

  it("begrenzt die Anzahl", () => {
    const many = Array.from({ length: 8 }, (_, i) => w(`0${i}:00`, 30));
    expect(weighingWindowsProblem(many)).toBe("WEIGHING_WINDOWS_TOO_MANY");
  });
});

describe("inWeighingWindow", () => {
  // 07:00 Zürich = 05:00 UTC (Sommerzeit).
  const morningLocal = new Date("2026-08-22T05:00:00Z");
  const noonLocal = new Date("2026-08-22T10:00:00Z");

  it("ist ohne Fenster IMMER wahr — leer heisst keine Fensterpflicht", () => {
    expect(inWeighingWindow([], noonLocal, "Europe/Zurich")).toBe(true);
    expect(inWeighingWindow(null, noonLocal, "Europe/Zurich")).toBe(true);
  });

  it("rechnet in der Zeitzone des Subs, nicht in UTC", () => {
    expect(inWeighingWindow(MORNING, morningLocal, "Europe/Zurich")).toBe(true);
    // Derselbe Augenblick in New York ist dort 01:00 — also ausserhalb.
    expect(inWeighingWindow(MORNING, morningLocal, "America/New_York")).toBe(false);
  });

  it("schliesst das Ende aus", () => {
    const eight = new Date("2026-08-22T06:00:00Z"); // 08:00 Zürich
    expect(inWeighingWindow(MORNING, eight, "Europe/Zurich")).toBe(false);
  });

  it("gilt nur an den gesetzten Wochentagen", () => {
    // Der 22.08.2026 ist ein Samstag.
    const nurWerktags = [w("06:00", 120, { days: weekdayMaskOf([1, 2, 3, 4, 5]) })];
    expect(inWeighingWindow(nurWerktags, morningLocal, "Europe/Zurich")).toBe(false);
    const auchSamstags = [w("06:00", 120, { days: weekdayMaskOf([6]) })];
    expect(inWeighingWindow(auchSamstags, morningLocal, "Europe/Zurich")).toBe(true);
  });

  it("nennt das Ende aus Start und Dauer", () => {
    expect(weighingWindowEnd(w("06:00", 150))).toBe("08:30");
    expect(weighingWindowEnd(w("22:00", 120))).toBe("24:00");
  });
});

describe("activeWeighingWindow / nextWeighingWindow", () => {
  const noonLocal = new Date("2026-08-22T10:00:00Z"); // 12:00 Zürich
  const morningLocal = new Date("2026-08-22T05:00:00Z"); // 07:00 Zürich

  it("nennt das laufende Fenster", () => {
    expect(activeWeighingWindow(TWICE, morningLocal, "Europe/Zurich")).toEqual(TWICE[0]);
    expect(activeWeighingWindow(TWICE, noonLocal, "Europe/Zurich")).toBeNull();
  });

  it("nennt das nächste Fenster des Tages", () => {
    expect(nextWeighingWindow(TWICE, noonLocal, "Europe/Zurich")).toEqual(TWICE[1]);
  });

  it("zeigt nach dem letzten Fenster auf das erste von morgen", () => {
    const night = new Date("2026-08-22T20:00:00Z"); // 22:00 Zürich
    expect(nextWeighingWindow(TWICE, night, "Europe/Zurich")).toEqual(TWICE[0]);
  });

  it("überspringt Tage, an denen kein Fenster gilt", () => {
    // Samstag, 22:00 Zürich; das Fenster gilt nur werktags — „wieder ab morgen" wäre falsch, das
    // nächste ist erst am Montag. Die Uhrzeit ist dieselbe, die Aussage aber nicht.
    const night = new Date("2026-08-22T20:00:00Z");
    const werktags = [w("06:00", 120, { days: weekdayMaskOf([1, 2, 3, 4, 5]) })];
    expect(nextWeighingWindow(werktags, night, "Europe/Zurich")).toEqual(werktags[0]);
    // Und wo überhaupt kein Tag mehr kommt, gibt es kein „wieder".
    const nurSamstags = [w("06:00", 120, { days: weekdayMaskOf([6]) })];
    expect(nextWeighingWindow(nurSamstags, night, "Europe/Zurich")).toEqual(nurSamstags[0]);
  });

  it("liefert das FOLGENDE, auch wenn gerade eines läuft", () => {
    expect(nextWeighingWindow(TWICE, morningLocal, "Europe/Zurich")).toEqual(TWICE[1]);
  });

  it("ist ohne Fenster null — dann gibt es kein Wieder", () => {
    expect(nextWeighingWindow([], noonLocal, "Europe/Zurich")).toBeNull();
  });
});
