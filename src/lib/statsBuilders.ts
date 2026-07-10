import {
  formatHours, formatTime, midnightInTZ, mondayIndex, tzDateParts, wearingHoursFromPairs,
  type WearPair,
} from "@/lib/utils";
import { proratedTargetH } from "@/lib/goalFulfillment";
import { wearIntensityLevel, WEAR_LEVEL_BG } from "@/lib/wearIntensity";
import type {
  MonthStat, CalendarMonthData, CalendarDayData, DayEntry, DayVorgabe, HeatmapDay, YearHeatmapData,
} from "@/lib/statsTypes";

/**
 * Reine Datenaufbereitung für die Statistik-Seite. Kein JSX, kein Prisma, kein `next-intl` —
 * damit die Kalender-/Heatmap-/Monats-Rechnungen ohne Server-Komponente testbar sind.
 *
 * Die Ansicht (`StatsMain`) lädt und komponiert nur noch. Sie wird von `/dashboard/stats` UND
 * `/admin/users/[id]/stats` geteilt: beide müssen nach jeder Änderung hier identisch rendern.
 *
 * Die erzeugten Formen stehen in `@/lib/statsTypes` — einem import-freien Blatt-Modul, auf das
 * sowohl dieses Modul als auch die Präsentations-Komponenten zeigen.
 */

export type Entry = {
  id: string; type: string; startTime: Date; imageUrl: string | null; note: string | null;
  orgasmusArt?: string | null; kontrollCode?: string | null; verifikationStatus?: string | null;
  oeffnenGrund?: string | null; deviceId?: string | null;
};

export type CompletedPair = { verschluss: Entry; oeffnen: Entry; durationMs: number };

export type Vorgabe = {
  gueltigAb: Date;
  gueltigBis: Date | null;
  minProTagH: number | null;
  minProWocheH: number | null;
  minProMonatH: number | null;
  minProJahrH: number | null;
  notiz: string | null;
};

const DAY_MS = 86_400_000;
/** Mittag als Tages-Anker: nie in einer DST-Lücke, siehe `tzOffsetMsAt` in utils.ts. */
const noonUTC = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d, 12));

/** Textfarbe je Intensitätsstufe, damit die Tageszahl auf dem Blau lesbar bleibt. Der Hintergrund
 *  kommt aus `WEAR_LEVEL_BG` — geteilt mit der Jahres-Heatmap und deren Legende. */
const CALENDAR_LEVEL_TEXT = [
  "text-foreground-faint", "text-blue-900", "text-blue-900", "text-white", "text-white",
];
const calendarLevelClass = (level: number) => `${WEAR_LEVEL_BG[level]} ${CALENDAR_LEVEL_TEXT[level]}`;

/** Tages-Karte: Schlüssel `"<jahr>-<monat0>-<tag>"` → getragene Stunden + Orgasmus-Markierung. */
export type DailyData = Map<string, { hours: number; hasOrgasm: boolean }>;

/** Getragene Stunden je Kalendertag, plus Orgasmus-Markierung.
 *  Ein Paar, das über Mitternacht läuft, wird auf die berührten Tage anteilig aufgeteilt. */
export function buildDailyData(wearPairs: WearPair[], orgasmDates: Set<string>, tz: string): DailyData {
  const map = new Map<string, { hours: number; hasOrgasm: boolean }>();
  for (const pair of wearPairs) {
    let d = midnightInTZ(pair.start, tz);
    while (d.getTime() < pair.end.getTime()) {
      const nextD = new Date(d.getTime() + DAY_MS);
      const overlap = Math.min(pair.end.getTime(), nextD.getTime()) - Math.max(pair.start.getTime(), d.getTime());
      if (overlap > 0) {
        const { year, month, day } = tzDateParts(new Date(d.getTime() + DAY_MS / 2), tz);
        const key = `${year}-${month}-${day}`;
        const existing = map.get(key) ?? { hours: 0, hasOrgasm: false };
        existing.hours += overlap / 3_600_000;
        map.set(key, existing);
      }
      d = nextD;
    }
  }
  for (const key of orgasmDates) {
    const existing = map.get(key) ?? { hours: 0, hasOrgasm: false };
    existing.hasOrgasm = true;
    map.set(key, existing);
  }
  return map;
}

