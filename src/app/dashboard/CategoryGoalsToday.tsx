import { buildCategoryWearGoals, hasAnyGoal } from "@/lib/categoryGoals";
import { type SegmentEntry } from "@/lib/sessionModel";
import CategoryGoalsLive, { type KgGoalRow } from "./CategoryGoalsLive";

interface Props {
  userId: string;
  /** Currently-running wear sessions (already fetched by the dashboard page) — their categories tick
   *  live. Omitted by the admin view, which then shows render-time values without live ticking. */
  activeWearSessions?: { categoryId: string }[];
  /** Die schon geladenen Einträge des Dashboards — erspart eine zweite Entry-Query. */
  entries?: SegmentEntry[];
  /** Das KG-Ziel als führende Zeile — nur im offenen Zustand gesetzt (bei aktiver Sperre steht es in
   *  der grünen Session-Karte). null = nicht zeigen. */
  kgGoal?: KgGoalRow | null;
  /** Kategorie-Ziele laden? Aus, wenn die Kategorie-Funktion deaktiviert ist (dann trägt die Karte
   *  nur das KG-Ziel) — erspart die Query. */
  includeCategories?: boolean;
}

/** Server component — fetches per-category wear hours + goals (tracking-enabled non-KG categories
 *  with at least one period target) and hands them to the live client renderer. Categories with a
 *  running wear session tick up live there. Trägt zusätzlich optional das KG-Ziel als führende Zeile.
 *  Hidden when neither a KG goal nor any category goal is present. */
export default async function CategoryGoalsToday({ userId, activeWearSessions = [], entries, kgGoal = null, includeCategories = true }: Props) {
  const now = new Date();
  const activeCategoryIds = new Set(activeWearSessions.map((s) => s.categoryId));

  const rows = includeCategories
    ? (await buildCategoryWearGoals(userId, now, entries))
        .filter(hasAnyGoal)
        .map((r) => ({ ...r, active: activeCategoryIds.has(r.categoryId) }))
    : [];
  if (!kgGoal && rows.length === 0) return null;

  return <CategoryGoalsLive rows={rows} kgGoal={kgGoal} serverNow={now.toISOString()} />;
}
