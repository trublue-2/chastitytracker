import type { CalendarMonthData, CalendarDayData, DayVorgabe } from "@/app/components/CalendarContainer";
import type { MonthStat } from "@/app/components/MonthStats";
import type { KontrolleItemData } from "@/app/components/KontrolleItemListClient";
import type { OrgasmusItemData } from "@/app/components/OrgasmenListClient";

// ── Calendar ──────────────────────────────────

const vorgabe: DayVorgabe = { minProTagH: 12, minProWocheH: 60, minProMonatH: 200 };

function day(d: number, wearHours: number, opts?: Partial<CalendarDayData>): CalendarDayData {
  const goalMet = vorgabe.minProTagH ? wearHours >= vorgabe.minProTagH : null;
  return {
    day: d,
    dateLabel: `${d}. März 2026`,
    wearHours,
    hasOrgasm: opts?.hasOrgasm ?? false,
    dailyGoalMet: goalMet,
    colorClass: wearHours >= 18
      ? "bg-lock/20 text-lock-text"
      : wearHours >= 12
        ? "bg-lock/10 text-lock-text"
        : wearHours > 0
          ? "bg-surface-raised text-foreground-muted"
          : "",
    entries: opts?.entries ?? [],
    vorgabe,
  };
}

function buildWeeks(days: CalendarDayData[], startPad: number): (CalendarDayData | null)[][] {
  const padded: (CalendarDayData | null)[] = Array(startPad).fill(null);
  days.forEach((d) => padded.push(d));
  while (padded.length % 7 !== 0) padded.push(null);
  const weeks: (CalendarDayData | null)[][] = [];
  for (let i = 0; i < padded.length; i += 7) weeks.push(padded.slice(i, i + 7));
  return weeks;
}

const marchDays: CalendarDayData[] = [
  day(1, 24), day(2, 22), day(3, 18), day(4, 14), day(5, 0),
  day(6, 20), day(7, 16, { hasOrgasm: true, entries: [{ type: "ORGASMUS", time: "14:30" }] }),
  day(8, 24), day(9, 24), day(10, 12), day(11, 8), day(12, 22),
  day(13, 0), day(14, 0), day(15, 18), day(16, 24), day(17, 20),
  day(18, 16), day(19, 24), day(20, 14, { hasOrgasm: true, entries: [{ type: "ORGASMUS", time: "22:15" }] }),
  day(21, 22), day(22, 10), day(23, 24), day(24, 18),
  day(25, 20), day(26, 24), day(27, 14), day(28, 6),
  day(29, 24), day(30, 22), day(31, 18),
];

// März 2026 starts on Sunday → startPad = 6 (Mo-Sa empty)
const marchWeeks = buildWeeks(marchDays, 6);

const febDays: CalendarDayData[] = Array.from({ length: 28 }, (_, i) => {
  const d = i + 1;
  const hours = d % 3 === 0 ? 0 : d % 2 === 0 ? 20 : 14;
  return day(d, hours);
});
febDays[13] = { ...febDays[13], dateLabel: "14. Feb 2026", hasOrgasm: true, entries: [{ type: "ORGASMUS", time: "21:00" }] };

// Feb 2026 starts on Sunday → startPad = 6
const febWeeks = buildWeeks(febDays, 6);

function weekGoals(weeks: (CalendarDayData | null)[][]): { met: (boolean | null)[]; pct: (number | null)[] } {
  const target = vorgabe.minProWocheH ?? 60;
  const met: (boolean | null)[] = [];
  const pct: (number | null)[] = [];
  for (const week of weeks) {
    const total = week.reduce((sum, d) => sum + (d?.wearHours ?? 0), 0);
    met.push(total >= target);
    pct.push(Math.min((total / target) * 100, 100));
  }
  return { met, pct };
}

const marchGoals = weekGoals(marchWeeks);
const febGoals = weekGoals(febWeeks);

export const MOCK_CALENDAR_MONTHS: CalendarMonthData[] = [
  {
    label: "März 2026",
    weeks: marchWeeks,
    weekGoalMet: marchGoals.met,
    weekGoalPct: marchGoals.pct,
    monthGoalMet: true,
    monthGoalPct: 92,
  },
  {
    label: "Februar 2026",
    weeks: febWeeks,
    weekGoalMet: febGoals.met,
    weekGoalPct: febGoals.pct,
    monthGoalMet: false,
    monthGoalPct: 71,
  },
];

