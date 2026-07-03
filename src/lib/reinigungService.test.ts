import { describe, it, expect } from "vitest";
import { aktivesReinigungsFenster } from "./reinigungService";

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
