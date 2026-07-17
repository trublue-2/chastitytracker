import { describe, it, expect } from "vitest";
import {
  buildPairs,
  buildKgWearPairs,
  wearingHoursFromPairs,
  mergeWearPairs,
  mapAnforderungStatus,
  isSubVisibleKontrolle,
  interruptionPauseMs,
  WEAR_PAIR,
  formatDateTime,
  toDatetimeLocal,
  fromDatetimeLocal,
  midnightInTZ,
  getWeekStart,
  getMonthEnd,
  getYearStart,
  getYearEnd,
  formatDateTimeDual,
  formatDayTimeDual,
  type ReinigungSettings,
} from "./utils";

// ─── Test fixtures ─────────────────────────────────────────────────────────

type Entry = {
  id: string;
  type: string;
  startTime: Date;
  oeffnenGrund?: string | null;
};

const t = (iso: string): Date => new Date(iso);

const mkEntry = (id: string, type: string, time: string, oeffnenGrund?: string): Entry => ({
  id,
  type,
  startTime: t(time),
  oeffnenGrund: oeffnenGrund ?? null,
});

const reinigung: ReinigungSettings = { erlaubt: true, maxMinuten: 30 };

// ─── buildPairs — basic pairing ────────────────────────────────────────────

describe("buildPairs", () => {
  it("returns empty array for no entries", () => {
    expect(buildPairs([], [])).toEqual([]);
  });

  it("builds a single closed pair from VERSCHLUSS → OEFFNEN", () => {
    const entries = [
      mkEntry("v1", "VERSCHLUSS", "2026-05-01T10:00:00Z"),
      mkEntry("o1", "OEFFNEN", "2026-05-01T14:00:00Z"),
    ];
    const result = buildPairs(entries, []);
    expect(result).toHaveLength(1);
    expect(result[0].verschluss.id).toBe("v1");
    expect(result[0].oeffnen?.id).toBe("o1");
    expect(result[0].active).toBe(false);
    expect(result[0].interruptions).toEqual([]);
  });

  it("marks open session as active when no OEFFNEN follows", () => {
    const entries = [mkEntry("v1", "VERSCHLUSS", "2026-05-01T10:00:00Z")];
    const result = buildPairs(entries, []);
    expect(result).toHaveLength(1);
    expect(result[0].active).toBe(true);
    expect(result[0].oeffnen).toBeNull();
  });

  it("orders pairs newest first", () => {
    const entries = [
      mkEntry("v1", "VERSCHLUSS", "2026-05-01T10:00:00Z"),
      mkEntry("o1", "OEFFNEN", "2026-05-01T14:00:00Z"),
      mkEntry("v2", "VERSCHLUSS", "2026-05-02T10:00:00Z"),
      mkEntry("o2", "OEFFNEN", "2026-05-02T14:00:00Z"),
    ];
    const result = buildPairs(entries, []);
    expect(result).toHaveLength(2);
    expect(result[0].verschluss.id).toBe("v2"); // newest first
    expect(result[1].verschluss.id).toBe("v1");
  });

  it("ignores PRUEFUNG and ORGASMUS entries", () => {
    const entries = [
      mkEntry("v1", "VERSCHLUSS", "2026-05-01T10:00:00Z"),
      mkEntry("p1", "PRUEFUNG", "2026-05-01T11:00:00Z"),
      mkEntry("g1", "ORGASMUS", "2026-05-01T12:00:00Z"),
      mkEntry("o1", "OEFFNEN", "2026-05-01T14:00:00Z"),
    ];
    const result = buildPairs(entries, []);
    expect(result).toHaveLength(1);
    expect(result[0].verschluss.id).toBe("v1");
    expect(result[0].oeffnen?.id).toBe("o1");
  });

  it("marks a double VERSCHLUSS (no OEFFNEN between) as an orphaned pair, not a silent inconsistency", () => {
    const entries = [
      mkEntry("v1", "VERSCHLUSS", "2026-05-01T10:00:00Z"),
      mkEntry("v2", "VERSCHLUSS", "2026-05-01T12:00:00Z"),
    ];
    const result = buildPairs(entries, []);
    expect(result).toHaveLength(2);
    // v2 is the real (latest) active session — not orphaned
    expect(result[0].verschluss.id).toBe("v2");
    expect(result[0].active).toBe(true);
    expect(result[0].orphaned).toBeFalsy();
    // v1 is the anomalous, superseded VERSCHLUSS: active:true keeps the oeffnen===null <=> active
    // invariant intact, but orphaned:true tells "current session" consumers to ignore it.
    expect(result[1].verschluss.id).toBe("v1");
    expect(result[1].oeffnen).toBeNull();
    expect(result[1].active).toBe(true);
    expect(result[1].orphaned).toBe(true);
  });

  it("ignores leading OEFFNEN (no preceding VERSCHLUSS)", () => {
    const entries = [
      mkEntry("o1", "OEFFNEN", "2026-05-01T10:00:00Z"),
      mkEntry("v1", "VERSCHLUSS", "2026-05-01T11:00:00Z"),
      mkEntry("o2", "OEFFNEN", "2026-05-01T14:00:00Z"),
    ];
    const result = buildPairs(entries, []);
    expect(result).toHaveLength(1);
    expect(result[0].verschluss.id).toBe("v1");
    expect(result[0].oeffnen?.id).toBe("o2");
  });
});