// ── Month Stats ───────────────────────────────

export const MOCK_MONTH_STATS: MonthStat[] = [
  { key: "2026-03", label: "März 2026", count: 8, totalMs: 520 * 3600000, longestMs: 96 * 3600000, wearHours: 520, targetH: 600 },
  { key: "2026-02", label: "Feb 2026", count: 6, totalMs: 410 * 3600000, longestMs: 72 * 3600000, wearHours: 410, targetH: 500 },
  { key: "2026-01", label: "Jan 2026", count: 10, totalMs: 620 * 3600000, longestMs: 120 * 3600000, wearHours: 620, targetH: 600 },
  { key: "2025-12", label: "Dez 2025", count: 4, totalMs: 280 * 3600000, longestMs: 48 * 3600000, wearHours: 280, targetH: null },
];

// ── Kontrolle Items ───────────────────────────

export const MOCK_KONTROLLE_ITEMS: KontrolleItemData[] = [
  {
    id: "k1",
    imageUrl: null,
    kommentar: "Bitte Siegel prüfen",
    pill1Label: "Offen",
    pill1Cls: "bg-inspect-bg text-inspect-text border border-inspect-border",
    pill2Label: null,
    pill2Cls: null,
    code: "48291",
    dateTimeStr: "01.04.2026, 14:30",
    dateTimePrefix: "Angefordert:",
    deadlineStr: "01.04.2026, 18:30",
    deadlinePrefix: "Frist:",
    note: null,
    entryId: null,
    editHref: null,
  },
  {
    id: "k2",
    imageUrl: null,
    kommentar: null,
    pill1Label: "Erfüllt",
    pill1Cls: "bg-ok-bg text-ok-text border border-ok-border",
    pill2Label: "KI-verifiziert",
    pill2Cls: "bg-lock-bg text-lock-text border border-lock-border",
    code: "73519",
    dateTimeStr: "28.03.2026, 09:15",
    dateTimePrefix: "Angefordert:",
    deadlineStr: "28.03.2026, 13:15",
    deadlinePrefix: "Frist:",
    note: "Code korrekt erkannt",
    entryId: "e-demo",
    editHref: null,
  },
  {
    id: "k3",
    imageUrl: null,
    kommentar: "Dringend!",
    pill1Label: "Überfällig",
    pill1Cls: "bg-warn-bg text-warn-text border border-warn-border",
    pill2Label: null,
    pill2Cls: null,
    code: "90244",
    dateTimeStr: "25.03.2026, 20:00",
    dateTimePrefix: "Angefordert:",
    deadlineStr: "26.03.2026, 00:00",
    deadlinePrefix: "Frist:",
    note: null,
    entryId: null,
    editHref: null,
  },
];

// ── Orgasmen Items ────────────────────────────

export const MOCK_ORGASMEN_ITEMS: OrgasmusItemData[] = [
  { id: "o1", dateStr: "01.04.2026", timeStr: "22:15", orgasmusArt: "Orgasmus", note: null, editHref: "#" },
  { id: "o2", dateStr: "20.03.2026", timeStr: "14:30", orgasmusArt: "ruinierter Orgasmus", note: "Erlaubt", editHref: "#" },
  { id: "o3", dateStr: "07.03.2026", timeStr: "06:45", orgasmusArt: "feuchter Traum", note: null, editHref: "#" },
  { id: "o4", dateStr: "14.02.2026", timeStr: "21:00", orgasmusArt: "Orgasmus", note: "Valentinstag", editHref: "#" },
  { id: "o5", dateStr: "28.01.2026", timeStr: "23:30", orgasmusArt: "ruinierter Orgasmus", note: null, editHref: "#" },
];

// ── Mock Users (for UserContextBar / AdminFAB) ─

export const MOCK_USERS = [
  { id: "u1", username: "alice", isLocked: true },
  { id: "u2", username: "bob", isLocked: false },
  { id: "u3", username: "charlie", isLocked: true },
];
