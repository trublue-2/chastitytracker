"use client";

import { useTranslations } from "next-intl";
import { Lock } from "lucide-react";
import Card from "@/app/components/Card";
import GoalProgressRow from "@/app/components/GoalProgressRow";
import { categoryStyle } from "@/lib/categoryConstants";
import CategoryIconRender from "@/app/components/CategoryIcon";
import DashboardBlock from "@/app/components/DashboardBlock";
import { useLiveHours } from "@/app/hooks/useLiveHours";
import type { CategoryWearGoal } from "@/lib/categoryGoals";

export interface CategoryGoalRow extends CategoryWearGoal {
  /** True while a wear session for this category is running — its hours tick live. */
  active: boolean;
}

/** Das KG-Ziel als führende Zeile derselben „Trainingsvorgaben"-Karte. Bewusst OHNE Live-Tick und
 *  ohne Kategorie-Icon: es wird nur gezeigt, wenn KEINE Sperre läuft (dann steht es in der grünen
 *  Session-Karte, siehe LaufendeSessionCard) — offen wird gerade nicht getragen, die Stunden stehen.
 *  So sieht der Sub sein KG-Ziel auch im offenen Zustand statt nur während einer Sperre. */
export interface KgGoalRow {
  tagH: number;
  wocheH: number;
  monatH: number;
  jahrH: number;
  goalDayH: number | null;
  goalWeekH: number | null;
  goalMonthH: number | null;
  goalYearH: number | null;
}

/** Client renderer for the per-category training goals. Mirrors the KG goal (LiveTrainingGoals):
 *  when a category has a running session, its today/week/month hours tick up live so the bar
 *  matches a fresh server/MCP computation instead of freezing at page-render time. */
export default function CategoryGoalsLive({ rows, kgGoal = null, serverNow }: { rows: CategoryGoalRow[]; kgGoal?: KgGoalRow | null; serverNow: string }) {
  const t = useTranslations("dashboard");
  return (
    <DashboardBlock>
      <Card>
        <div className="p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground-muted mb-3">
            {t("categoryGoals")}
          </h3>
          <ul className="flex flex-col gap-4">
            {kgGoal && <KgRow goal={kgGoal} />}
            {rows.map((r) => (
              <CategoryRow key={r.categoryId} row={r} serverNow={serverNow} />
            ))}
          </ul>
        </div>
      </Card>
    </DashboardBlock>
  );
}

/** Die KG-Zeile — gleiche Zeilen-/Balken-Optik wie eine Kategorie, aber mit Schloss-Icon (KG ist
 *  keine der Wear-Kategorien) und ohne Live-Tick (nur im offenen Zustand gezeigt). */
function KgRow({ goal }: { goal: KgGoalRow }) {
  const t = useTranslations("dashboard");
  return (
    <li className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div
          className="size-7 rounded-md flex items-center justify-center shrink-0"
          style={{ backgroundColor: "var(--color-lock-bg)", color: "var(--color-lock)" }}
          aria-hidden
        >
          <Lock className="size-3.5" />
        </div>
        <p className="text-sm font-medium text-foreground truncate">{t("kgGoalLabel")}</p>
      </div>
      <div className="pl-9 flex flex-col gap-1">
        {goal.goalDayH != null && <GoalProgressRow label={t("day")} actual={goal.tagH} target={goal.goalDayH} />}
        {goal.goalWeekH != null && <GoalProgressRow label={t("week")} actual={goal.wocheH} target={goal.goalWeekH} />}
        {goal.goalMonthH != null && <GoalProgressRow label={t("month")} actual={goal.monatH} target={goal.goalMonthH} />}
        {goal.goalYearH != null && <GoalProgressRow label={t("year")} actual={goal.jahrH} target={goal.goalYearH} />}
      </div>
    </li>
  );
}

function CategoryRow({ row, serverNow }: { row: CategoryGoalRow; serverNow: string }) {
  const t = useTranslations("dashboard");
  const tagH = useLiveHours(row.tagH, serverNow, row.active);
  const wocheH = useLiveHours(row.wocheH, serverNow, row.active);
  const monatH = useLiveHours(row.monatH, serverNow, row.active);
  const jahrH = useLiveHours(row.jahrH, serverNow, row.active);
  const style = categoryStyle(row.color);

  return (
    <li className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div
          className="size-7 rounded-md flex items-center justify-center shrink-0"
          style={{ backgroundColor: style.backgroundColor, color: style.color }}
          aria-hidden
        >
          <CategoryIconRender name={row.icon} className="size-3.5" />
        </div>
        <p className="text-sm font-medium text-foreground truncate">{row.name}</p>
      </div>
      <div className="pl-9 flex flex-col gap-1">
        {row.goalDayH != null && <GoalProgressRow label={t("day")} actual={tagH} target={row.goalDayH} />}
        {row.goalWeekH != null && <GoalProgressRow label={t("week")} actual={wocheH} target={row.goalWeekH} />}
        {row.goalMonthH != null && <GoalProgressRow label={t("month")} actual={monatH} target={row.goalMonthH} />}
        {row.goalYearH != null && <GoalProgressRow label={t("year")} actual={jahrH} target={row.goalYearH} />}
      </div>
    </li>
  );
}

