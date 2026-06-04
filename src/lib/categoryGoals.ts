import { prisma } from "@/lib/prisma";
import {
  buildWearPairs, wearingHoursFromPairs, WEAR_PAIR,
  getMidnightToday, getWeekStart, getMonthStart,
} from "@/lib/utils";
import { getNonKgTrackingCategories } from "@/lib/queries";

/** Wearing hours + active TrainingVorgabe targets for one non-KG tracking category. */
export interface CategoryWearGoal {
  categoryId: string;
  name: string;
  color: string;
  icon: string;
  tagH: number;
  wocheH: number;
  monatH: number;
  goalDayH: number | null;
  goalWeekH: number | null;
  goalMonthH: number | null;
}

/** Minimal entry shape buildWearPairs needs — lets callers pass entries they already loaded. */
type WearEntryInput = { type: string; startTime: Date; device: { categoryId: string | null } | null };

/** Per non-KG tracking category: today/week/month wearing hours plus the active goal targets
 *  (null when the category has no active vorgabe). Single source of truth shared by the
 *  dashboard CategoryGoalsToday card and the MCP overview.
 *  Pass `prefetchedEntries` (e.g. an overview's already-loaded entries) to skip the WEAR-entry
 *  query — buildWearPairs filters to WEAR_BEGIN/WEAR_END by category itself. */
export async function buildCategoryWearGoals(
  userId: string,
  now: Date,
  prefetchedEntries?: WearEntryInput[],
): Promise<CategoryWearGoal[]> {
  const [categories, vorgaben, ownEntries] = await Promise.all([
    getNonKgTrackingCategories(userId),
    prisma.trainingVorgabe.findMany({
      where: {
        userId,
        gueltigAb: { lte: now },
        OR: [{ gueltigBis: null }, { gueltigBis: { gte: now } }],
        categoryId: { not: null },
        category: { isBuiltIn: false },
      },
      orderBy: { gueltigAb: "desc" },
      select: { categoryId: true, minProTagH: true, minProWocheH: true, minProMonatH: true },
    }),
    prefetchedEntries
      ? Promise.resolve(null)
      : prisma.entry.findMany({
          where: { userId, type: { in: ["WEAR_BEGIN", "WEAR_END"] } },
          orderBy: { startTime: "asc" },
          select: { type: true, startTime: true, device: { select: { categoryId: true } } },
        }),
  ]);
  const entries = prefetchedEntries ?? ownEntries!;

  // Most recent active vorgabe per category (orderBy gueltigAb desc → first seen wins).
  const goalByCategory = new Map<string, typeof vorgaben[number]>();
  for (const v of vorgaben) if (v.categoryId && !goalByCategory.has(v.categoryId)) goalByCategory.set(v.categoryId, v);

  const tagStart = getMidnightToday(now);
  const wocheStart = getWeekStart(now);
  const monatStart = getMonthStart(now);

  return categories.map((c) => {
    const pairs = buildWearPairs(entries, now, { types: WEAR_PAIR, categoryId: c.id });
    const goal = goalByCategory.get(c.id);
    return {
      categoryId: c.id,
      name: c.name,
      color: c.color,
      icon: c.icon,
      tagH: wearingHoursFromPairs(pairs, tagStart, now),
      wocheH: wearingHoursFromPairs(pairs, wocheStart, now),
      monatH: wearingHoursFromPairs(pairs, monatStart, now),
      goalDayH: goal?.minProTagH ?? null,
      goalWeekH: goal?.minProWocheH ?? null,
      goalMonthH: goal?.minProMonatH ?? null,
    };
  });
}

/** True when a category row carries at least one period goal. */
export function hasAnyGoal(c: CategoryWearGoal): boolean {
  return c.goalDayH != null || c.goalWeekH != null || c.goalMonthH != null;
}