/** `"YYYY-MM"` von `d` in `tz` — Sortier-/Gruppierschlüssel, bewusst locale-unabhängig (`de-CH`). */
export function tzYearMonth(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("de-CH", { year: "numeric", month: "2-digit", timeZone: tz }).formatToParts(d);
  const y = parts.find(p => p.type === "year")!.value;
  const m = parts.find(p => p.type === "month")!.value;
  return `${y}-${m}`;
}

/** Findet die Vorgabe, die sich mit [start, end) überschneidet. */
function vorgabeFor(vorgaben: Vorgabe[], start: Date, end: Date): Vorgabe | undefined {
  return vorgaben.find(vg => vg.gueltigAb < end && (vg.gueltigBis === null || vg.gueltigBis >= start));
}

export function buildMonthStats(pairs: CompletedPair[], wearPairs: WearPair[], vorgaben: Vorgabe[], dl: string, tz: string): MonthStat[] {
  const map = new Map<string, Omit<MonthStat, "wearHours" | "targetH">>();
  const monthLabel = (d: Date) => d.toLocaleString(dl, { month: "long", year: "numeric", timeZone: tz });

  for (const p of pairs) {
    const d = p.verschluss.startTime;
    const key = tzYearMonth(d, tz);
    const existing = map.get(key) ?? { key, label: monthLabel(d), count: 0, totalMs: 0, longestMs: 0 };
    existing.count++;
    existing.totalMs += p.durationMs;
    if (p.durationMs > existing.longestMs) existing.longestMs = p.durationMs;
    map.set(key, existing);
  }
  // Monate ohne abgeschlossenes Paar, aber mit Trage-Zeit, sollen trotzdem eine Zeile bekommen.
  for (const wp of wearPairs) {
    for (const d of [wp.start, wp.end]) {
      const key = tzYearMonth(d, tz);
      if (!map.has(key)) map.set(key, { key, label: monthLabel(d), count: 0, totalMs: 0, longestMs: 0 });
    }
  }

  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([, v]) => {
      const [y, m] = v.key.split("-").map(Number);
      const monthStart = midnightInTZ(noonUTC(y, m - 1, 1), tz);
      const monthEnd = midnightInTZ(noonUTC(y, m, 1), tz);
      const wearHours = wearingHoursFromPairs(wearPairs, monthStart, monthEnd);
      const vg = vorgabeFor(vorgaben, monthStart, monthEnd);
      return { ...v, wearHours, targetH: vg ? proratedTargetH(vg.minProMonatH, monthStart, monthEnd, vg) : null };
    });
}

export function isActive(v: { gueltigAb: Date; gueltigBis: Date | null }, now: Date = new Date()): boolean {
  return v.gueltigAb <= now && (v.gueltigBis === null || v.gueltigBis >= now);
}

/** Ein prorata-Ziel von 0 heisst „Vorgabe deckt diese Periode nicht ab" → kein „erreicht"-Marker
 *  (sonst wäre `ist >= 0` trivial immer erfüllt). Deshalb Truthy-Guard statt `!= null`. */
function goalMet(actual: number, target: number | null): boolean | null {
  return target ? actual >= target : null;
}
function goalPct(actual: number, target: number | null): number | null {
  return target ? Math.round((actual / target) * 100) : null;
}

