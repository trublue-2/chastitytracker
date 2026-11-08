import { describe, it, expect } from "vitest";
import { groupEventsIntoBuckets, shouldRenderBucketHeaders, historicalSessionNeedsBuckets } from "./timelineBuckets";
import type { SessionEventData } from "@/app/dashboard/SessionEventRow";

/** Nur die Felder, die das Bucketing anfasst — der Rest der Zeile interessiert hier nicht. */
const ev = (iso: string): SessionEventData & { _time: Date } => ({
  type: "kontrolle",
  dateStr: "",
  timeStr: "",
  timeIso: iso,
  _time: new Date(iso),
} as SessionEventData & { _time: Date });

/**
 * Die Ereigniszeilen werden serverseitig in der Zeitzone der SUB formatiert. Zog das Bucketing seine
 * Tagesgrenze in Schweizer Zeit, konnte eine Zeile mit sichtbarer Uhrzeit „11:00" unter „Gestern"
 * landen — dieselbe Uhrzeit, zwei Kalender.
 */
describe("groupEventsIntoBuckets — die Tagesgrenze ist die der Sub", () => {
  // now: Auckland (UTC+12) 11.07. 11:00 · Zürich (UTC+2) 11.07. 01:00
  const now = new Date("2026-07-10T23:00:00Z");
  // Das Ereignis: Auckland 11.07. 01:00 (= heute) · Zürich 10.07. 15:00 (= gestern)
  const event = ev("2026-07-10T13:00:00Z");

  it("für die Auckland-Sub liegt das Ereignis im Heute-Bucket", () => {
    const buckets = groupEventsIntoBuckets([event], now, "de-CH", "active", "Pacific/Auckland");
    expect(buckets.map((b) => b.kind)).toEqual(["today"]);
  });

  it("dieselbe Sekunde ist für eine Zürcher Sub ein Gestern-Ereignis", () => {
    const buckets = groupEventsIntoBuckets([event], now, "de-CH", "active", "Europe/Zurich");
    expect(buckets.map((b) => b.kind)).toEqual(["yesterday"]);
  });

  it("ohne Ereignisse bleibt die Liste leer (kein leeres Heute-Bucket)", () => {
    expect(groupEventsIntoBuckets([], now, "de-CH", "active", "Pacific/Auckland")).toEqual([]);
  });
});

describe("shouldRenderBucketHeaders", () => {
  const bucket = (defaultExpanded: boolean) =>
    ({ defaultExpanded }) as Parameters<typeof shouldRenderBucketHeaders>[0][number];

  it("ein einzelnes Bucket braucht keine Überschrift", () => {
    expect(shouldRenderBucketHeaders([bucket(true)])).toBe(false);
  });

  it("Heute + Gestern (beide offen) bleiben ohne Überschrift", () => {
    expect(shouldRenderBucketHeaders([bucket(true), bucket(true)])).toBe(false);
  });

  it("sobald ein Bucket zugeklappt startet, braucht es Überschriften", () => {
    expect(shouldRenderBucketHeaders([bucket(true), bucket(false)])).toBe(true);
  });

  it("ab drei Buckets immer", () => {
    expect(shouldRenderBucketHeaders([bucket(true), bucket(true), bucket(true)])).toBe(true);
  });
});

describe("historicalSessionNeedsBuckets", () => {
  const start = new Date("2026-07-01T00:00:00Z");

  it("kurze Sessions (<14 Tage) rendern flach", () => {
    expect(historicalSessionNeedsBuckets(start, new Date("2026-07-10T00:00:00Z"))).toBe(false);
  });

  it("ab 14 Tagen wird gebucketet", () => {
    expect(historicalSessionNeedsBuckets(start, new Date("2026-07-15T00:00:00Z"))).toBe(true);
  });
});

/**
 * Bucket-Grenzen sind Kalendertage, keine 24-h-Blöcke: an einer Zeitumstellung hat der Tag 23/25 h,
 * und `+ n * 86_400_000` auf einer Mitternacht landete eine Stunde neben der nächsten Mitternacht.
 * Ausserdem liefen die Beschriftungen in der Zone des Betrachters (APP_TZ) statt der der Sub.
 */
describe("groupEventsIntoBuckets — Zeitumstellung und Beschriftung in der Zone der Sub", () => {
  it("Zürich, Herbst-Wende 25.10.2026: 00:30 Ortszeit am 25.10. gehört zu Gestern (der Tag hat 25 h)", () => {
    const now = new Date("2026-10-26T11:00:00Z"); // Mo 26.10. 12:00 Ortszeit
    // 24.10. 22:30 UTC = 25.10. 00:30 CEST — nach lokaler Mitternacht, aber VOR (heute-24h) = 23:00 UTC
    const buckets = groupEventsIntoBuckets([ev("2026-10-24T22:30:00Z")], now, "de-CH", "active", "Europe/Zurich");
    expect(buckets.map((b) => b.kind)).toEqual(["yesterday"]);
  });

  it("Zürich: Montag 00:30 Ortszeit der Vorwoche (Sommerzeit) liegt in 'Letzte Woche'", () => {
    const now = new Date("2026-10-27T11:00:00Z"); // Di 27.10.
    // 18.10. 22:30 UTC = Mo 19.10. 00:30 CEST; lastWeekStart ist 19.10. 00:00 CEST = 18.10. 22:00 UTC
    const buckets = groupEventsIntoBuckets([ev("2026-10-18T22:30:00Z")], now, "de-CH", "active", "Europe/Zurich");
    expect(buckets.map((b) => b.kind)).toEqual(["lastWeek"]);
    expect(buckets[0].dateRangeLabel).toBe("19.10.–25.10.");
  });

  it("Auckland: die Wochen-Beschriftung nennt Montag bis Sonntag der Sub, nicht den Vortag in Zürcher Zeit", () => {
    const now = new Date("2026-07-15T00:00:00Z"); // Mi 15.07. 12:00 NZ
    const buckets = groupEventsIntoBuckets([ev("2026-07-13T05:00:00Z")], now, "de-CH", "active", "Pacific/Auckland");
    expect(buckets.map((b) => b.kind)).toEqual(["thisWeek"]);
    expect(buckets[0].dateRangeLabel).toBe("13.07.–19.07.");
  });

  it("Auckland: Monats-Beschriftung nennt den Monat der Sub (01.06. 01:00 NZ ist Juni, in Zürich noch Mai)", () => {
    const now = new Date("2026-07-15T00:00:00Z");
    const buckets = groupEventsIntoBuckets([ev("2026-05-31T13:00:00Z")], now, "de-CH", "active", "Pacific/Auckland");
    expect(buckets[0].kind).toBe("month");
    expect(buckets[0].absoluteLabel).toBe("Juni 2026");
  });

  it("Auckland, Herbst-Wende 05.04.2026 (25 h): Wochen-Bucket derselben Woche endet auf der nächsten Mitternacht", () => {
    const now = new Date("2026-04-20T00:00:00Z"); // Mo 20.04. 12:00 NZ
    // Ereignis Mo 06.04. 00:30 NZST = 05.04. 12:30 UTC, gleicher Monat → Wochen-Bucket ab Mo 06.04.
    const buckets = groupEventsIntoBuckets([ev("2026-04-05T12:30:00Z")], now, "de-CH", "active", "Pacific/Auckland");
    expect(buckets[0].kind).toBe("week");
    expect(buckets[0].absoluteLabel).toBe("06.04.");
    expect(buckets[0].rangeEnd.toISOString()).toBe("2026-04-12T12:00:00.000Z"); // Mo 13.04. 00:00 NZST
  });
});
