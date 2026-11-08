import { prisma } from "@/lib/prisma";
import {
  wearingHoursFromPairs,
  getMidnightToday,
  type WearHours,
} from "@/lib/utils";
import { buildWearSessions, wearHourPairsByCategory, type SegmentEntry } from "@/lib/sessionModel";
import { hasVisibleGoalRow, type VorgabeTargets } from "@/lib/goalFulfillment";
import { resolveGoalRow, segmentHours } from "@/lib/goalSegments";
import { isActive } from "@/lib/statsBuilders";
import { getNonKgTrackingCategories, getWearEntries, getUserTimezone } from "@/lib/queries";
import { groupVorgabenByCategory } from "@/lib/vorgaben";

/** Wearing hours + active TrainingVorgabe targets for one non-KG tracking category.
 *  Die Ziele sind bereits nach den Regeln in `goalFulfillment.ts` aufgelöst: eine Periode mit
 *  Zielgrenze trägt gar kein Ziel, dazu `changedInPeriod` für den MCP. */
export interface CategoryWearGoal extends WearHours {
  categoryId: string;
  name: string;
  color: string;
  icon: string;
  /** Ziele dieser Kategorie, bereits nach den Regeln aufgelöst — `targetH` je Periode,
   *  `changedInPeriod` sagt, ob eine Periode wegen einer Zielgrenze unbewertet bleibt. */
  goal: VorgabeTargets;
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
 *  und Monatsgrenze müssen dieselbe Mitternacht meinen wie die Ziele daneben.
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
    // BEWUSST ohne Aktiv-Filter: die Jahres-Zeile summiert über ALLE Segmente des laufenden Jahres
    // (auch bereits abgelaufene), sonst fehlte im Nenner die Phase vor der letzten Ziel-Änderung.
    // Welches Ziel AKTIV ist, entscheidet danach `isActive` in JS — eine zweite Query wäre dieselbe
    // Zeilenmenge mit engerem `where`.
    prisma.trainingVorgabe.findMany({
      where: {
        userId,
        deletedAt: null, // B-04: ein soft-gelöschtes Ziel zählt nicht mehr in die Adhärenz
        categoryId: { not: null },
        category: { isBuiltIn: false },
      },
      orderBy: { gueltigAb: "desc" },
      select: { categoryId: true, gueltigAb: true, gueltigBis: true, validUntilManual: true, minProTagH: true, minProWocheH: true, minProMonatH: true, minProJahrH: true, minProTagWochentage: true },
    }),
    prefetchedEntries ? Promise.resolve(null) : getWearEntries(userId),
    prefetchedTz ?? getUserTimezone(userId),
  ]);
  const entries = prefetchedEntries ?? ownEntries!;
  const pairsByCategory = wearHourPairsByCategory(buildWearSessions(entries, now), now);

  // Most recent active vorgabe per category (orderBy gueltigAb desc → first seen wins) — sie
  // entscheidet über die Sichtbarkeit der Zeilen und über das TAGES-Soll.
  const goalByCategory = new Map<string, typeof vorgaben[number]>();
  // Alle Segmente je Kategorie — daraus baut `resolveGoalRow` Woche, Monat und Jahr.
  // (Nicht-KG-Kategorien: `goalCategoryKey` ist dort die `categoryId`.)
  const segmentsByCategory = groupVorgabenByCategory(vorgaben);
  for (const v of vorgaben) {
    if (v.categoryId && isActive(v, now) && !goalByCategory.has(v.categoryId)) goalByCategory.set(v.categoryId, v);
  }

  const tagStart = getMidnightToday(now, tz);

  return categories.map((c) => {
    const pairs = pairsByCategory.get(c.id) ?? [];
    // Woche/Monat/Jahr kommen samt ihren Ist-Werten aus der Segment-Summe; nur der Tag stammt
    // unverändert aus dem aktiven Ziel.
    const { goal, actualH } = resolveGoalRow(
      goalByCategory.get(c.id) ?? null, segmentsByCategory.get(c.id) ?? [], pairs, now, tz,
    );
    return {
      categoryId: c.id,
      name: c.name,
      color: c.color,
      icon: c.icon,
      tagH: wearingHoursFromPairs(pairs, tagStart, now),
      ...segmentHours(actualH),
      goal,
    };
  });
}

/** True, wenn die Kategorie-Zeile mindestens eine BEWERTBARE Ziel-Periode hat.
 *  Bewusst `hasVisibleGoalRow` und nicht „irgendein Ziel gesetzt": am Starttag einer Vorgabe ist
 *  jede Periode ungewertet, und eine Zeile, die dann nichts rendert, gehört nicht in die Liste. */
export function hasAnyGoal(c: CategoryWearGoal): boolean {
  return hasVisibleGoalRow(c.goal.targetH);
}
