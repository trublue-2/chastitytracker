import { describe, it, expect } from "vitest";
import {
  activeCleaningWindow, countCleaningUsedToday, nextCleaningWindow,
  parseCleaningWindows, cleaningWindowProblem, cleaningWindowListProblem, formatCleaningWindows,
} from "./cleaningService";
import { CLEANING_WINDOWS_MAX, CLEANING_WINDOWS_TOO_MANY, INVALID_TIME, TIME_RANGE_INVALID } from "@/lib/constants";
import { ALL_WEEKDAYS, weekdayMaskOf } from "@/lib/weekdays";

/** Montag … Sonntag als Maske — die Tests lesen sich damit wie der Zettel des Keyholders. */
const MO = weekdayMaskOf([1]), DI = weekdayMaskOf([2]), FR = weekdayMaskOf([5]);

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
  // 2026-07-10 ist ein FREITAG (ISO 5) — daran hängen die Wochentags-Fälle unten.

  it("liefert das nächste heute beginnende Fenster", () => {
    // 12:24 Ortszeit → das Abendfenster kommt als nächstes.
    expect(nextCleaningWindow(fenster, new Date("2026-07-10T10:24:00Z"), TZ))
      .toEqual({ start: "17:30", end: "18:00", days: ALL_WEEKDAYS, inDays: 0, isoDay: 5 });
  });

  it("nach dem letzten Fenster des Tages zeigt es auf das früheste (= morgen)", () => {
    expect(nextCleaningWindow(fenster, new Date("2026-07-10T20:00:00Z"), TZ))
      .toEqual({ start: "05:30", end: "07:00", days: ALL_WEEKDAYS, inDays: 1, isoDay: 6 });
  });

  it("läuft man gerade IN einem Fenster, kommt das darauffolgende", () => {
    // 06:00 Ortszeit liegt im Morgenfenster — gefragt ist „wann wieder", nicht „jetzt offen".
    expect(nextCleaningWindow(fenster, new Date("2026-07-10T04:00:00Z"), TZ))
      .toEqual({ start: "17:30", end: "18:00", days: ALL_WEEKDAYS, inDays: 0, isoDay: 5 });
  });

  it("ohne konfigurierte Fenster: null (nicht zeitgebunden)", () => {
    expect(nextCleaningWindow([], new Date("2026-07-10T10:24:00Z"), TZ)).toBeNull();
    expect(nextCleaningWindow(null, new Date("2026-07-10T10:24:00Z"), TZ)).toBeNull();
  });

  it("überspringt Tage, an denen kein Fenster gilt", () => {
    // Freitagmittag, das einzige Fenster gilt montags → erst in drei Tagen.
    const nur_montags = [{ start: "06:00", end: "07:00", days: MO }];
    expect(nextCleaningWindow(nur_montags, new Date("2026-07-10T10:24:00Z"), TZ))
      .toEqual({ start: "06:00", end: "07:00", days: MO, inDays: 3, isoDay: 1 });
  });

  it("ist das heutige Fenster verstrichen, ist der nächste Termin in einer Woche", () => {
    // Nur freitags 06:00 — freitags um 12:24 ist es vorbei. Ein Suchlauf über bloss sechs Tage
    // fände hier nichts und meldete fälschlich „kein Fenster".
    const nur_freitags = [{ start: "06:00", end: "07:00", days: FR }];
    expect(nextCleaningWindow(nur_freitags, new Date("2026-07-10T10:24:00Z"), TZ))
      .toEqual({ start: "06:00", end: "07:00", days: FR, inDays: 7, isoDay: 5 });
  });

  it("nimmt am Tag selbst das früheste noch kommende Fenster", () => {
    const tagesplan = [
      { start: "22:00", end: "23:00", days: FR },
      { start: "18:00", end: "19:00", days: FR },
      { start: "06:00", end: "07:00", days: FR },
    ];
    expect(nextCleaningWindow(tagesplan, new Date("2026-07-10T10:24:00Z"), TZ))
      .toMatchObject({ start: "18:00", inDays: 0 });
  });
});

describe("Wochentage der Reinigungsfenster", () => {
  const TZ = "Europe/Zurich";
  // 2026-07-10T10:24Z = Freitag 12:24 Zürcher Ortszeit.
  const freitagMittag = new Date("2026-07-10T10:24:00Z");

  it("ein Fenster gilt nur an seinen Tagen", () => {
    const fenster = [{ start: "12:00", end: "13:00", days: DI }];
    expect(activeCleaningWindow(fenster, freitagMittag, TZ)).toBeNull();
    expect(activeCleaningWindow([{ start: "12:00", end: "13:00", days: FR }], freitagMittag, TZ)).toBe("13:00");
  });

  it("Bestand ohne `days` gilt weiter an jedem Tag", () => {
    // Der Regressions-Fall der Umstellung: ein Fenster aus der Zeit davor darf sich nicht dadurch
    // ändern, dass es die Frage nicht kannte.
    expect(parseCleaningWindows([{ start: "12:00", end: "13:00" }])[0].days).toBe(ALL_WEEKDAYS);
    expect(activeCleaningWindow([{ start: "12:00", end: "13:00" }], freitagMittag, TZ)).toBe("13:00");
  });

  it("eine Maske, die nie gilt, wird beim SCHREIBEN abgelehnt", () => {
    expect(cleaningWindowProblem({ start: "12:00", end: "13:00", days: 0 })).toBe(INVALID_TIME);
    expect(cleaningWindowProblem({ start: "12:00", end: "13:00", days: 999 })).toBe(INVALID_TIME);
    expect(cleaningWindowProblem({ start: "12:00", end: "13:00", days: DI })).toBeNull();
    // Fehlende Tage sind erlaubt — sie heissen „täglich".
    expect(cleaningWindowProblem({ start: "12:00", end: "13:00" })).toBeNull();
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
    // Der Lese-Pfad ergänzt die fehlenden Wochentage mit „täglich" — sonst unverändert.
    expect(parseCleaningWindows(geschrieben)).toEqual(geschrieben.map((f) => ({ ...f, days: ALL_WEEKDAYS })));
  });

  it("gespeicherte Alt-Fenster bleiben lesbar, auch wenn die Schreib-Regel sie heute ablehnte", () => {
    // Ein per API abgelegtes „99:00-99:30" ist Bestand — der Lese-Pfad darf es nicht nachträglich
    // löschen, nur neu schreiben lässt es sich nicht mehr.
    expect(parseCleaningWindows([{ start: "99:00", end: "99:30" }])).toEqual([{ start: "99:00", end: "99:30", days: ALL_WEEKDAYS }]);
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
    expect(formatCleaningWindows({ start: "19:00", end: "20:00", days: ALL_WEEKDAYS })).toBe("19:00-20:00");
  });
});
