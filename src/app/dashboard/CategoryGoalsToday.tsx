import { buildCategoryWearGoals, hasAnyGoal } from "@/lib/categoryGoals";
import { type SegmentEntry } from "@/lib/sessionModel";
import { periodEndsMs, type KgGoalRow } from "@/lib/goalFulfillment";
import CategoryGoalsLive from "./CategoryGoalsLive";
import { KG_CATEGORY_META } from "@/lib/deviceCategories";

interface Props {
  /** Vorgabe aus der Dashboard-Konfiguration — siehe `Section`. */
  defaultCollapsed?: boolean;

  /** Zeitzone des Trägers — entscheidet, wann Tag/Woche/Monat enden. Ohne sie könnte die
   *  Zielauskunft den Tag zur falschen Stunde für beendet erklären. */
  tz: string;
  userId: string;
  /** Currently-running wear sessions (already fetched by the dashboard page) — their categories tick
   *  live. Omitted by the admin view, which then shows render-time values without live ticking. */
  activeWearSessions?: { categoryId: string }[];
  /** Die schon geladenen Einträge des Dashboards — erspart eine zweite Entry-Query. */
  entries?: SegmentEntry[];
  /** Das KG-Ziel als führende Zeile — `null` = nicht zeigen (bei aktiver Sperre steht es in der
   *  grünen Session-Karte, dort baut es `buildKgGoalRow` mit `coveredBySessionCard`). Bewusst PFLICHT
   *  und nicht optional: beide Sichten müssen sich bewusst entscheiden — eine stillschweigend
   *  weggelassene Prop war der Grund, warum die Admin-Übersicht das Ziel früher gar nicht zeigte. */
  kgGoal: KgGoalRow | null;
  /** Kategorie-Ziele laden? Aus, wenn die Kategorie-Funktion deaktiviert ist (dann trägt die Karte
   *  nur das KG-Ziel) — erspart die Query. */
  includeCategories?: boolean;
}

/** Server component — fetches per-category wear hours + goals (tracking-enabled non-KG categories
 *  with at least one period target) and hands them to the live client renderer. Categories with a
 *  running wear session tick up live there. Trägt zusätzlich das KG-Ziel als führende Zeile, wenn
 *  `kgGoal` gesetzt ist. Hidden when neither a KG goal nor any category goal is present. */
export default async function CategoryGoalsToday({ userId, tz, activeWearSessions = [], entries, kgGoal, includeCategories = true, defaultCollapsed }: Props) {
  const now = new Date();
  const activeCategoryIds = new Set(activeWearSessions.map((s) => s.categoryId));

  const rows = includeCategories
    ? (await buildCategoryWearGoals(userId, now, entries))
        .filter(hasAnyGoal)
        .map((r) => ({ ...r, active: activeCategoryIds.has(r.categoryId) }))
    : [];
  if (!kgGoal && rows.length === 0) return null;

  // Der Vorgabe-Name der eingebauten Kategorie, vom Server gereicht — die Client-Komponente darf
  // `deviceCategories.ts` nicht importieren (Prisma). Bekannte Grenze: wer seine Kategorie selbst
  // umbenannt hat, sieht hier trotzdem die Vorgabe; der Umbau auf die DB-Zeile steht in
  // `docs/design/begriffe.md` als Rest.
  return <CategoryGoalsLive rows={rows} kgGoal={kgGoal} kgName={KG_CATEGORY_META.name} serverNow={now.toISOString()} periodEndMs={periodEndsMs(now, tz)} defaultCollapsed={defaultCollapsed} />;
}
