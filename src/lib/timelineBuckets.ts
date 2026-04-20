import { APP_TZ, tzDateParts, midnightInTZ, getWeekStart, getMidnightToday } from "@/lib/utils";
import type { SessionEventData } from "@/app/dashboard/SessionEventRow";

export interface TimelineBucket {
  /** Stable id for localStorage persistence. */
  id: string;
  /** Bucket kind for i18n key lookup in the client component. */
  kind: "today" | "yesterday" | "thisWeek" | "lastWeek" | "week" | "month";
  /** For "week" / "month" buckets: already-formatted absolute label (e.g. "31.03.", "März 2026"). */
  absoluteLabel?: string;
  /** For "thisWeek" / "lastWeek": formatted date range (e.g. "12.–18.04."). */
  dateRangeLabel?: string;
  /** Bucket range. */
  rangeStart: Date;
  rangeEnd: Date;
  items: SessionEventData[];
  defaultExpanded: boolean;
  /** Per-type counts for the collapsed summary line. */
  counts: {
    verschluss: number;
    kontrolle: number;
    orgasmus: number;
    reinigung: number;
    total: number;
  };
}

function addDaysTZ(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

function sameTZDay(a: Date, b: Date): boolean {
  const pa = tzDateParts(a);
  const pb = tzDateParts(b);
  return pa.year === pb.year && pa.month === pb.month && pa.day === pb.day;
}

function formatDayMonth(d: Date, dl: string): string {
  return d.toLocaleDateString(dl, { day: "2-digit", month: "2-digit", timeZone: APP_TZ });
}

function formatMonthYear(d: Date, dl: string): string {
  return d.toLocaleDateString(dl, { month: "long", year: "numeric", timeZone: APP_TZ });
}

function countEvents(items: SessionEventData[]): TimelineBucket["counts"] {
  const c = { verschluss: 0, kontrolle: 0, orgasmus: 0, reinigung: 0, total: items.length };
  for (const it of items) c[it.type]++;
  return c;
}

/**
 * Groups events into time-based buckets.
 *
 * Rules (active mode):
 *   • Today, Yesterday: always own buckets (default expanded).
 *   • Rest of current ISO week → "Diese Woche" (default collapsed).
 *   • Previous ISO week → "Letzte Woche" (default collapsed).
 *   • Earlier weeks within current month → per-week absolute "Woche vom DD.MM."
 *   • Older → per-month absolute "Month YYYY".
 *
 * Historical mode: only absolute labels (week / month) — no relative "today/yesterday".
 */
export function groupEventsIntoBuckets(
  eventsWithTime: (SessionEventData & { _time: Date })[],
  now: Date,
  dl: string,
  mode: "active" | "historical",
): TimelineBucket[] {
  if (eventsWithTime.length === 0) return [];

  // Sort newest → oldest for display (top of timeline is most recent).
  const sorted = [...eventsWithTime].sort((a, b) => b._time.getTime() - a._time.getTime());

  const midnightToday = getMidnightToday(now);
  const midnightYesterday = addDaysTZ(midnightToday, -1);
  const weekStart = getWeekStart(now);
  const lastWeekStart = addDaysTZ(weekStart, -7);

  type Draft = Omit<TimelineBucket, "counts" | "items"> & { items: SessionEventData[] };
  const buckets: Draft[] = [];
  const getOrCreate = (id: string, factory: () => Draft): Draft => {
    const found = buckets.find(b => b.id === id);
    if (found) return found;
    const b = factory();
    buckets.push(b);
    return b;
  };

  for (const ev of sorted) {
    const t = ev._time;

    if (mode === "active" && t >= midnightToday) {
      const b = getOrCreate("today", () => ({
        id: "today",
        kind: "today",
        rangeStart: midnightToday,
        rangeEnd: now,
        items: [],
        defaultExpanded: true,
      }));
      b.items.push(ev);
      continue;
    }
    if (mode === "active" && t >= midnightYesterday) {
      const b = getOrCreate("yesterday", () => ({
        id: "yesterday",
        kind: "yesterday",
        rangeStart: midnightYesterday,
        rangeEnd: midnightToday,
        items: [],
        defaultExpanded: true,
      }));
      b.items.push(ev);
      continue;
    }
    if (mode === "active" && t >= weekStart) {
      const b = getOrCreate("thisWeek", () => ({
        id: "thisWeek",
        kind: "thisWeek",
        dateRangeLabel: `${formatDayMonth(weekStart, dl)}–${formatDayMonth(addDaysTZ(weekStart, 6), dl)}`,
        rangeStart: weekStart,
        rangeEnd: midnightYesterday,
        items: [],
        defaultExpanded: false,
      }));
      b.items.push(ev);
      continue;
    }
    if (mode === "active" && t >= lastWeekStart) {
      const b = getOrCreate("lastWeek", () => ({
        id: "lastWeek",
        kind: "lastWeek",
        dateRangeLabel: `${formatDayMonth(lastWeekStart, dl)}–${formatDayMonth(addDaysTZ(lastWeekStart, 6), dl)}`,
        rangeStart: lastWeekStart,
        rangeEnd: weekStart,
        items: [],
        defaultExpanded: false,
      }));
      b.items.push(ev);
      continue;
    }

    // Older events: bucket by ISO week within the same month, else by month.
    const { year: eY, month: eM } = tzDateParts(t);
    const { year: nY, month: nM } = tzDateParts(now);
    const sameMonth = mode === "active" && eY === nY && eM === nM;

    if (sameMonth) {
      // Week bucket
      const evWeekStart = getWeekStart(t);
      const id = `week-${evWeekStart.toISOString().slice(0, 10)}`;
      const b = getOrCreate(id, () => ({
        id,
        kind: "week",
        absoluteLabel: formatDayMonth(evWeekStart, dl),
        rangeStart: evWeekStart,
        rangeEnd: addDaysTZ(evWeekStart, 7),
        items: [],
        defaultExpanded: false,
      }));
      b.items.push(ev);
    } else {
      const monthStart = midnightInTZ(new Date(Date.UTC(eY, eM, 1, 12)));
      const monthEnd = midnightInTZ(new Date(Date.UTC(eM === 11 ? eY + 1 : eY, (eM + 1) % 12, 1, 12)));
      const id = `month-${eY}-${String(eM + 1).padStart(2, "0")}`;
      const b = getOrCreate(id, () => ({
        id,
        kind: "month",
        absoluteLabel: formatMonthYear(t, dl),
        rangeStart: monthStart,
        rangeEnd: monthEnd,
        items: [],
        defaultExpanded: false,
      }));
      b.items.push(ev);
    }
  }

  return buckets.map(b => ({ ...b, counts: countEvents(b.items) }));
}

/** Historical-mode threshold: very short sessions (<14 days span) skip bucket grouping. */
export function historicalSessionNeedsBuckets(sessionStart: Date, sessionEnd: Date): boolean {
  return sessionEnd.getTime() - sessionStart.getTime() >= 14 * 86_400_000;
}

/**
 * When to suppress bucket-header rendering (active mode) and render events flat:
 *   • Exactly one bucket (e.g. only "today"), OR
 *   • Exactly two buckets that are BOTH default-expanded (today + yesterday).
 *
 * Once ≥3 buckets exist, or at least one bucket defaults to collapsed, headers render.
 */
export function shouldRenderBucketHeaders(buckets: TimelineBucket[]): boolean {
  if (buckets.length <= 1) return false;
  if (buckets.length === 2 && buckets.every(b => b.defaultExpanded)) return false;
  return true;
}