export function buildCalendarMonths(opts: {
  entries: Entry[];
  wearPairs: WearPair[];
  vorgaben: Vorgabe[];
  orgasmDateSet: Set<string>;
  now: Date;
  dl: string;
  tz: string;
  /** Vorberechnete Tages-Karte. Kalender und Jahres-Heatmap brauchen für dieselben Paare dieselbe
   *  Karte; wer beide baut, reicht sie durch, statt sie zweimal zu berechnen. */
  dailyData?: DailyData;
}): CalendarMonthData[] {
  const { entries, wearPairs, vorgaben, orgasmDateSet, now, dl, tz } = opts;
  const dailyData = opts.dailyData ?? buildDailyData(wearPairs, orgasmDateSet, tz);
  const { year: nowYear, month: nowMonth } = tzDateParts(now, tz);

  // Bucket entries by YMD once so day-cells become O(1) lookups instead of O(N) filters.
  const entriesByYMD = new Map<string, Entry[]>();
  for (const e of entries) {
    const { year, month, day } = tzDateParts(e.startTime, tz);
    const key = `${year}-${month}-${day}`;
    const list = entriesByYMD.get(key);
    if (list) list.push(e); else entriesByYMD.set(key, [e]);
  }

  const calMonthsData: CalendarMonthData[] = [];
  for (let i = 0; i <= 3; i++) {
    const { year, month } = tzDateParts(noonUTC(nowYear, nowMonth - i, 1), tz);
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const firstDayNoon = noonUTC(year, month, 1);
    const startOffset = mondayIndex(firstDayNoon, tz);
    const label = firstDayNoon.toLocaleString(dl, { month: "long", year: "numeric", timeZone: tz });

    const monthStartDate = midnightInTZ(firstDayNoon, tz);
    const monthEndDate = midnightInTZ(noonUTC(year, month + 1, 1), tz);
    const vorgabe = vorgabeFor(vorgaben, monthStartDate, monthEndDate) ?? null;
    const monthTotalH = wearingHoursFromPairs(wearPairs, monthStartDate, monthEndDate);
    const monthTarget = vorgabe ? proratedTargetH(vorgabe.minProMonatH, monthStartDate, monthEndDate, vorgabe) : null;

    const cells: (number | null)[] = [
      ...Array(startOffset).fill(null),
      ...Array.from({ length: daysInMonth }, (_, k) => k + 1),
    ];
    while (cells.length % 7 !== 0) cells.push(null);

    const weeks: (CalendarDayData | null)[][] = [];
    const weekGoalMet: (boolean | null)[] = [];
    const weekGoalPct: (number | null)[] = [];

    for (let w = 0; w < cells.length; w += 7) {
      const weekCells = cells.slice(w, w + 7);
      const firstDayOfRow = weekCells.find((x) => x != null);
      let weekH = 0;
      let weekTarget: number | null = null;
      if (firstDayOfRow != null && vorgabe?.minProWocheH != null) {
        const dow = mondayIndex(noonUTC(year, month, firstDayOfRow), tz);
        const wkStart = midnightInTZ(noonUTC(year, month, firstDayOfRow - dow), tz);
        const wkEnd = new Date(wkStart.getTime() + 7 * DAY_MS);
        weekH = wearingHoursFromPairs(wearPairs, wkStart, wkEnd);
        weekTarget = proratedTargetH(vorgabe.minProWocheH, wkStart, wkEnd, vorgabe);
      }
      weekGoalMet.push(goalMet(weekH, weekTarget));
      weekGoalPct.push(goalPct(weekH, weekTarget));

      weeks.push(weekCells.map((day): CalendarDayData | null => {
        if (!day) return null;
        const key = `${year}-${month}-${day}`;
        const data = dailyData.get(key);
        const dayStart = midnightInTZ(noonUTC(year, month, day), tz);
        const dayEnd = new Date(dayStart.getTime() + DAY_MS);
        const dayTarget = vorgabe ? proratedTargetH(vorgabe.minProTagH, dayStart, dayEnd, vorgabe) : null;
        const dailyGoalMet = data != null ? goalMet(data.hours, dayTarget) : null;
        const colorClass = calendarLevelClass(wearIntensityLevel(data?.hours ?? 0));
        // entries arrived from prisma sorted by startTime asc, so per-day buckets are too.
        const dayEntries: DayEntry[] = (entriesByYMD.get(key) ?? []).map((e) => ({
          type: e.type,
          time: formatTime(e.startTime, dl, tz),
          note: e.note,
          orgasmusArt: e.orgasmusArt,
        }));
        const dayVorgabe: DayVorgabe | null = vorgabe ? {
          minProTagH: vorgabe.minProTagH, minProWocheH: vorgabe.minProWocheH,
          minProMonatH: vorgabe.minProMonatH, minProJahrH: vorgabe.minProJahrH, notiz: vorgabe.notiz,
        } : null;
        const dateLabel = noonUTC(year, month, day).toLocaleDateString(dl, { day: "numeric", month: "long", year: "numeric", timeZone: tz });
        return { day, dateLabel, wearHours: data?.hours ?? 0, hasOrgasm: data?.hasOrgasm ?? false, dailyGoalMet, colorClass, entries: dayEntries, vorgabe: dayVorgabe };
      }));
    }

    calMonthsData.push({ label, weeks, weekGoalMet, weekGoalPct, monthGoalMet: goalMet(monthTotalH, monthTarget), monthGoalPct: goalPct(monthTotalH, monthTarget) });
  }
  return calMonthsData;
}