// ─── buildPairs — Reinigungs-Interruption ──────────────────────────────────

describe("buildPairs — Reinigungs-Interruption", () => {
  it("treats short REINIGUNG as interruption (within maxMinuten)", () => {
    const entries = [
      mkEntry("v1", "VERSCHLUSS", "2026-05-01T10:00:00Z"),
      mkEntry("o1", "OEFFNEN", "2026-05-01T11:00:00Z", "REINIGUNG"),
      mkEntry("v2", "VERSCHLUSS", "2026-05-01T11:15:00Z"), // 15min later → within 30min
      mkEntry("o2", "OEFFNEN", "2026-05-01T14:00:00Z"),
    ];
    const result = buildPairs(entries, [], reinigung);
    expect(result).toHaveLength(1);
    expect(result[0].verschluss.id).toBe("v1");
    expect(result[0].oeffnen?.id).toBe("o2");
    expect(result[0].interruptions).toHaveLength(1);
    expect(result[0].interruptions[0].oeffnen.id).toBe("o1");
    expect(result[0].interruptions[0].verschluss.id).toBe("v2");
  });

  it("closes session when REINIGUNG re-lock is past maxMinuten (timeout)", () => {
    const entries = [
      mkEntry("v1", "VERSCHLUSS", "2026-05-01T10:00:00Z"),
      mkEntry("o1", "OEFFNEN", "2026-05-01T11:00:00Z", "REINIGUNG"),
      mkEntry("v2", "VERSCHLUSS", "2026-05-01T12:00:00Z"), // 60min later → past 30min
    ];
    const result = buildPairs(entries, [], reinigung);
    expect(result).toHaveLength(2);
    // Newest first: v2 is the active session
    expect(result[0].verschluss.id).toBe("v2");
    expect(result[0].active).toBe(true);
    // First pair closes at the REINIGUNG-OEFFNEN
    expect(result[1].verschluss.id).toBe("v1");
    expect(result[1].oeffnen?.id).toBe("o1");
    expect(result[1].active).toBe(false);
    expect(result[1].interruptions).toEqual([]);
  });

  it("treats REINIGUNG as session end when reinigung is disabled", () => {
    const entries = [
      mkEntry("v1", "VERSCHLUSS", "2026-05-01T10:00:00Z"),
      mkEntry("o1", "OEFFNEN", "2026-05-01T11:00:00Z", "REINIGUNG"),
      mkEntry("v2", "VERSCHLUSS", "2026-05-01T11:15:00Z"),
    ];
    const result = buildPairs(entries, [], { erlaubt: false, maxMinuten: 30 });
    expect(result).toHaveLength(2);
    expect(result[0].verschluss.id).toBe("v2");
    expect(result[1].verschluss.id).toBe("v1");
    expect(result[1].oeffnen?.id).toBe("o1");
  });

  it("closes session at pending REINIGUNG when next OEFFNEN is non-cleaning", () => {
    const entries = [
      mkEntry("v1", "VERSCHLUSS", "2026-05-01T10:00:00Z"),
      mkEntry("o1", "OEFFNEN", "2026-05-01T11:00:00Z", "REINIGUNG"),
      mkEntry("v2", "VERSCHLUSS", "2026-05-01T11:15:00Z"),
      mkEntry("o2", "OEFFNEN", "2026-05-01T11:25:00Z", "ALLTAG"),
    ];
    const result = buildPairs(entries, [], reinigung);
    expect(result).toHaveLength(1);
    expect(result[0].verschluss.id).toBe("v1");
    expect(result[0].oeffnen?.id).toBe("o2");
    expect(result[0].interruptions).toHaveLength(1);
  });

  it("treats trailing pending REINIGUNG as session-end (active=false, ends at REINIGUNG-OEFFNEN)", () => {
    const entries = [
      mkEntry("v1", "VERSCHLUSS", "2026-05-01T10:00:00Z"),
      mkEntry("o1", "OEFFNEN", "2026-05-01T11:00:00Z", "REINIGUNG"),
    ];
    const result = buildPairs(entries, [], reinigung);
    expect(result).toHaveLength(1);
    expect(result[0].verschluss.id).toBe("v1");
    expect(result[0].oeffnen?.id).toBe("o1");
    expect(result[0].active).toBe(false);
  });

  it("treats REINIGUNG re-lock at exactly maxMinuten as interruption (boundary inclusive)", () => {
    const entries = [
      mkEntry("v1", "VERSCHLUSS", "2026-05-01T10:00:00Z"),
      mkEntry("o1", "OEFFNEN", "2026-05-01T11:00:00Z", "REINIGUNG"),
      mkEntry("v2", "VERSCHLUSS", "2026-05-01T11:30:00Z"), // exactly 30min
    ];
    const result = buildPairs(entries, [], reinigung);
    expect(result).toHaveLength(1);
    expect(result[0].interruptions).toHaveLength(1);
    expect(result[0].active).toBe(true);
  });

  it("accepts options object with reinigung key (modern call shape)", () => {
    const entries = [
      mkEntry("v1", "VERSCHLUSS", "2026-05-01T10:00:00Z"),
      mkEntry("o1", "OEFFNEN", "2026-05-01T11:00:00Z", "REINIGUNG"),
      mkEntry("v2", "VERSCHLUSS", "2026-05-01T11:15:00Z"),
      mkEntry("o2", "OEFFNEN", "2026-05-01T14:00:00Z"),
    ];
    const result = buildPairs(entries, [], { reinigung });
    expect(result).toHaveLength(1);
    expect(result[0].interruptions).toHaveLength(1);
  });

  it("supports multiple cleaning interruptions in one session", () => {
    const entries = [
      mkEntry("v1", "VERSCHLUSS", "2026-05-01T10:00:00Z"),
      mkEntry("o1", "OEFFNEN", "2026-05-01T11:00:00Z", "REINIGUNG"),
      mkEntry("v2", "VERSCHLUSS", "2026-05-01T11:10:00Z"),
      mkEntry("o2", "OEFFNEN", "2026-05-01T15:00:00Z", "REINIGUNG"),
      mkEntry("v3", "VERSCHLUSS", "2026-05-01T15:20:00Z"),
      mkEntry("o3", "OEFFNEN", "2026-05-01T20:00:00Z"),
    ];
    const result = buildPairs(entries, [], reinigung);
    expect(result).toHaveLength(1);
    expect(result[0].verschluss.id).toBe("v1");
    expect(result[0].oeffnen?.id).toBe("o3");
    expect(result[0].interruptions).toHaveLength(2);
  });
});

