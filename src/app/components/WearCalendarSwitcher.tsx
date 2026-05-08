"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Card from "./Card";
import CalendarExpand from "./CalendarExpand";
import CategoryIconRender from "./CategoryIcon";
import { categoryStyle } from "@/lib/categoryConstants";
import type { CalendarMonthData } from "./CalendarContainer";

/** One picker entry — built server-side from KG + each non-KG category with wear data. */
export type CalendarVariant = {
  id: string;
  name: string;
  color: string;
  icon: string;
  /** True for the built-in KG variant — controls the orgasm-dot legend item. */
  isKG: boolean;
  months: CalendarMonthData[];
};

interface Props {
  variants: CalendarVariant[];
}

/** Tragekalender card with a pill-picker to switch between KG and user-defined
 *  device categories. Non-KG variants hide the orgasm-dot legend item, since
 *  orgasms are not device-specific (semantically they live on the KG calendar).
 *  Picker is hidden when only one variant exists — backward-compat for users
 *  who only track KG. */
export default function WearCalendarSwitcher({ variants }: Props) {
  const t = useTranslations("stats");
  const [activeId, setActiveId] = useState(variants[0]?.id ?? "kg");
  const active = variants.find((v) => v.id === activeId) ?? variants[0];
  if (!active) return null;

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="px-6 py-4 border-b border-border-subtle flex flex-col gap-3">
        <p className="text-sm font-bold text-foreground">{t("wearCalendar")}</p>

        {variants.length > 1 && (
          <div className="flex flex-wrap gap-2" role="tablist" aria-label={t("wearCalendar")}>
            {variants.map((v) => {
              const isActive = v.id === active.id;
              const activeStyle = categoryStyle(v.color);
              return (
                <button
                  key={v.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveId(v.id)}
                  className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-sm font-medium transition active:scale-95 ${
                    isActive
                      ? "border shadow-card"
                      : "bg-surface-raised text-foreground-muted border-border hover:bg-background-subtle"
                  }`}
                  style={isActive ? activeStyle : undefined}
                >
                  <CategoryIconRender name={v.icon} className="size-3.5" />
                  {v.name}
                </button>
              );
            })}
          </div>
        )}

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
      </div>
      <CalendarExpand months={active.months} />
    </Card>
  );
}