/** GitHub-style per-day wear heatmap, one entry per year that has data (newest first). Reuses the
 *  month calendar's per-day map + the shared blue intensity scale (hours/24). */
export function buildYearHeatmaps(wearPairs: WearPair[], orgasmDateSet: Set<string>, now: Date, tz: string, dl: string, precomputed?: DailyData): YearHeatmapData[] {
  const dailyData = precomputed ?? buildDailyData(wearPairs, orgasmDateSet, tz);
  const { year: nowYear, month: nowMonth, day: nowDay } = tzDateParts(now, tz);
  const years = new Set<number>([nowYear]);
  for (const key of dailyData.keys()) years.add(Number(key.split("-")[0]));

  return [...years].sort((a, b) => b - a).map((year) => {
    const jan1 = noonUTC(year, 0, 1);
    const cells: (HeatmapDay | null)[] = Array(mondayIndex(jan1, tz)).fill(null); // Leerzellen bis zum 1. Jan
    let totalHours = 0;
    for (let month = 0; month < 12 && !(year === nowYear && month > nowMonth); month++) {
      const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      for (let day = 1; day <= daysInMonth; day++) {
        if (year === nowYear && month === nowMonth && day > nowDay) break; // aktuelles Jahr nur bis heute
        const cell = dailyData.get(`${year}-${month}-${day}`);
        const hours = cell?.hours ?? 0;
        totalHours += hours;
        const dateLabel = noonUTC(year, month, day).toLocaleDateString(dl, { day: "numeric", month: "long", year: "numeric", timeZone: tz });
        cells.push({
          key: `${year}-${month}-${day}`,
          title: `${dateLabel} · ${formatHours(hours, dl)}`,
          level: wearIntensityLevel(hours),
          hasOrgasm: cell?.hasOrgasm ?? false,
        });
      }
    }

    const weeks: (HeatmapDay | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) {
      const week = cells.slice(i, i + 7);
      while (week.length < 7) week.push(null);
      weeks.push(week);
    }

    const monthLabels: { week: number; label: string }[] = [];
    let lastMonth = -1;
    weeks.forEach((week, row) => {
      const firstCell = week.find((c) => c != null);
      if (!firstCell) return;
      const m = Number(firstCell.key.split("-")[1]);
      if (m !== lastMonth) {
        monthLabels.push({ week: row, label: noonUTC(year, m, 1).toLocaleDateString(dl, { month: "short", timeZone: tz }) });
        lastMonth = m;
      }
    });

    const yearStart = midnightInTZ(jan1, tz);
    const yearEnd = midnightInTZ(noonUTC(year + 1, 0, 1), tz);
    const elapsedEnd = year === nowYear ? now : yearEnd;
    const elapsedH = (elapsedEnd.getTime() - yearStart.getTime()) / 3_600_000;
    return {
      year,
      weeks,
      monthLabels,
      totalHours: formatHours(totalHours, dl),
      percentLocked: elapsedH > 0 ? Math.round((totalHours / elapsedH) * 100) : 0,
    };
  });
}

/**
 * 7 short weekday names Mon..Sun in the given locale (for the heatmap's row labels).
 *
 * Bewusst OHNE Zeitzone: die Reihenfolge Mo..So ist eine Kalender-Eigenschaft, keine Ortszeit.
 * Vorher wurde der 12:00-UTC-Anker in der Sub-Zeitzone formatiert — ab +13 h (z.B. Pacific/Auckland
 * im Januar) rutschte der Anker auf Dienstag und die Beschriftung begann mit „Di".
 */
export function buildWeekdayLabels(dl: string): string[] {
  return Array.from({ length: 7 }, (_, i) =>
    // 2024-01-01 was a Monday; +i days walks Mon..Sun.
    noonUTC(2024, 0, 1 + i).toLocaleDateString(dl, { weekday: "short", timeZone: "UTC" }),
  );
}
