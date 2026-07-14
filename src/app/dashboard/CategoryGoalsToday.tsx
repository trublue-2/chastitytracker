import { buildCategoryWearGoals, hasAnyGoal } from "@/lib/categoryGoals";
import { type SegmentEntry } from "@/lib/sessionModel";
import CategoryGoalsLive from "./CategoryGoalsLive";

interface Props {
  userId: string;
  /** Currently-running wear sessions (already fetched by the dashboard page) — their categories tick
   *  live. Omitted by the admin view, which then shows render-time values without live ticking. */
  activeWearSessions?: { categoryId: string }[];
  /** Die schon geladenen Einträge des Dashboards — erspart eine zweite Entry-Query. */
  entries?: SegmentEntry[];
}

/** Server component — fetches per-category wear hours + goals (tracking-enabled non-KG categories
 *  with at least one period target) and hands them to the live client renderer. Categories with a
 *  running wear session tick up live there. Hidden when no goal data. */
export default async function CategoryGoalsToday({ userId, activeWearSessions = [], entries }: Props) {
  const now = new Date();
  const allRows = await buildCategoryWearGoals(userId, now, entries);
  const activeCategoryIds = new Set(activeWearSessions.map((s) => s.categoryId));

  const rows = allRows
    .filter(hasAnyGoal)
    .map((r) => ({ ...r, active: activeCategoryIds.has(r.categoryId) }));
  if (rows.length === 0) return null;

  return <CategoryGoalsLive rows={rows} serverNow={now.toISOString()} />;
}
