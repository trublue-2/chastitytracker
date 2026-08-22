import { describe, it, expect } from "vitest";
import {
  activeWeighingWindow, inWeighingWindow, nextWeighingWindow, parseWeighingWindows,
  weighingWindowsProblem,
} from "./weightWindows";

const MORNING = [{ start: "06:00", end: "08:00" }];
const TWICE = [{ start: "06:00", end: "08:00" }, { start: "18:00", end: "20:00" }];

describe("parseWeighingWindows", () => {
  it("liest den JSON-String der Spalte", () => {
    expect(parseWeighingWindows('[{"start":"06:00","end":"08:00"}]')).toEqual(MORNING);
  });

  it("verwirft Murks still — der LESE-Pfad darf an Bestand nicht scheitern", () => {
    expect(parseWeighingWindows("kein json")).toEqual([]);
    expect(parseWeighingWindows([{ start: "08:00", end: "06:00" }])).toEqual([]);
    expect(parseWeighingWindows(null)).toEqual([]);
  });
});

describe("weighingWindowsProblem — die Schreib-Regel", () => {
  it("nimmt eine gültige Liste an", () => {
    expect(weighingWindowsProblem(TWICE)).toBeNull();
    expect(weighingWindowsProblem([])).toBeNull();
  });

  it("weist ein rückwärts laufendes Paar ab, statt es still zu verwerfen", () => {
    // Der Lese-Pfad würde es wegwerfen — als Antwort auf ein Speichern hiesse das „ok" für ein
    // Fenster, das in Wahrheit gelöscht wurde.
    expect(weighingWindowsProblem([{ start: "08:00", end: "06:00" }])).toBe("timeRangeInvalid");
  });

  it("weist unsinnige Uhrzeiten ab", () => {
    expect(weighingWindowsProblem([{ start: "6:00", end: "08:00" }])).toBe("invalidTime");
    expect(weighingWindowsProblem([{ start: "25:00", end: "26:00" }])).toBe("invalidTime");
    expect(weighingWindowsProblem("nichts")).toBe("invalidTime");
  });

  it("begrenzt die Anzahl", () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ start: `0${i}:00`, end: `0${i}:30` }));
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

  it("liefert das FOLGENDE, auch wenn gerade eines läuft", () => {
    expect(nextWeighingWindow(TWICE, morningLocal, "Europe/Zurich")).toEqual(TWICE[1]);
  });

  it("ist ohne Fenster null — dann gibt es kein Wieder", () => {
    expect(nextWeighingWindow([], noonLocal, "Europe/Zurich")).toBeNull();
  });
});
