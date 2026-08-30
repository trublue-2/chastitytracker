import { describe, it, expect } from "vitest";
import {
  activeCleaningWindow, countCleaningUsedToday, nextCleaningWindow,
  parseCleaningWindows, cleaningWindowProblem, cleaningWindowListProblem, formatCleaningWindows,
} from "./cleaningService";
import { CLEANING_WINDOWS_MAX, CLEANING_WINDOWS_TOO_MANY, INVALID_TIME, TIME_RANGE_INVALID } from "@/lib/constants";

describe("activeCleaningWindow — per-user timezone", () => {
  const windows = [{ start: "20:00", end: "22:00" }];
  // 2026-01-15T01:30Z = 20:30 in New York (Jan 14, inside the window) but 02:30 in Zurich (outside).
  const now = new Date("2026-01-15T01:30:00Z");

  it("evaluates the wall-clock window in the given tz", () => {
    expect(activeCleaningWindow(windows, now, "America/New_York")).toBe("22:00");
    expect(activeCleaningWindow(windows, now, "Europe/Zurich")).toBeNull();
  });

  it("default tz === Europe/Zurich (regression: existing users unchanged)", () => {
    expect(activeCleaningWindow(windows, now)).toBe(activeCleaningWindow(windows, now, "Europe/Zurich"));
  });

  it("accepts the stored JSON-string form", () => {
    expect(activeCleaningWindow(JSON.stringify(windows), now, "America/New_York")).toBe("22:00");
  });
});

describe("nextCleaningWindow", () => {
  const fenster = [{ start: "17:30", end: "18:00" }, { start: "05:30", end: "07:00" }];
  const TZ = "Europe/Zurich";

  it("liefert das nächste heute beginnende Fenster", () => {
    // 12:24 Ortszeit → das Abendfenster kommt als nächstes.
    expect(nextCleaningWindow(fenster, new Date("2026-07-10T10:24:00Z"), TZ)).toEqual({ start: "17:30", end: "18:00" });
  });

  it("nach dem letzten Fenster des Tages zeigt es auf das früheste (= morgen)", () => {
    expect(nextCleaningWindow(fenster, new Date("2026-07-10T20:00:00Z"), TZ)).toEqual({ start: "05:30", end: "07:00" });
  });

  it("läuft man gerade IN einem Fenster, kommt das darauffolgende", () => {
    // 06:00 Ortszeit liegt im Morgenfenster — gefragt ist „wann wieder", nicht „jetzt offen".
    expect(nextCleaningWindow(fenster, new Date("2026-07-10T04:00:00Z"), TZ)).toEqual({ start: "17:30", end: "18:00" });
  });

  it("ohne konfigurierte Fenster: null (nicht zeitgebunden)", () => {
    expect(nextCleaningWindow([], new Date("2026-07-10T10:24:00Z"), TZ)).toBeNull();
    expect(nextCleaningWindow(null, new Date("2026-07-10T10:24:00Z"), TZ)).toBeNull();
  });
});

describe("countCleaningUsedToday", () => {
  const TZ = "Europe/Zurich";
  // 2026-07-10T10:24Z = 12:24 Zürcher Ortszeit; der Tag begann um 2026-07-09T22:00Z.
  const now = new Date("2026-07-10T10:24:00Z");
  const mk = (type: string, oeffnenGrund: string | null, iso: string) =>
    ({ type, oeffnenGrund, startTime: new Date(iso) });

  it("zählt nur OEFFNEN(REINIGUNG) ab Mitternacht der Sub-Zeitzone", () => {
    const entries = [
      mk("OEFFNEN", "REINIGUNG", "2026-07-10T06:00:00Z"),   // heute → zählt
      mk("OEFFNEN", "REINIGUNG", "2026-07-09T23:30:00Z"),   // 01:30 Ortszeit heute → zählt
      mk("OEFFNEN", "REINIGUNG", "2026-07-09T21:00:00Z"),   // gestern → zählt nicht
      mk("OEFFNEN", "KEYHOLDER", "2026-07-10T07:00:00Z"),   // anderer Grund → zählt nicht
      mk("VERSCHLUSS", null, "2026-07-10T07:30:00Z"),       // anderer Typ → zählt nicht
    ];
    expect(countCleaningUsedToday(entries, now, TZ)).toBe(2);
  });

  it("die Tagesgrenze folgt der Sub-Zeitzone", () => {
    // 2026-07-09T23:30Z ist in Zürich schon heute (01:30), in New York noch gestern (19:30).
    const entries = [mk("OEFFNEN", "REINIGUNG", "2026-07-09T23:30:00Z")];
    expect(countCleaningUsedToday(entries, now, TZ)).toBe(1);
    expect(countCleaningUsedToday(entries, now, "America/New_York")).toBe(0);
  });

  it("Mitternacht selbst zählt mit, spätere Einträge ebenfalls (wie das `gte`-where ohne Obergrenze)", () => {
    const entries = [
      mk("OEFFNEN", "REINIGUNG", "2026-07-09T22:00:00Z"),   // exakt Mitternacht Ortszeit
      mk("OEFFNEN", "REINIGUNG", "2026-07-10T20:00:00Z"),   // nach `now`, noch heute
    ];
    expect(countCleaningUsedToday(entries, now, TZ)).toBe(2);
  });

  it("leere Liste → 0", () => {
    expect(countCleaningUsedToday([], now, TZ)).toBe(0);
  });
});

