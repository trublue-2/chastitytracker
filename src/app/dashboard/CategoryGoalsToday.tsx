import Card from "@/app/components/Card";
import { formatHoursHM } from "@/lib/utils";
import { buildCategoryWearGoals, hasAnyGoal } from "@/lib/categoryGoals";
import { categoryStyle } from "@/lib/categoryConstants";
import CategoryIconRender from "@/app/components/CategoryIcon";
import { getTranslations } from "next-intl/server";

interface Props {
  userId: string;
}

/** Server component — renders progress bars per tracking-enabled non-KG category that has an
 *  active TrainingVorgabe with at least one period target. Categories with tracking disabled are
 *  excluded (no wear sessions are recorded for them). Hidden when no data. */
export default async function CategoryGoalsToday({ userId }: Props) {
  const now = new Date();
  const [allRows, t] = await Promise.all([
    buildCategoryWearGoals(userId, now),
    getTranslations("dashboard"),
  ]);
  const rows = allRows.filter(hasAnyGoal);
  if (rows.length === 0) return null;

  return (
    <div className="w-full max-w-2xl mx-auto px-4 pb-2">
      <Card>
        <div className="p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground-muted mb-3">
            {t("trainingGoals")}
          </h3>
          <ul className="flex flex-col gap-4">
            {rows.map((r) => {
              const style = categoryStyle(r.color);
              return (
                <li key={r.categoryId} className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="size-7 rounded-md flex items-center justify-center shrink-0"
                      style={{ backgroundColor: style.backgroundColor, color: style.color }}
                      aria-hidden
                    >
                      <CategoryIconRender name={r.icon} className="size-3.5" />
                    </div>
                    <p className="text-sm font-medium text-foreground truncate">{r.name}</p>
                  </div>
                  <div className="pl-9 flex flex-col gap-1">
                    {r.goalDayH != null && <Goal label={t("day")} actual={r.tagH} target={r.goalDayH} />}
                    {r.goalWeekH != null && <Goal label={t("week")} actual={r.wocheH} target={r.goalWeekH} />}
                    {r.goalMonthH != null && <Goal label={t("month")} actual={r.monatH} target={r.goalMonthH} />}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </Card>
    </div>
  );
}

function Goal({ label, actual, target }: { label: string; actual: number; target: number }) {
  if (target <= 0) return null;
  const pct = Math.min(100, Math.round((actual / target) * 100));
  const reached = pct >= 100;
  const fillClass = reached ? "bg-ok" : pct >= 70 ? "bg-foreground-muted" : "bg-foreground-faint";
  const fmt = (h: number) => formatHoursHM(h).slice(0, -1); // strip trailing "h" for compact reading
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-foreground-faint w-12 shrink-0">{label}</span>
      <div className="flex-1 bg-background-subtle rounded-full h-1.5 overflow-hidden">
        <div className={`h-1.5 rounded-full transition-all ${fillClass}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-foreground-muted tabular-nums shrink-0 w-[6.5rem] text-right">
        {fmt(actual)} / {fmt(target)}h
      </span>
      <span className="text-xs font-semibold text-foreground tabular-nums w-9 text-right shrink-0">
        {pct}%
      </span>
    </div>
  );
}
