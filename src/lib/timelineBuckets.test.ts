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