// ─── buildPairs — Kontrollen-Zuordnung ─────────────────────────────────────

describe("buildPairs — Kontrollen", () => {
  it("assigns kontrolle to the matching pair", () => {
    const entries = [
      mkEntry("v1", "VERSCHLUSS", "2026-05-01T10:00:00Z"),
      mkEntry("o1", "OEFFNEN", "2026-05-01T14:00:00Z"),
    ];
    const kontrollen = [{ id: "k1", time: t("2026-05-01T12:00:00Z") }];
    const result = buildPairs(entries, kontrollen);
    expect(result[0].kontrollen).toHaveLength(1);
  });

  it("does not assign kontrolle outside any pair window", () => {
    const entries = [
      mkEntry("v1", "VERSCHLUSS", "2026-05-01T10:00:00Z"),
      mkEntry("o1", "OEFFNEN", "2026-05-01T14:00:00Z"),
    ];
    const kontrollen = [{ id: "k1", time: t("2026-05-01T20:00:00Z") }];
    const result = buildPairs(entries, kontrollen);
    expect(result[0].kontrollen).toEqual([]);
  });

  it("assigns kontrolle to active session (open-ended pair)", () => {
    const entries = [mkEntry("v1", "VERSCHLUSS", "2026-05-01T10:00:00Z")];
    const kontrollen = [{ id: "k1", time: t("2026-05-01T12:00:00Z") }];
    const result = buildPairs(entries, kontrollen);
    expect(result[0].kontrollen).toHaveLength(1);
  });
});

