import { describe, it, expect } from "vitest";
import { WEAR_LEGEND, WEAR_LEVEL_UPPER, wearIntensityLevel } from "./wearIntensity";

describe("WEAR_LEGEND", () => {
  it("nennt die Bänder der Schwellen, nach denen eingefärbt wird (20/40/80 %)", () => {
    expect(WEAR_LEGEND.map((e) => e.label)).toEqual(["0 %", "0–20 %", "20–40 %", "40–80 %", "80–100 %"]);
  });

  it("trifft mit jeder Schwelle die Stufe, die die Legende daneben schreibt", () => {
    // Knapp unter der Schwelle gehört zur Stufe davor, knapp darüber zur nächsten. Mit Abstand statt
    // exakt auf der Schwelle, damit das Ergebnis nicht an der Gleitkomma-Rundung von `upper * 24` hängt.
    WEAR_LEVEL_UPPER.forEach((upper, i) => {
      const hoursAtBound = upper * 24;
      expect(wearIntensityLevel(hoursAtBound - 0.01)).toBe(i + 1);
      expect(wearIntensityLevel(hoursAtBound + 0.01)).toBe(i + 2);
    });
  });
});
