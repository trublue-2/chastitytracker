import { describe, it, expect } from "vitest";
import { hhmmToMinutes, isInQuietMinutes, generateAutoKontrollen, type AutoKontrolleSettings } from "./autoKontrolleService";
import { midnightInTZ } from "./utils";

describe("hhmmToMinutes", () => {
  it("converts HH:MM to minutes since midnight", () => {
    expect(hhmmToMinutes("00:00")).toBe(0);
    expect(hhmmToMinutes("06:00")).toBe(360);
    expect(hhmmToMinutes("22:00")).toBe(1320);
    expect(hhmmToMinutes("23:59")).toBe(1439);
  });
});

describe("isInQuietMinutes (wrap-aware)", () => {
  it("handles a midnight-wrapping window (22:00–06:00)", () => {
    const von = 1320, bis = 360; // 22:00 .. 06:00
    expect(isInQuietMinutes(von, bis, hhmmToMinutes("23:00"))).toBe(true);
    expect(isInQuietMinutes(von, bis, hhmmToMinutes("05:00"))).toBe(true);
    expect(isInQuietMinutes(von, bis, hhmmToMinutes("22:00"))).toBe(true);
    expect(isInQuietMinutes(von, bis, hhmmToMinutes("06:00"))).toBe(false); // Ende exklusiv
    expect(isInQuietMinutes(von, bis, hhmmToMinutes("12:00"))).toBe(false);
  });
  it("handles a same-day window (01:00–05:00)", () => {
    const von = 60, bis = 300;
    expect(isInQuietMinutes(von, bis, hhmmToMinutes("02:00"))).toBe(true);
    expect(isInQuietMinutes(von, bis, hhmmToMinutes("12:00"))).toBe(false);
  });
  it("empty window (von == bis) is never quiet", () => {
    expect(isInQuietMinutes(360, 360, 360)).toBe(false);
  });
});

describe("generateAutoKontrollen", () => {
  // now = CH-Mitternacht → das ganze Wach-Fenster liegt in der Zukunft (alle Slots werden behalten).
  const now = midnightInTZ(new Date("2026-06-15T12:00:00Z"));
  const dayBase = midnightInTZ(now).getTime();
  const base: AutoKontrolleSettings = { aktiv: true, proTag: 4, ruheVon: "22:00", ruheBis: "06:00", fristVon: 15, fristBis: 60 };

  const deadlineMin = (s: { deadline: Date }) => Math.round((s.deadline.getTime() - dayBase) / 60_000);
  const durationMin = (s: { wirksamAb: Date; deadline: Date }) => Math.round((s.deadline.getTime() - s.wirksamAb.getTime()) / 60_000);

  it("returns 0 slots when proTag is 0", () => {
    expect(generateAutoKontrollen({ ...base, proTag: 0 }, now)).toHaveLength(0);
  });

  it("respects proTag count and all constraints (standard 22–06 window)", () => {
    const slots = generateAutoKontrollen(base, now, () => 0.5);
    expect(slots.length).toBeLessThanOrEqual(base.proTag);
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) {
      // Frist im Wach-Fenster (NICHT im Schlaf-Fenster 22–06)
      expect(isInQuietMinutes(1320, 360, deadlineMin(s))).toBe(false);
      // Erfüllungsdauer im konfigurierten Bereich
      const dur = durationMin(s);
      expect(dur).toBeGreaterThanOrEqual(base.fristVon);
      expect(dur).toBeLessThanOrEqual(base.fristBis);
      // nur Zukunft
      expect(s.wirksamAb.getTime()).toBeGreaterThan(now.getTime());
    }
  });

  it("produces non-overlapping inspections (sorted by trigger)", () => {
    const slots = generateAutoKontrollen(base, now, () => 0.5).sort((a, b) => a.wirksamAb.getTime() - b.wirksamAb.getTime());
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i].wirksamAb.getTime()).toBeGreaterThanOrEqual(slots[i - 1].deadline.getTime());
    }
  });

  it("works with extreme rand values (0 and ~1)", () => {
    for (const r of [0, 0.999999]) {
      const slots = generateAutoKontrollen(base, now, () => r);
      for (const s of slots) {
        expect(isInQuietMinutes(1320, 360, deadlineMin(s))).toBe(false);
        expect(durationMin(s)).toBeGreaterThanOrEqual(base.fristVon);
      }
    }
  });
});