// ─── interruptionPauseMs ───────────────────────────────────────────────────

describe("interruptionPauseMs", () => {
  it("returns 0 for empty interruptions", () => {
    expect(interruptionPauseMs([])).toBe(0);
  });

  it("sums durations of all interruptions", () => {
    const interruptions = [
      { oeffnen: { startTime: t("2026-05-01T10:00:00Z") }, verschluss: { startTime: t("2026-05-01T10:15:00Z") } },
      { oeffnen: { startTime: t("2026-05-01T14:00:00Z") }, verschluss: { startTime: t("2026-05-01T14:30:00Z") } },
    ];
    // 15min + 30min = 45min in ms
    expect(interruptionPauseMs(interruptions)).toBe(45 * 60 * 1000);
  });
});

// ─── buildKgWearPairs ────────────────────────────────────────────────────────

describe("buildKgWearPairs", () => {
  it("builds pairs and uses `now` for open sessions", () => {
    const now = t("2026-05-01T20:00:00Z");
    const entries = [
      { type: "VERSCHLUSS", startTime: t("2026-05-01T10:00:00Z") },
      { type: "OEFFNEN", startTime: t("2026-05-01T14:00:00Z") },
      { type: "VERSCHLUSS", startTime: t("2026-05-01T18:00:00Z") },
    ];
    const result = buildKgWearPairs(entries, now);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ start: t("2026-05-01T10:00:00Z"), end: t("2026-05-01T14:00:00Z") });
    expect(result[1]).toEqual({ start: t("2026-05-01T18:00:00Z"), end: now });
  });

  it("filters out non-VERSCHLUSS/OEFFNEN entries", () => {
    const now = t("2026-05-01T20:00:00Z");
    const entries = [
      { type: "PRUEFUNG", startTime: t("2026-05-01T09:00:00Z") },
      { type: "VERSCHLUSS", startTime: t("2026-05-01T10:00:00Z") },
      { type: "ORGASMUS", startTime: t("2026-05-01T12:00:00Z") },
      { type: "OEFFNEN", startTime: t("2026-05-01T14:00:00Z") },
    ];
    const result = buildKgWearPairs(entries, now);
    expect(result).toHaveLength(1);
  });
});

// ─── wearingHoursFromPairs ─────────────────────────────────────────────────

describe("wearingHoursFromPairs", () => {
  it("returns 0 for empty pairs", () => {
    expect(wearingHoursFromPairs([], t("2026-05-01T00:00:00Z"), t("2026-05-02T00:00:00Z"))).toBe(0);
  });

  it("sums full pair duration when fully inside range", () => {
    const pairs = [{ start: t("2026-05-01T10:00:00Z"), end: t("2026-05-01T14:00:00Z") }];
    const hours = wearingHoursFromPairs(pairs, t("2026-05-01T00:00:00Z"), t("2026-05-02T00:00:00Z"));
    expect(hours).toBe(4);
  });

  it("clips pair to range overlap", () => {
    const pairs = [{ start: t("2026-05-01T22:00:00Z"), end: t("2026-05-02T06:00:00Z") }];
    // range = 2026-05-02T00 → 2026-05-02T12 → overlap = 6h
    const hours = wearingHoursFromPairs(pairs, t("2026-05-02T00:00:00Z"), t("2026-05-02T12:00:00Z"));
    expect(hours).toBe(6);
  });

  it("returns 0 when pair is fully outside range", () => {
    const pairs = [{ start: t("2026-05-01T10:00:00Z"), end: t("2026-05-01T14:00:00Z") }];
    const hours = wearingHoursFromPairs(pairs, t("2026-05-02T00:00:00Z"), t("2026-05-02T12:00:00Z"));
    expect(hours).toBe(0);
  });
});

