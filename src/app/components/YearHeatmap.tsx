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
  /** Columns = ISO weeks (Mon-start); each column is 7 cells Mon..Sun (null = padding / future). */
  columns: (HeatmapDay | null)[][];
  /** Month label anchored to the column where the month first appears. */
  monthLabels: { col: number; label: string }[];
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

        <div className="overflow-x-auto">
          <div className="inline-flex flex-col gap-1 min-w-0">
            {/* Month labels aligned to their starting column */}
            <div className="flex gap-[3px] pl-7 h-4">
              {data.columns.map((_, col) => {
                const label = data.monthLabels.find((m) => m.col === col)?.label ?? "";
                return (
                  <div key={col} className="w-[11px] text-[10px] text-foreground-faint leading-none overflow-visible whitespace-nowrap">
                    {label}
                  </div>
                );
              })}
            </div>

            <div className="flex gap-[3px]">
              {/* Weekday labels (Mon/Wed/Fri like GitHub) */}
              <div className="flex flex-col gap-[3px] pr-1 w-6 shrink-0">
                {weekdayLabels.map((wd, row) => (
                  <div key={row} className="h-[11px] text-[9px] text-foreground-faint leading-[11px] text-right">
                    {row % 2 === 0 ? wd : ""}
                  </div>
                ))}
              </div>

              {/* Week columns */}
              {data.columns.map((week, col) => (
                <div key={col} className="flex flex-col gap-[3px]">
                  {week.map((day, row) =>
                    day ? (
                      <div
                        key={day.key}
                        title={day.title}
                        className={`w-[11px] h-[11px] rounded-[2px] ${LEVEL_CLASS[day.level]} relative`}
                      >
                        {day.hasOrgasm && (
                          <span className="absolute -top-px -right-px w-[3px] h-[3px] bg-[var(--color-orgasm)] rounded-full" />
                        )}
                      </div>
                    ) : (
                      <div key={`${col}-${row}`} className="w-[11px] h-[11px]" />
                    ),
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-1.5 text-[10px] text-foreground-faint">
          <span>{t("heatmapLess")}</span>
          {LEVEL_CLASS.map((cls, i) => (
            <span key={i} className={`w-[11px] h-[11px] rounded-[2px] ${cls}`} />
          ))}
          <span>{t("heatmapMore")}</span>
        </div>
      </div>
    </Card>
  );
}
