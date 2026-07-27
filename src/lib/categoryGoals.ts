import { prisma } from "@/lib/prisma";
import {
  wearingHoursFromPairs,
  getMidnightToday, getWeekStart, getMonthStart, getYearStart,
} from "@/lib/utils";
import { buildWearSessions, wearHourPairsByCategory, type SegmentEntry } from "@/lib/sessionModel";
import { proratedVorgabeTargets } from "@/lib/goalFulfillment";
import { getNonKgTrackingCategories, getWearEntries, getUserTimezone } from "@/lib/queries";

/** Wearing hours + active TrainingVorgabe targets for one non-KG tracking category.
 *  Goal targets are already prorated to the goal's overlap with each period. */
export interface CategoryWearGoal {
  categoryId: string;
  name: string;
  color: string;
  icon: string;
  tagH: number;
  wocheH: number;
  monatH: number;
  jahrH: number;
  goalDayH: number | null;
  goalWeekH: number | null;
  goalMonthH: number | null;
  goalYearH: number | null;
}


/** Per non-KG tracking category: today/week/month wearing hours plus the active goal targets
 *  (null when the category has no active vorgabe). Single source of truth shared by the
 *  dashboard CategoryGoalsToday card and the MCP overview.
 *
 *  Die Stunden sind WANDUHR-Zeit (`wearHourPairsByCategory`): zwei gleichzeitig getragene Geräte
 *  derselben Kategorie zählen ihre gemeinsame Zeit einmal, nicht zweimal — ein Ziel „4 h pro Tag"
 *  meint 4 Stunden am Tag, nicht 4 Gerätestunden.
 *
 *  Pass `prefetchedEntries` (e.g. an overview's already-loaded entries) to skip the WEAR-entry
 *  query — das Session-Modell filtert selbst auf WEAR_BEGIN/WEAR_END.
 *
 *  Die Zeitzone ist immer die DES SUBS — auch wenn der Keyholder die Zahlen liest: Tages-, Wochen-
 *  und Monatsgrenze müssen dieselbe Mitternacht meinen wie die prorata gerechneten Ziele daneben.
 *  Ohne `prefetchedTz` lädt die Funktion sie selbst (wie `buildCategoryRows`) und bleibt damit für
 *  Aufrufer brauchbar, die nur eine userId haben; wer sie ohnehin schon geladen hat — der
 *  MCP-Kontext etwa — reicht sie durch und spart die zweite Query. */
export async function buildCategoryWearGoals(
  userId: string,
  now: Date,
  prefetchedEntries?: SegmentEntry[],
  prefetchedTz?: string,
): Promise<CategoryWearGoal[]> {
  const [categories, vorgaben, ownEntries, tz] = await Promise.all([
    getNonKgTrackingCategories(userId),
    prisma.trainingVorgabe.findMany({
      where: {
        userId,
        deletedAt: null, // B-04: ein soft-gelöschtes Ziel zählt nicht mehr in die Adhärenz
        gueltigAb: { lte: now },
        OR: [{ gueltigBis: null }, { gueltigBis: { gte: now } }],
        categoryId: { not: null },
        category: { isBuiltIn: false },
      },
      orderBy: { gueltigAb: "desc" },
      select: { categoryId: true, gueltigAb: true, gueltigBis: true, minProTagH: true, minProWocheH: true, minProMonatH: true, minProJahrH: true },
    }),
    prefetchedEntries ? Promise.resolve(null) : getWearEntries(userId),
    prefetchedTz ?? getUserTimezone(userId),
  ]);
  const entries = prefetchedEntries ?? ownEntries!;
  const pairsByCategory = wearHourPairsByCategory(buildWearSessions(entries, now), now);

  // Most recent active vorgabe per category (orderBy gueltigAb desc → first seen wins).
  const goalByCategory = new Map<string, typeof vorgaben[number]>();
  for (const v of vorgaben) if (v.categoryId && !goalByCategory.has(v.categoryId)) goalByCategory.set(v.categoryId, v);

  const tagStart = getMidnightToday(now, tz);
  const wocheStart = getWeekStart(now, tz);
  const monatStart = getMonthStart(now, tz);
  const jahrStart = getYearStart(now, tz);

  return categories.map((c) => {
    const pairs = pairsByCategory.get(c.id) ?? [];
    const t = proratedVorgabeTargets(goalByCategory.get(c.id) ?? null, now, tz);
    return {
      categoryId: c.id,
      name: c.name,
      color: c.color,
      icon: c.icon,
      tagH: wearingHoursFromPairs(pairs, tagStart, now),
      wocheH: wearingHoursFromPairs(pairs, wocheStart, now),
      monatH: wearingHoursFromPairs(pairs, monatStart, now),
      jahrH: wearingHoursFromPairs(pairs, jahrStart, now),
      goalDayH: t.minProTagH,
      goalWeekH: t.minProWocheH,
      goalMonthH: t.minProMonatH,
      goalYearH: t.minProJahrH,
    };
  });
}

/** True when a category row carries at least one period goal. */
export function hasAnyGoal(c: CategoryWearGoal): boolean {
  return c.goalDayH != null || c.goalWeekH != null || c.goalMonthH != null || c.goalYearH != null;
}