// ─── buildPairs — Generic types (WEAR_PAIR) ────────────────────────────────

describe("buildPairs — WEAR_PAIR", () => {
  it("builds pairs from WEAR_BEGIN/WEAR_END entries", () => {
    const entries = [
      mkEntry("w1", "WEAR_BEGIN", "2026-05-01T10:00:00Z"),
      mkEntry("e1", "WEAR_END", "2026-05-01T14:00:00Z"),
    ];
    const result = buildPairs(entries, [], { types: WEAR_PAIR });
    expect(result).toHaveLength(1);
    expect(result[0].verschluss.id).toBe("w1");
    expect(result[0].oeffnen?.id).toBe("e1");
  });

  it("ignores VERSCHLUSS/OEFFNEN entries when WEAR_PAIR is selected", () => {
    const entries = [
      mkEntry("v1", "VERSCHLUSS", "2026-05-01T08:00:00Z"),
      mkEntry("w1", "WEAR_BEGIN", "2026-05-01T10:00:00Z"),
      mkEntry("e1", "WEAR_END", "2026-05-01T14:00:00Z"),
      mkEntry("o1", "OEFFNEN", "2026-05-01T16:00:00Z"),
    ];
    const result = buildPairs(entries, [], { types: WEAR_PAIR });
    expect(result).toHaveLength(1);
    expect(result[0].verschluss.id).toBe("w1");
  });

  it("does NOT apply REINIGUNG interruption logic for WEAR_PAIR even with reinigung set", () => {
    const entries = [
      { ...mkEntry("w1", "WEAR_BEGIN", "2026-05-01T10:00:00Z") },
      { ...mkEntry("e1", "WEAR_END", "2026-05-01T11:00:00Z"), oeffnenGrund: "REINIGUNG" },
      { ...mkEntry("w2", "WEAR_BEGIN", "2026-05-01T11:15:00Z") },
    ];
    const result = buildPairs(entries, [], {
      types: WEAR_PAIR,
      reinigung: { erlaubt: true, maxMinuten: 30 },
    });
    // Two separate pairs — no merge, because reinigung is gated to KG_PAIR
    expect(result).toHaveLength(2);
    expect(result[0].verschluss.id).toBe("w2");
    expect(result[0].active).toBe(true);
    expect(result[1].verschluss.id).toBe("w1");
    expect(result[1].oeffnen?.id).toBe("e1");
    expect(result[1].interruptions).toEqual([]);
  });
});

// ─── mergeWearPairs ────────────────────────────────────────────────────────

describe("mergeWearPairs", () => {
  it("merges overlapping pairs into wall-clock intervals", () => {
    // Plug A 10:00–14:00, Plug B 11:00–13:00 (innerhalb A) → eine Wanduhr-Spanne 10:00–14:00.
    const merged = mergeWearPairs([
      { start: t("2026-05-01T10:00:00Z"), end: t("2026-05-01T14:00:00Z") },
      { start: t("2026-05-01T11:00:00Z"), end: t("2026-05-01T13:00:00Z") },
    ]);
    expect(merged).toEqual([{ start: t("2026-05-01T10:00:00Z"), end: t("2026-05-01T14:00:00Z") }]);
    expect(wearingHoursFromPairs(merged, t("2026-05-01T00:00:00Z"), t("2026-05-02T00:00:00Z"))).toBe(4);
  });

  it("extends the interval when the second pair ends later", () => {
    const merged = mergeWearPairs([
      { start: t("2026-05-01T10:00:00Z"), end: t("2026-05-01T14:00:00Z") },
      { start: t("2026-05-01T13:00:00Z"), end: t("2026-05-01T18:00:00Z") },
    ]);
    expect(merged).toEqual([{ start: t("2026-05-01T10:00:00Z"), end: t("2026-05-01T18:00:00Z") }]);
  });

  it("keeps disjoint pairs separate and sorts them", () => {
    const merged = mergeWearPairs([
      { start: t("2026-05-01T16:00:00Z"), end: t("2026-05-01T18:00:00Z") },
      { start: t("2026-05-01T10:00:00Z"), end: t("2026-05-01T12:00:00Z") },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0].start).toEqual(t("2026-05-01T10:00:00Z"));
    expect(merged[1].start).toEqual(t("2026-05-01T16:00:00Z"));
  });

  it("does not mutate the input pairs", () => {
    const input = [
      { start: t("2026-05-01T10:00:00Z"), end: t("2026-05-01T14:00:00Z") },
      { start: t("2026-05-01T13:00:00Z"), end: t("2026-05-01T18:00:00Z") },
    ];
    mergeWearPairs(input);
    expect(input[0].end).toEqual(t("2026-05-01T14:00:00Z"));
  });

  it("returns an empty array for no pairs", () => {
    expect(mergeWearPairs([])).toEqual([]);
  });
});

