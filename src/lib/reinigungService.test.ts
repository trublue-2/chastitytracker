import { describe, it, expect } from "vitest";
import { aktivesReinigungsFenster, countCleaningUsedToday, nextReinigungsFenster } from "./reinigungService";

describe("aktivesReinigungsFenster — per-user timezone", () => {
  const windows = [{ start: "20:00", end: "22:00" }];
  // 2026-01-15T01:30Z = 20:30 in New York (Jan 14, inside the window) but 02:30 in Zurich (outside).
  const now = new Date("2026-01-15T01:30:00Z");

  it("evaluates the wall-clock window in the given tz", () => {
    expect(aktivesReinigungsFenster(windows, now, "America/New_York")).toBe("22:00");
    expect(aktivesReinigungsFenster(windows, now, "Europe/Zurich")).toBeNull();
  });

  it("default tz === Europe/Zurich (regression: existing users unchanged)", () => {
    expect(aktivesReinigungsFenster(windows, now)).toBe(aktivesReinigungsFenster(windows, now, "Europe/Zurich"));
  });

  it("accepts the stored JSON-string form", () => {
    expect(aktivesReinigungsFenster(JSON.stringify(windows), now, "America/New_York")).toBe("22:00");
  });
});

describe("nextReinigungsFenster", () => {
  const fenster = [{ start: "17:30", end: "18:00" }, { start: "05:30", end: "07:00" }];
  const TZ = "Europe/Zurich";

  it("liefert das nächste heute beginnende Fenster", () => {
    // 12:24 Ortszeit → das Abendfenster kommt als nächstes.
    expect(nextReinigungsFenster(fenster, new Date("2026-07-10T10:24:00Z"), TZ)).toEqual({ start: "17:30", end: "18:00" });
  });

  it("nach dem letzten Fenster des Tages zeigt es auf das früheste (= morgen)", () => {
    expect(nextReinigungsFenster(fenster, new Date("2026-07-10T20:00:00Z"), TZ)).toEqual({ start: "05:30", end: "07:00" });
  });

  it("läuft man gerade IN einem Fenster, kommt das darauffolgende", () => {
    // 06:00 Ortszeit liegt im Morgenfenster — gefragt ist „wann wieder", nicht „jetzt offen".
    expect(nextReinigungsFenster(fenster, new Date("2026-07-10T04:00:00Z"), TZ)).toEqual({ start: "17:30", end: "18:00" });
  });

  it("ohne konfigurierte Fenster: null (nicht zeitgebunden)", () => {
    expect(nextReinigungsFenster([], new Date("2026-07-10T10:24:00Z"), TZ)).toBeNull();
    expect(nextReinigungsFenster(null, new Date("2026-07-10T10:24:00Z"), TZ)).toBeNull();
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
