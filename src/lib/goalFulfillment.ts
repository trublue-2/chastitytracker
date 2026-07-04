/**
 * Prorated training-goal fulfillment.
 *
 * A TrainingVorgabe stores absolute hour targets per period (day/week/month/year). When the goal's
 * validity window (gueltigAb..gueltigBis) covers only PART of a period — e.g. a weekly goal set on a
 * Friday, or a yearly goal starting mid-year — the target for that boundary period must be scaled down
 * to the fraction of the period the goal actually covers. This module centralizes that math so every
 * fulfillment site (stats, calendar, live goals, MCP) computes the denominator the same way.
 *
 * When the goal spans the whole period the ratio is 1 → target unchanged (behaviour before this feature).
 *
 * Bewusste Vereinfachung: prorata wird nur der ZIEL-NENNER. Die Ist-Stunden (Zähler) messen die
 * Aufrufer über die ganze Periode [periodStart, now], nicht auf das Vorgabe-Fenster beschnitten.
 * Fällt in die Rand-Periode Tragezeit VOR `gueltigAb`, zählt sie mit — die Erfüllung einer frisch
 * gesetzten Vorgabe kann in ihrer ersten Teilperiode dadurch zu hoch wirken. Für diese App akzeptiert.
 */

import { getMidnightToday, getWeekStart, getMonthStart, getMonthEnd, getYearStart, getYearEnd, APP_TZ } from "@/lib/utils";

/** Validity window of a goal. `end === null` = open-ended (covers everything after `start`). */
export interface GoalWindow {
  gueltigAb: Date;
  gueltigBis: Date | null;
}

export type GoalPeriod = "day" | "week" | "month" | "year";

/** Half-open bounds `[start, end)` of the current day/week/month/year in `tz` (default APP_TZ). */
export function periodBounds(period: GoalPeriod, now: Date, tz = APP_TZ): { start: Date; end: Date } {
  switch (period) {
    case "day": {
      const start = getMidnightToday(now, tz);
      return { start, end: new Date(start.getTime() + 86_400_000) };
    }
    case "week": {
      const start = getWeekStart(now, tz);
      return { start, end: new Date(start.getTime() + 7 * 86_400_000) };
    }
    case "month":
      return { start: getMonthStart(now, tz), end: getMonthEnd(now, tz) };
    case "year":
      return { start: getYearStart(now, tz), end: getYearEnd(now, tz) };
  }
}

/**
 * Fraction (0..1) of the half-open period `[periodStart, periodEnd)` that the goal window
 * `[gueltigAb, gueltigBis ?? +∞)` covers. Returns 0 for no overlap, 1 for full coverage.
 */
export function periodOverlapRatio(
  periodStart: Date,
  periodEnd: Date,
  gueltigAb: Date,
  gueltigBis: Date | null,
): number {
  const periodMs = periodEnd.getTime() - periodStart.getTime();
  if (periodMs <= 0) return 0;
  const from = Math.max(periodStart.getTime(), gueltigAb.getTime());
  const to = Math.min(periodEnd.getTime(), gueltigBis ? gueltigBis.getTime() : periodEnd.getTime());
  const overlap = to - from;
  if (overlap <= 0) return 0;
  return Math.min(1, overlap / periodMs);
}

/**
 * The effective target hours for a goal in a given period, scaled by the goal-window overlap.
 * `baseTargetH === null` (period target not set) → null. Overlap 0 → 0 (goal not active in period).
 */
export function proratedTargetH(
  baseTargetH: number | null | undefined,
  periodStart: Date,
  periodEnd: Date,
  goal: GoalWindow,
): number | null {
  if (baseTargetH == null) return null;
  return baseTargetH * periodOverlapRatio(periodStart, periodEnd, goal.gueltigAb, goal.gueltigBis);
}

/** The four period hour-targets of a training goal. */
export interface VorgabePeriodTargets {
  minProTagH: number | null;
  minProWocheH: number | null;
  minProMonatH: number | null;
  minProJahrH: number | null;
}

/**
 * All four period targets of a goal, each prorated to the goal's overlap with the CURRENT period.
 * Single fan-out shared by every "active goal now" surface (dashboard, admin, stats cards, category
 * goals, MCP) so the day/week/month/year mapping lives in one place. `goal === null` → all-null.
 */
export function proratedVorgabeTargets(
  goal: (GoalWindow & VorgabePeriodTargets) | null,
  now: Date,
  tz = APP_TZ,
): VorgabePeriodTargets {
  if (!goal) return { minProTagH: null, minProWocheH: null, minProMonatH: null, minProJahrH: null };
  const day = periodBounds("day", now, tz);
  const week = periodBounds("week", now, tz);
  const month = periodBounds("month", now, tz);
  const year = periodBounds("year", now, tz);
  return {
    minProTagH: proratedTargetH(goal.minProTagH, day.start, day.end, goal),
    minProWocheH: proratedTargetH(goal.minProWocheH, week.start, week.end, goal),
    minProMonatH: proratedTargetH(goal.minProMonatH, month.start, month.end, goal),
    minProJahrH: proratedTargetH(goal.minProJahrH, year.start, year.end, goal),
  };
}