describe("per-user timezone formatters", () => {
  // Winter instant (no DST): Zurich = UTC+1, New York = UTC-5
  const winter = new Date("2026-01-15T09:30:00Z");
  // Summer instant (DST): Zurich = UTC+2, New York = UTC-4
  const summer = new Date("2026-07-15T09:30:00Z");

  describe("regression guarantee — default tz === explicit Europe/Zurich (existing users byte-identical)", () => {
    for (const d of [winter, summer, new Date("2026-01-14T02:00:00Z")]) {
      it(`formatDateTime default === Europe/Zurich for ${d.toISOString()}`, () => {
        expect(formatDateTime(d, "de-CH")).toBe(formatDateTime(d, "de-CH", "Europe/Zurich"));
      });
      it(`toDatetimeLocal default === Europe/Zurich for ${d.toISOString()}`, () => {
        expect(toDatetimeLocal(d)).toBe(toDatetimeLocal(d, "Europe/Zurich"));
      });
      it(`midnightInTZ default === Europe/Zurich for ${d.toISOString()}`, () => {
        expect(midnightInTZ(d).getTime()).toBe(midnightInTZ(d, "Europe/Zurich").getTime());
      });
      it(`getWeekStart default === Europe/Zurich for ${d.toISOString()}`, () => {
        expect(getWeekStart(d).getTime()).toBe(getWeekStart(d, "Europe/Zurich").getTime());
      });
    }
  });

  describe("formatDateTime renders in the given tz (independent of process.env.TZ)", () => {
    it("winter: Zurich +1 vs New York -5", () => {
      expect(formatDateTime(winter, "de-CH", "Europe/Zurich")).toBe("15.01.2026, 10:30");
      expect(formatDateTime(winter, "de-CH", "America/New_York")).toBe("15.01.2026, 04:30");
    });
    it("summer DST: Zurich +2 vs New York -4", () => {
      expect(formatDateTime(summer, "de-CH", "Europe/Zurich")).toBe("15.07.2026, 11:30");
      expect(formatDateTime(summer, "de-CH", "America/New_York")).toBe("15.07.2026, 05:30");
    });
  });

  describe("toDatetimeLocal renders wall-clock in the given tz", () => {
    it("winter", () => {
      expect(toDatetimeLocal(winter, "Europe/Zurich")).toBe("2026-01-15T10:30");
      expect(toDatetimeLocal(winter, "America/New_York")).toBe("2026-01-15T04:30");
    });
    it("summer DST", () => {
      expect(toDatetimeLocal(summer, "America/New_York")).toBe("2026-07-15T05:30");
    });
  });

  describe("fromDatetimeLocal parses a wall-clock string AS the given tz → UTC", () => {
    it("winter: 10:30 Zurich = 09:30 UTC", () => {
      expect(fromDatetimeLocal("2026-01-15T10:30", "Europe/Zurich").toISOString()).toBe("2026-01-15T09:30:00.000Z");
    });
    it("winter: 04:30 New York = 09:30 UTC", () => {
      expect(fromDatetimeLocal("2026-01-15T04:30", "America/New_York").toISOString()).toBe("2026-01-15T09:30:00.000Z");
    });
    it("summer DST: 05:30 New York = 09:30 UTC", () => {
      expect(fromDatetimeLocal("2026-07-15T05:30", "America/New_York").toISOString()).toBe("2026-07-15T09:30:00.000Z");
    });
    it("invalid input → Invalid Date", () => {
      expect(Number.isNaN(fromDatetimeLocal("", "Europe/Zurich").getTime())).toBe(true);
      expect(Number.isNaN(fromDatetimeLocal(null).getTime())).toBe(true);
    });
    it("round-trips with toDatetimeLocal at minute precision (across zones + DST)", () => {
      for (const tz of ["Europe/Zurich", "America/New_York", "Asia/Tokyo", "UTC"]) {
        for (const iso of ["2026-01-15T09:30:00Z", "2026-07-15T09:30:00Z", "2026-03-29T00:30:00Z"]) {
          const d = new Date(iso);
          const round = fromDatetimeLocal(toDatetimeLocal(d, tz), tz);
          expect(round.getTime()).toBe(d.getTime());
        }
      }
    });
  });

  describe("midnightInTZ resolves the calendar-day boundary in the given tz", () => {
    // 02:00 UTC on Jan 15 = 03:00 Zurich (still Jan 15) but 21:00 New York (still Jan 14)
    const d = new Date("2026-01-15T02:00:00Z");
    it("Zurich midnight of Jan 15 = 23:00 UTC Jan 14", () => {
      expect(midnightInTZ(d, "Europe/Zurich").toISOString()).toBe("2026-01-14T23:00:00.000Z");
    });
    it("New York midnight of Jan 14 = 05:00 UTC Jan 14", () => {
      expect(midnightInTZ(d, "America/New_York").toISOString()).toBe("2026-01-14T05:00:00.000Z");
    });
  });

  describe("getYearStart / getYearEnd resolve the calendar-year boundary in the given tz", () => {
    const mid = new Date("2026-07-04T12:00:00Z");
    it("Zurich: year start = Jan 1 00:00 local (= 2025-12-31T23:00Z)", () => {
      expect(getYearStart(mid, "Europe/Zurich").toISOString()).toBe("2025-12-31T23:00:00.000Z");
    });
    it("Zurich: year end = next Jan 1 00:00 local (= 2026-12-31T23:00Z)", () => {
      expect(getYearEnd(mid, "Europe/Zurich").toISOString()).toBe("2026-12-31T23:00:00.000Z");
    });
    it("year window is a full non-leap year (365 days) for 2026", () => {
      const days = (getYearEnd(mid, "Europe/Zurich").getTime() - getYearStart(mid, "Europe/Zurich").getTime()) / 86_400_000;
      expect(days).toBe(365);
    });
  });

  describe("getMonthEnd resolves the first of next month in the given tz", () => {
    it("mid-month → first of next month 00:00 local", () => {
      expect(getMonthEnd(new Date("2026-07-15T12:00:00Z"), "Europe/Zurich").toISOString()).toBe("2026-07-31T22:00:00.000Z"); // 1. Aug 00:00 CEST
    });
    it("December rolls over to next January", () => {
      expect(getMonthEnd(new Date("2026-12-20T12:00:00Z"), "Europe/Zurich").toISOString()).toBe("2026-12-31T23:00:00.000Z"); // 1. Jan 2027 00:00 CET
    });
  });
});

