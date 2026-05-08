import Card from "@/app/components/Card";
import { prisma } from "@/lib/prisma";
import {
  buildWearPairs,
  wearingHoursFromPairs,
  formatHoursHM,
  WEAR_PAIR,
  getMidnightToday,
  getWeekStart,
  getMonthStart,
} from "@/lib/utils";
import { categoryStyle } from "@/lib/categoryConstants";
import CategoryIconRender from "@/app/components/CategoryIcon";
import { getTranslations } from "next-intl/server";

interface Props {
  userId: string;
}

interface Row {
  id: string;
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

/** Server component — renders progress bars per non-KG category that has an active
 *  TrainingVorgabe with at least one period target. Hidden when no data. */
export default async function CategoryGoalsToday({ userId }: Props) {
  const now = new Date();
  const [vorgaben, t] = await Promise.all([
    prisma.trainingVorgabe.findMany({
      where: {
        userId,
        gueltigAb: { lte: now },
        OR: [{ gueltigBis: null }, { gueltigBis: { gte: now } }],
        categoryId: { not: null },
        category: { isBuiltIn: false },
      },
      select: {
        categoryId: true,
        minProTagH: true,
        minProWocheH: true,
        minProMonatH: true,
        category: { select: { id: true, name: true, color: true, icon: true } },
      },
    }),
    getTranslations("dashboard"),
  ]);
  if (vorgaben.length === 0) return null;

  // One Vorgabe per Category (most recent active). Group by categoryId taking the first
  // (Prisma returns no order; for stability we'd want orderBy gueltigAb desc, but since
  // we expect at most one active vorgabe per category in normal usage, this is fine).
  const byCategory = new Map<string, typeof vorgaben[number]>();
  for (const v of vorgaben) if (v.categoryId && !byCategory.has(v.categoryId)) byCategory.set(v.categoryId, v);

  const categoryIds = [...byCategory.keys()];
  const entries = await prisma.entry.findMany({
    where: { userId, type: { in: ["WEAR_BEGIN", "WEAR_END"] } },
    orderBy: { startTime: "asc" },
    select: { type: true, startTime: true, device: { select: { categoryId: true } } },
  });

  const tagStart = getMidnightToday(now);
  const wocheStart = getWeekStart(now);
  const monatStart = getMonthStart(now);

  const rows: Row[] = categoryIds.flatMap((cid): Row[] => {
    const v = byCategory.get(cid);
    if (!v?.category) return [];
    const pairs = buildWearPairs(entries, now, { types: WEAR_PAIR, categoryId: cid });
    return [{
      id: v.category.id,
      name: v.category.name,
      color: v.category.color,
      icon: v.category.icon,
      tagH: wearingHoursFromPairs(pairs, tagStart, now),
      wocheH: wearingHoursFromPairs(pairs, wocheStart, now),
      monatH: wearingHoursFromPairs(pairs, monatStart, now),
      goalDayH: v.minProTagH,
      goalWeekH: v.minProWocheH,
      goalMonthH: v.minProMonatH,
    }];
  });

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
                <li key={r.id} className="flex flex-col gap-2">
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