describe("cleaningWindowProblem (Schreib-Regel)", () => {
  it("gültige Fenster: kein Problem", () => {
    expect(cleaningWindowProblem({ start: "19:00", end: "20:00" })).toBeNull();
    expect(cleaningWindowProblem({ start: "00:00", end: "24:00" })).toBeNull(); // ganzer Tag
  });

  it("liefert den stabilen Code, statt still zu verwerfen", () => {
    expect(cleaningWindowProblem({ start: "19:00", end: "18:00" })).toBe(TIME_RANGE_INVALID);
    expect(cleaningWindowProblem({ start: "19:00", end: "19:00" })).toBe(TIME_RANGE_INVALID);
    expect(cleaningWindowProblem({ start: "7:00", end: "8:00" })).toBe(INVALID_TIME);
    expect(cleaningWindowProblem({ start: "19:00" })).toBe(INVALID_TIME);
    expect(cleaningWindowProblem({ start: "25:00", end: "26:00" })).toBe(INVALID_TIME);
    expect(cleaningWindowProblem({ start: "19:70", end: "20:00" })).toBe(INVALID_TIME);
    expect(cleaningWindowProblem(null)).toBe(INVALID_TIME);
  });

  it("24:00 nur als Ende — als Start läge nichts danach", () => {
    expect(cleaningWindowProblem({ start: "24:00", end: "24:30" })).toBe(INVALID_TIME);
  });

  it("was die Schreib-Regel durchlässt, behält der Lese-Pfad (die eine strikt über der anderen)", () => {
    const kandidaten = [
      { start: "00:00", end: "24:00" }, { start: "05:30", end: "07:00" },
      { start: "22:00", end: "23:59" }, { start: "19:00", end: "18:00" },
      { start: "25:00", end: "26:00" }, { start: "7:00", end: "8:00" },
    ];
    const geschrieben = kandidaten.filter((f) => cleaningWindowProblem(f) === null);
    expect(parseCleaningWindows(geschrieben)).toEqual(geschrieben);
  });

  it("gespeicherte Alt-Fenster bleiben lesbar, auch wenn die Schreib-Regel sie heute ablehnte", () => {
    // Ein per API abgelegtes „99:00-99:30" ist Bestand — der Lese-Pfad darf es nicht nachträglich
    // löschen, nur neu schreiben lässt es sich nicht mehr.
    expect(parseCleaningWindows([{ start: "99:00", end: "99:30" }])).toEqual([{ start: "99:00", end: "99:30" }]);
    expect(cleaningWindowProblem({ start: "99:00", end: "99:30" })).not.toBeNull();
  });
});

describe("cleaningWindowListProblem (Schreib-Regel der ganzen Liste)", () => {
  it("gültige Liste (auch leer): kein Problem", () => {
    expect(cleaningWindowListProblem([])).toBeNull();
    expect(cleaningWindowListProblem([{ start: "07:00", end: "08:00" }, { start: "19:00", end: "20:00" }])).toBeNull();
  });

  it("nennt den Index des schuldigen Paares", () => {
    expect(cleaningWindowListProblem([{ start: "07:00", end: "08:00" }, { start: "19:00", end: "18:00" }]))
      .toEqual({ code: TIME_RANGE_INVALID, index: 1 });
  });

  it("zu viele Fenster — der Code trägt keinen Index (die Liste als Ganzes ist zu lang)", () => {
    const zuViele = Array.from({ length: CLEANING_WINDOWS_MAX + 1 }, () => ({ start: "07:00", end: "08:00" }));
    expect(cleaningWindowListProblem(zuViele)).toEqual({ code: CLEANING_WINDOWS_TOO_MANY });
    expect(cleaningWindowListProblem(zuViele.slice(1))).toBeNull(); // genau CLEANING_WINDOWS_MAX
  });

  it("was kein Array ist, löscht NICHT still alle Fenster", () => {
    expect(cleaningWindowListProblem("19:00-20:00")).toEqual({ code: INVALID_TIME });
    expect(cleaningWindowListProblem(null)).toEqual({ code: INVALID_TIME });
  });
});

describe("formatCleaningWindows", () => {
  it("eine Zeile je Fenster", () => {
    expect(formatCleaningWindows({ start: "19:00", end: "20:00" })).toBe("19:00-20:00");
  });
});
