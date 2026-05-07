import Card from "@/app/components/Card";
import { prisma } from "@/lib/prisma";
import {
  buildWearPairs,
  wearingHoursFromPairs,
  formatHours,
  WEAR_PAIR,
  getMidnightToday,
  getWeekStart,
  getMonthStart,
  toDateLocale,
} from "@/lib/utils";
import { CATEGORY_COLOR_HEX, type CategoryColor } from "@/lib/categoryConstants";
import CategoryIconRender from "@/app/components/CategoryIcon";
import { getLocale, getTranslations } from "next-intl/server";

interface Props {
  userId: string;
}

/** Server component — renders a row per non-KG DeviceCategory with today/week/month wear hours.
 *  Hidden when no non-KG categories exist or when feature flag is off (caller decides). */
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
  const dl = toDateLocale(await getLocale());
  if (categories.length === 0) return null;

  const tagStart = getMidnightToday(now);
  const wocheStart = getWeekStart(now);
  const monatStart = getMonthStart(now);

  const blocks = categories.map((c) => {
    const pairs = buildWearPairs(entries, now, { types: WEAR_PAIR, categoryId: c.id });
    return {
      ...c,
      tagH: wearingHoursFromPairs(pairs, tagStart, now),
      wocheH: wearingHoursFromPairs(pairs, wocheStart, now),
      monatH: wearingHoursFromPairs(pairs, monatStart, now),
    };
  });

  return (
    <Card>
      <div className="p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground-muted mb-3">
          {t("byCategory")}
        </h3>
        <ul className="flex flex-col gap-3">
          {blocks.map((b) => {
            const hex = CATEGORY_COLOR_HEX[b.color as CategoryColor] ?? "#64748b";
            return (
              <li key={b.id} className="flex items-center gap-3">
                <div
                  className="size-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: hex + "22", color: hex }}
                  aria-hidden
                >
                  <CategoryIconRender name={b.icon} className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{b.name}</p>
                  <p className="text-xs text-foreground-muted">
                    {t("day")} {formatHours(b.tagH, dl)} · {t("week")} {formatHours(b.wocheH, dl)} · {t("month")} {formatHours(b.monatH, dl)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
}
