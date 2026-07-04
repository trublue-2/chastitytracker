"use client";

import { useTranslations } from "next-intl";
import Card from "@/app/components/Card";
import { formatHoursHMCompact } from "@/lib/utils";
import { categoryStyle } from "@/lib/categoryConstants";
import CategoryIconRender from "@/app/components/CategoryIcon";
import { useLiveHours } from "@/app/hooks/useLiveHours";
import type { CategoryWearGoal } from "@/lib/categoryGoals";

export interface CategoryGoalRow extends CategoryWearGoal {
  /** True while a wear session for this category is running — its hours tick live. */
  active: boolean;
}

/** Client renderer for the per-category training goals. Mirrors the KG goal (LiveTrainingGoals):
 *  when a category has a running session, its today/week/month hours tick up live so the bar
 *  matches a fresh server/MCP computation instead of freezing at page-render time. */
export default function CategoryGoalsLive({ rows, serverNow }: { rows: CategoryGoalRow[]; serverNow: string }) {
  const t = useTranslations("dashboard");
  return (
    <div className="w-full max-w-2xl mx-auto px-4 pb-2">
      <Card>
        <div className="p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground-muted mb-3">
            {t("trainingGoals")}
          </h3>
          <ul className="flex flex-col gap-4">
            {rows.map((r) => (
              <CategoryRow key={r.categoryId} row={r} serverNow={serverNow} />
            ))}
          </ul>
        </div>
      </Card>
    </div>
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
        {row.goalDayH != null && <Goal label={t("day")} actual={tagH} target={row.goalDayH} />}
        {row.goalWeekH != null && <Goal label={t("week")} actual={wocheH} target={row.goalWeekH} />}
        {row.goalMonthH != null && <Goal label={t("month")} actual={monatH} target={row.goalMonthH} />}
        {row.goalYearH != null && <Goal label={t("year")} actual={jahrH} target={row.goalYearH} />}
      </div>
    </li>
  );
}

function Goal({ label, actual, target }: { label: string; actual: number; target: number }) {
  if (target <= 0) return null;
  const pct = Math.min(100, Math.round((actual / target) * 100));
  const reached = pct >= 100;
  const fillClass = reached ? "bg-ok" : pct >= 70 ? "bg-foreground-muted" : "bg-foreground-faint";
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-foreground-faint w-12 shrink-0">{label}</span>
      <div className="flex-1 bg-background-subtle rounded-full h-1.5 overflow-hidden">
        <div className={`h-1.5 rounded-full transition-all ${fillClass}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-foreground-muted tabular-nums shrink-0 w-[6.5rem] text-right">
        {formatHoursHMCompact(actual)} / {formatHoursHMCompact(target)}h
      </span>
      <span className="text-xs font-semibold text-foreground tabular-nums w-9 text-right shrink-0">
        {pct}%
      </span>
    </div>
  );
}
