import { describe, it, expect } from "vitest";
import { aktivesReinigungsFenster, nextReinigungsFenster } from "./reinigungService";

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
