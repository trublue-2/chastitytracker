"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Card from "@/app/components/Card";

/** One day cell in the year heatmap. `level` 0..4 maps to the shared blue intensity scale. */
export interface HeatmapDay {
  key: string;
  /** Native-tooltip text, e.g. "15. Juli 2026 · 12.5 h". */
  title: string;
  level: number;
  hasOrgasm: boolean;
}

export interface YearHeatmapData {
  year: number;
  /** ISO weeks (Mon-start), earliest first; each week is 7 cells Mon..Sun (null = padding / future).
   *  Rendered as rows (top = January, bottom = December) so the grid is only 7 cells wide → fits portrait. */
  weeks: (HeatmapDay | null)[][];
  /** Month label anchored to the week (row index) where the month first appears. */
  monthLabels: { week: number; label: string }[];
  /** Total worn hours in the year + share of the (elapsed) year spent locked. */
  totalHours: string;
  percentLocked: number;
}

// Shared 5-tier blue scale — identical thresholds to the month calendar (hours/24).
const LEVEL_CLASS = ["bg-surface-raised", "bg-blue-100", "bg-blue-200", "bg-blue-400", "bg-blue-600"];

export default function YearHeatmap({
  years,
  weekdayLabels,
}: {
  years: YearHeatmapData[];
  /** 7 short weekday names Mon..Sun (localized, server-provided). */
  weekdayLabels: string[];
}) {
  const t = useTranslations("stats");
  const [selected, setSelected] = useState(years[0]?.year);
  const data = years.find((y) => y.year === selected) ?? years[0];
  if (!data) return null;

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="px-6 py-4 border-b border-border-subtle flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm font-bold text-foreground">{t("yearlyHeatmap")}</p>
        {years.length > 1 && (
          <div className="flex items-center gap-1" role="group" aria-label={t("selectYear")}>
            {years.map((y) => (
              <button
                key={y.year}
                type="button"
                onClick={() => setSelected(y.year)}
                aria-pressed={y.year === data.year}
                className={`text-xs font-semibold px-2.5 py-1 rounded-lg border transition ${
                  y.year === data.year
                    ? "bg-foreground text-background border-foreground"
                    : "border-border text-foreground-muted hover:text-foreground"
                }`}
              >
                {y.year}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="px-6 py-4 flex flex-col gap-3">
        <p className="text-xs text-foreground-muted">
          {t("yearTotal", { hours: data.totalHours })} · {t("percentLocked", { percent: data.percentLocked })}
        </p>

        {/* Vertikales Grid: 7 Spalten (Mo..So), Wochen als Zeilen (Jan oben → Dez unten) — passt in
            die Handybreite ohne horizontales Scrollen. Monats-Labels links, Wochentage oben. */}
        <div className="flex flex-col gap-[3px] w-fit">
          {/* Header: weekday labels (Mo..So), with a left gutter for the month labels */}
          <div className="flex gap-[3px]">
            <div className="w-8 shrink-0" />
            {weekdayLabels.map((wd, i) => (
              <div key={i} className="w-[15px] text-[9px] text-foreground-faint text-center leading-none">
                {wd}
              </div>
            ))}
          </div>

          {/* One row per ISO week */}
          {data.weeks.map((week, row) => {
            const monthLabel = data.monthLabels.find((m) => m.week === row)?.label ?? "";
            return (
              <div key={row} className="flex gap-[3px] items-center">
                <div className="w-8 shrink-0 text-[10px] text-foreground-faint text-right pr-1 leading-none">
                  {monthLabel}
                </div>
                {week.map((day, col) =>
                  day ? (
                    <div
                      key={day.key}
                      title={day.title}
                      className={`w-[15px] h-[15px] rounded-[3px] ${LEVEL_CLASS[day.level]} relative`}
                    >
                      {day.hasOrgasm && (
                        <span className="absolute -top-px -right-px w-[4px] h-[4px] bg-[var(--color-orgasm)] rounded-full" />
                      )}
                    </div>
                  ) : (
                    <div key={`${row}-${col}`} className="w-[15px] h-[15px]" />
                  ),
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-1.5 text-[10px] text-foreground-faint">
          <span>{t("heatmapLess")}</span>
          {LEVEL_CLASS.map((cls, i) => (
            <span key={i} className={`w-[15px] h-[15px] rounded-[3px] ${cls}`} />
          ))}
          <span>{t("heatmapMore")}</span>
        </div>
      </div>
    </Card>
  );
}