describe("formatDateTimeDual / formatDayTimeDual — Betrachter-Zeit + Sub-Zusatz bei Abweichung", () => {
  const sameDay = new Date("2026-07-06T15:00:00Z"); // ZH 17:00, NY 11:00 — beide 06.07.
  const crossDay = new Date("2026-07-06T00:30:00Z"); // ZH 02:30 (06.07.), NY 20:30 (05.07.)
  const winter = new Date("2026-01-15T09:30:00Z"); // ZH 10:30, NY 04:30 — beide 15.01.

  it("gleiche tz → nur ein Wert, kein Zusatz", () => {
    const r = formatDateTimeDual(sameDay, "de-CH", "Europe/Zurich", "Europe/Zurich", "Sub");
    expect(r).toBe(formatDateTime(sameDay, "de-CH", "Europe/Zurich"));
    expect(r).not.toContain("·");
  });

  it("viewerTz undefined → reine Sub-Zeit (grüne Invariante)", () => {
    const r = formatDateTimeDual(sameDay, "de-CH", undefined, "America/New_York", "Sub");
    expect(r).toBe(formatDateTime(sameDay, "de-CH", "America/New_York"));
    expect(r).not.toContain("·");
  });

  it("andere tz, gleicher Kalendertag → nur Uhrzeit-Zusatz", () => {
    expect(formatDateTimeDual(sameDay, "de-CH", "Europe/Zurich", "America/New_York", "Sub"))
      .toBe("06.07.2026, 17:00 · Sub 11:00");
  });

  it("andere tz, anderer Kalendertag → Datum+Uhrzeit-Zusatz", () => {
    expect(formatDateTimeDual(crossDay, "de-CH", "Europe/Zurich", "America/New_York", "Sub"))
      .toBe("06.07.2026, 02:30 · Sub 05.07. 20:30");
  });

  it("Winter/DST: korrekter Offset im Zusatz", () => {
    expect(formatDateTimeDual(winter, "de-CH", "Europe/Zurich", "America/New_York", "Sub"))
      .toBe("15.01.2026, 10:30 · Sub 04:30");
  });

  it("andere tz-ID aber gleicher Offset (Zürich vs Berlin) → kein redundanter Zusatz", () => {
    const r = formatDateTimeDual(sameDay, "de-CH", "Europe/Zurich", "Europe/Berlin", "Sub");
    expect(r).toBe(formatDateTime(sameDay, "de-CH", "Europe/Zurich"));
    expect(r).not.toContain("·");
  });

  it("formatDayTimeDual: Primär ohne Jahr + Sub-Zusatz", () => {
    expect(formatDayTimeDual(sameDay, "de-CH", "Europe/Zurich", "America/New_York", "Sub"))
      .toBe("06.07. 17:00 · Sub 11:00");
  });

  it("Regressions-Garantie: gleiche tz identisch zu formatDateTime", () => {
    for (const d of [sameDay, crossDay, winter]) {
      expect(formatDateTimeDual(d, "de-CH", "Europe/Zurich", "Europe/Zurich", "Sub"))
        .toBe(formatDateTime(d, "de-CH", "Europe/Zurich"));
    }
  });
});

