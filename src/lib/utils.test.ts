import { describe, it, expect } from "vitest";
import {
  buildPairs,
  buildWearPairs,
  wearingHoursFromPairs,
  wearingHoursInRange,
  interruptionPauseMs,
  WEAR_PAIR,
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

  it("handles double VERSCHLUSS (no OEFFNEN between) by closing first as open-end", () => {
    const entries = [
      mkEntry("v1", "VERSCHLUSS", "2026-05-01T10:00:00Z"),
      mkEntry("v2", "VERSCHLUSS", "2026-05-01T12:00:00Z"),
    ];
    const result = buildPairs(entries, []);
    expect(result).toHaveLength(2);
    // v2 is the active (latest) one
    expect(result[0].verschluss.id).toBe("v2");
    expect(result[0].active).toBe(true);
    expect(result[1].verschluss.id).toBe("v1");
    expect(result[1].oeffnen).toBeNull();
    expect(result[1].active).toBe(false);
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

// ─── buildWearPairs ────────────────────────────────────────────────────────

describe("buildWearPairs", () => {
  it("builds pairs and uses `now` for open sessions", () => {
    const now = t("2026-05-01T20:00:00Z");
    const entries = [
      { type: "VERSCHLUSS", startTime: t("2026-05-01T10:00:00Z") },
      { type: "OEFFNEN", startTime: t("2026-05-01T14:00:00Z") },
      { type: "VERSCHLUSS", startTime: t("2026-05-01T18:00:00Z") },
    ];
    const result = buildWearPairs(entries, now);
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
    const result = buildWearPairs(entries, now);
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

// ─── buildPairs — categoryId filter ────────────────────────────────────────

describe("buildPairs — categoryId filter", () => {
  type EntryWithDevice = Entry & { device?: { categoryId?: string | null } | null };
  const mkE = (id: string, type: string, time: string, categoryId?: string): EntryWithDevice => ({
    ...mkEntry(id, type, time),
    device: categoryId ? { categoryId } : null,
  });

  it("filters entries by categoryId", () => {
    const entries: EntryWithDevice[] = [
      mkE("w1", "WEAR_BEGIN", "2026-05-01T10:00:00Z", "plug"),
      mkE("e1", "WEAR_END", "2026-05-01T14:00:00Z", "plug"),
      mkE("w2", "WEAR_BEGIN", "2026-05-01T15:00:00Z", "collar"),
      mkE("e2", "WEAR_END", "2026-05-01T20:00:00Z", "collar"),
    ];
    const result = buildPairs(entries, [], { types: WEAR_PAIR, categoryId: "plug" });
    expect(result).toHaveLength(1);
    expect(result[0].verschluss.id).toBe("w1");
  });

  it("excludes entries without device.categoryId when filter is active", () => {
    const entries: EntryWithDevice[] = [
      mkE("w1", "WEAR_BEGIN", "2026-05-01T10:00:00Z"),       // no device
      mkE("e1", "WEAR_END", "2026-05-01T14:00:00Z"),         // no device
      mkE("w2", "WEAR_BEGIN", "2026-05-01T15:00:00Z", "plug"),
      mkE("e2", "WEAR_END", "2026-05-01T20:00:00Z", "plug"),
    ];
    const result = buildPairs(entries, [], { types: WEAR_PAIR, categoryId: "plug" });
    expect(result).toHaveLength(1);
    expect(result[0].verschluss.id).toBe("w2");
  });

  it("does not filter when categoryId is null/undefined (default behavior)", () => {
    const entries: EntryWithDevice[] = [
      mkE("v1", "VERSCHLUSS", "2026-05-01T10:00:00Z", "kg"),
      mkE("o1", "OEFFNEN", "2026-05-01T14:00:00Z", "kg"),
    ];
    const result = buildPairs(entries, []); // no options
    expect(result).toHaveLength(1);
  });
});

// ─── wearingHoursInRange ───────────────────────────────────────────────────

describe("wearingHoursInRange", () => {
  it("calculates hours for a closed pair", () => {
    const entries = [
      { type: "VERSCHLUSS", startTime: t("2026-05-01T10:00:00Z") },
      { type: "OEFFNEN", startTime: t("2026-05-01T14:00:00Z") },
    ];
    const h = wearingHoursInRange(entries, t("2026-05-01T00:00:00Z"), t("2026-05-02T00:00:00Z"));
    expect(h).toBe(4);
  });

  it("includes open session (extends to range end)", () => {
    const entries = [{ type: "VERSCHLUSS", startTime: t("2026-05-01T10:00:00Z") }];
    const h = wearingHoursInRange(entries, t("2026-05-01T00:00:00Z"), t("2026-05-01T16:00:00Z"));
    expect(h).toBe(6);
  });

  it("clips to range start", () => {
    const entries = [
      { type: "VERSCHLUSS", startTime: t("2026-05-01T10:00:00Z") },
      { type: "OEFFNEN", startTime: t("2026-05-01T14:00:00Z") },
    ];
    const h = wearingHoursInRange(entries, t("2026-05-01T12:00:00Z"), t("2026-05-02T00:00:00Z"));
    expect(h).toBe(2);
  });

  it("filters by categoryId when passed in options", () => {
    const entries = [
      { type: "WEAR_BEGIN", startTime: t("2026-05-01T10:00:00Z"), device: { categoryId: "plug" } },
      { type: "WEAR_END",   startTime: t("2026-05-01T12:00:00Z"), device: { categoryId: "plug" } },
      { type: "WEAR_BEGIN", startTime: t("2026-05-01T13:00:00Z"), device: { categoryId: "collar" } },
      { type: "WEAR_END",   startTime: t("2026-05-01T18:00:00Z"), device: { categoryId: "collar" } },
    ];
    const h = wearingHoursInRange(
      entries,
      t("2026-05-01T00:00:00Z"),
      t("2026-05-02T00:00:00Z"),
      { types: WEAR_PAIR, categoryId: "plug" },
    );
    expect(h).toBe(2);
  });

  it("returns 0 for empty entries", () => {
    expect(wearingHoursInRange([], t("2026-05-01T00:00:00Z"), t("2026-05-02T00:00:00Z"))).toBe(0);
  });
});
