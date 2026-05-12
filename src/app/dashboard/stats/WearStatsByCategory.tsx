import Card from "@/app/components/Card";
import { prisma } from "@/lib/prisma";
import {
  buildWearPairs,
  wearingHoursFromPairs,
  formatHours,
  formatMs,
  WEAR_PAIR,
  getMidnightToday,
  getWeekStart,
  getMonthStart,
  toDateLocale,
  type WearPair,
} from "@/lib/utils";
import { categoryStyle } from "@/lib/categoryConstants";
import CategoryIconRender from "@/app/components/CategoryIcon";
import { getLocale, getTranslations } from "next-intl/server";

interface Props {
  userId: string;
}

/** Returns durations of completed pairs in ms (excludes the open session ending at `now`). */
function completedDurationsMs(pairs: WearPair[], now: Date): number[] {
  return pairs
    .filter((p) => p.end.getTime() < now.getTime())
    .map((p) => p.end.getTime() - p.start.getTime())
    .filter((d) => d > 0);
}

/** Server component — renders a stats block per non-KG DeviceCategory: today/week/month
 *  totals plus records (longest session, count, avg, all-time total). */
export default async function WearStatsByCategory({ userId }: Props) {
  const now = new Date();
  const [categories, entries, t] = await Promise.all([
    prisma.deviceCategory.findMany({
      where: { userId, isBuiltIn: false },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, color: true, icon: true },
    }),
    prisma.entry.findMany({
      where: { userId, type: { in: ["WEAR_BEGIN", "WEAR_END"] } },
      orderBy: { startTime: "asc" },
      select: {
        type: true,
        startTime: true,
        device: { select: { categoryId: true } },
      },
    }),
    getTranslations("stats"),
  ]);
  const locale = await getLocale();
  const dl = toDateLocale(locale);
  if (categories.length === 0) return null;

  const tagStart = getMidnightToday(now);
  const wocheStart = getWeekStart(now);
  const monatStart = getMonthStart(now);

  const blocks = categories.map((c) => {
    const pairs = buildWearPairs(entries, now, { types: WEAR_PAIR, categoryId: c.id });
    const completed = completedDurationsMs(pairs, now);
    const longestMs = completed.length > 0 ? Math.max(...completed) : 0;
    const avgMs = completed.length > 0 ? completed.reduce((s, d) => s + d, 0) / completed.length : 0;
    // Total all-time: sum of all pairs incl. open session up to now
    const totalH = pairs.reduce((s, p) => s + (p.end.getTime() - p.start.getTime()), 0) / 3_600_000;
    return {
      ...c,
      tagH: wearingHoursFromPairs(pairs, tagStart, now),
      wocheH: wearingHoursFromPairs(pairs, wocheStart, now),
      monatH: wearingHoursFromPairs(pairs, monatStart, now),
      sessionCount: pairs.length,
      longestMs,
      avgMs,
      totalH,
    };
  });

  return (
    <Card>
      <div className="p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground-muted mb-3">
          {t("byCategory")}
        </h3>
        <ul className="flex flex-col gap-5">
          {blocks.map((b) => {
            const style = categoryStyle(b.color);
            return (
              <li key={b.id}>
                <div className="flex items-center gap-3 mb-2">
                  <div
                    className="size-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: style.backgroundColor, color: style.color }}
                    aria-hidden
                  >
                    <CategoryIconRender name={b.icon} className="size-4" />
                  </div>
                  <p className="text-sm font-medium text-foreground truncate">{b.name}</p>
                </div>
                {/* Period totals */}
                <div className="grid grid-cols-3 gap-3 mb-3 pl-12">
                  <Stat label={t("day")} value={formatHours(b.tagH, dl)} />
                  <Stat label={t("week")} value={formatHours(b.wocheH, dl)} />
                  <Stat label={t("month")} value={formatHours(b.monatH, dl)} />
                </div>
                {/* Records — only render when there's at least one completed session */}
                {b.sessionCount > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pl-12">
                    <Stat label={t("longestSession")} value={b.longestMs > 0 ? formatMs(b.longestMs, dl) : "–"} />
                    <Stat label={t("entries")} value={String(b.sessionCount)} />
                    <Stat label={t("avgSession")} value={b.avgMs > 0 ? formatMs(b.avgMs, dl) : "–"} />
                    <Stat label={t("totalAllTime")} value={formatHours(b.totalH, dl)} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-foreground-faint truncate">{label}</p>
      <p className="text-sm font-medium text-foreground tabular-nums truncate">{value}</p>
    </div>
  );
}
