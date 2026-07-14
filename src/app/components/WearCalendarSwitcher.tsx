"use client";

import { useTranslations } from "next-intl";
import CalendarExpand from "./CalendarExpand";
import CategorySwitcherCard, { type CategoryVariant } from "./CategorySwitcherCard";
import type { CalendarMonthData } from "@/lib/statsTypes";

/** One picker entry — built server-side from KG + each non-KG category with wear data. */
export type CalendarVariant = CategoryVariant & {
  /** True for the built-in KG variant — controls the orgasm-dot legend item. */
  isKG: boolean;
  months: CalendarMonthData[];
};

/** Tragekalender card with a pill-picker to switch between KG and user-defined
 *  device categories. Non-KG variants hide the orgasm-dot legend item, since
 *  orgasms are not device-specific (semantically they live on the KG calendar). */
export default function WearCalendarSwitcher({ variants }: { variants: CalendarVariant[] }) {
  const t = useTranslations("stats");

  return (
    <CategorySwitcherCard
      title={t("wearCalendar")}
      variants={variants}
      header={(active) => (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-foreground-muted">
          <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-surface-raised border border-border inline-block" />{t("notWorn")}</span>
          <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-blue-100 inline-block" />&lt;25%</span>
          <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-blue-200 inline-block" />25–40%</span>
          <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-blue-400 inline-block" />40–65%</span>
          <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-blue-600 inline-block" />&gt;65%</span>
          {active.isKG && (
            <span className="flex items-center gap-1.5">
              <span className="relative inline-flex w-4 h-4 items-center justify-center">
                <span className="w-4 h-4 rounded bg-surface-raised border border-border inline-block" />
                <span className="absolute bottom-0 right-0 w-1.5 h-1.5 bg-[var(--color-orgasm)] rounded-full" />
              </span>
              {t("orgasm")}
            </span>
          )}
          <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-blue-200 ring-2 ring-emerald-400 inline-block" />{t("dailyGoalReached")}</span>
          <span className="flex items-center gap-1.5"><span className="font-bold text-emerald-500">✓</span>{t("weeklyGoalReached")}</span>
        </div>
      )}
    >
      {(active) => <CalendarExpand months={active.months} />}
    </CategorySwitcherCard>
  );
}
