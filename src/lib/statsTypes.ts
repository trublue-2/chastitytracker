/**
 * View-Model der Statistik-Seite: die Formen, die `statsBuilders.ts` ERZEUGT und die
 * Präsentations-Komponenten (`MonthStats`, `CalendarContainer`, `YearHeatmap`) rendern.
 *
 * Bewusst ein import-freies Blatt-Modul — wie `serviceErrorCodes.ts`. Vorher standen diese Typen in
 * den Komponenten, sodass `src/lib/statsBuilders.ts` auf `src/app/components/*` zeigte: der
 * Abhängigkeits-Pfeil lief von der Rechen- in die Darstellungsschicht. Type-only war das
 * folgenlos, aber sobald eine Komponente einen Laufzeit-Helfer aus `statsBuilders` importiert,
 * wäre daraus ein echter Zyklus geworden. Jetzt zeigen beide Seiten hierher.
 */

// ── Monatsübersicht ───────────────────────────────────────────────────────────

export type MonthStat = {
  key: string;
  label: string;
  count: number;
  totalMs: number;
  longestMs: number;
  wearHours: number;
  targetH: number | null;
};

// ── Monatskalender ────────────────────────────────────────────────────────────

export type DayEntry = {
  type: string;
  time: string;
  note?: string | null;
  orgasmusArt?: string | null;
};

export type DayVorgabe = {
  minProTagH?: number | null;
  minProWocheH?: number | null;
  minProMonatH?: number | null;
  minProJahrH?: number | null;
  notiz?: string | null;
};

export type CalendarDayData = {
  day: number;
  dateLabel: string;
  wearHours: number;
  hasOrgasm: boolean;
  dailyGoalMet: boolean | null;
  colorClass: string;
  entries: DayEntry[];
  vorgabe: DayVorgabe | null;
};

export type CalendarMonthData = {
  label: string;
  weeks: (CalendarDayData | null)[][];
  weekGoalMet: (boolean | null)[];
  weekGoalPct: (number | null)[];
  monthGoalMet: boolean | null;
  monthGoalPct: number | null;
};

// ── Jahres-Heatmap ────────────────────────────────────────────────────────────

/** One day cell in the year heatmap. `level` 0..4 maps to the shared blue intensity scale. */
export interface HeatmapDay {
  key: string;
  /** Native-tooltip text, e.g. "15. Juli 2026 · 12.5 h". */
  title: string;
  level: number;
  hasOrgasm: boolean;
}

export interface YearHeatmapData {
  year: number;
  /** ISO weeks (Mon-start), earliest first; each week is 7 cells Mon..Sun (null = padding / future).
   *  Rendered as rows on narrow cards (portrait phone) and as columns on wide cards (GitHub style). */
  weeks: (HeatmapDay | null)[][];
  /** Month label anchored to the week index where the month first appears. */
  monthLabels: { week: number; label: string }[];
  /** Total worn hours in the year + share of the (elapsed) year spent locked. */
  totalHours: string;
  percentLocked: number;
}