// ─── mapAnforderungStatus — Versäumnis vs. Rückzug ─────────────────────────

describe("mapAnforderungStatus — 'missed' schlägt 'withdrawn'", () => {
  const NOW = t("2026-07-14T18:00:00Z");
  const base = {
    entryId: null as string | null,
    deadline: t("2026-07-14T10:00:00Z"),   // längst abgelaufen
    fulfilledAt: null as Date | null,
    withdrawnAt: null as Date | null,
    autoMarkedRemovedAt: null as Date | null,
  };

  it("die Eskalation setzt BEIDE Felder — das ist ein Versäumnis, kein Rückzug", () => {
    // autoMarkInspectionRemoved schreibt autoMarkedRemovedAt UND withdrawnAt. Würde withdrawnAt
    // zuerst geprüft, sähe jedes Versäumnis wie ein Rückzug aus (grau „Zurückgezogen") — und die
    // Frage „hat er die Kontrolle je beantwortet?" wäre aus der Liste nicht mehr beantwortbar.
    const status = mapAnforderungStatus(
      { ...base, withdrawnAt: t("2026-07-14T14:00:00Z"), autoMarkedRemovedAt: t("2026-07-14T14:00:00Z") },
      null, NOW,
    );
    expect(status).toBe("missed");
  });

  it("ein echter Rückzug (nur withdrawnAt) bleibt 'withdrawn'", () => {
    expect(mapAnforderungStatus({ ...base, withdrawnAt: t("2026-07-14T14:00:00Z") }, null, NOW)).toBe("withdrawn");
  });

  it("unbeantwortet und Frist abgelaufen, aber noch nicht eskaliert → 'overdue'", () => {
    expect(mapAnforderungStatus(base, null, NOW)).toBe("overdue");
  });

  it("erfüllte Kontrollen bleiben unberührt", () => {
    expect(mapAnforderungStatus(
      { ...base, entryId: "e1", fulfilledAt: t("2026-07-14T09:00:00Z") }, null, NOW,
    )).toBe("fulfilled");
  });
});

describe("isSubVisibleKontrolle", () => {
  it("blendet nur echte Rückzüge aus — Versäumnisse bleiben sichtbar", () => {
    expect(isSubVisibleKontrolle({ anforderungStatus: "withdrawn" })).toBe(false);
    expect(isSubVisibleKontrolle({ anforderungStatus: "missed" })).toBe(true);
    expect(isSubVisibleKontrolle({ anforderungStatus: "fulfilled" })).toBe(true);
    expect(isSubVisibleKontrolle({ anforderungStatus: null })).toBe(true);   // freie Selbstkontrolle
  });
});
