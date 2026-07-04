"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Card from "@/app/components/Card";
import { WEAR_LEVEL_UPPER } from "@/lib/wearIntensity";

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
   *  Rendered as rows on narrow cards (portrait phone) and as columns on wide cards (GitHub style). */
  weeks: (HeatmapDay | null)[][];
  /** Month label anchored to the week index where the month first appears. */
  monthLabels: { week: number; label: string }[];
  /** Total worn hours in the year + share of the (elapsed) year spent locked. */
  totalHours: string;
  percentLocked: number;
}

// Shared 5-tier blue scale — identical thresholds to the month calendar (via wearIntensityLevel).
const LEVEL_CLASS = ["bg-surface-raised", "bg-blue-100", "bg-blue-200", "bg-blue-400", "bg-blue-600"];

// Legend rows: swatch + the day-share (%) band each level represents, derived from the shared
// thresholds so the legend never drifts from the actual colouring. [0, 20, 40, 80, 100].
const LEGEND_BOUNDS = [0, ...WEAR_LEVEL_UPPER.map((t) => Math.round(t * 100)), 100];
const LEGEND = LEVEL_CLASS.map((cls, i) => ({
  cls,
  label: i === 0 ? "0 %" : `${LEGEND_BOUNDS[i - 1]}–${LEGEND_BOUNDS[i]} %`,
}));

/** A single coloured day square. `size`/`dot` classes let both layouts pick their own cell scale. */
function DayCell({ day, size, dot }: { day: HeatmapDay; size: string; dot: string }) {
  return (
    <div title={day.title} className={`${size} rounded-[3px] ${LEVEL_CLASS[day.level]} relative`}>
      {day.hasOrgasm && <span className={`absolute -top-px -right-px ${dot} bg-[var(--color-orgasm)] rounded-full`} />}
    </div>
  );
}

function SummaryText({ data }: { data: YearHeatmapData }) {
  const t = useTranslations("stats");
  return (
    <div className="flex flex-col gap-0.5 text-xs">
      <span className="font-semibold text-foreground">{t("yearTotal", { hours: data.totalHours })}</span>
      <span className="text-foreground-muted">{t("percentLocked", { percent: data.percentLocked })}</span>
    </div>
  );
}

/** Colour legend with the numeric day-share band per level (stacked; sits in the side column). */
function NumericLegend() {
  const t = useTranslations("stats");
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] text-foreground-faint">{t("heatmapLegendCaption")}</span>
      <div className="flex flex-col gap-1">
        {LEGEND.map((e, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className={`w-[13px] h-[13px] rounded-[3px] ${e.cls} shrink-0`} />
            <span className="text-[10px] text-foreground-faint tabular-nums">{e.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Übersichtstext + numerische Legende als Seiten-Spalte — in beiden Layouts rechts neben dem Grid. */
function SideColumn({ data }: { data: YearHeatmapData }) {
  return (
    <div className="flex flex-col gap-4 pt-1 min-w-[110px] shrink-0">
      <SummaryText data={data} />
      <NumericLegend />
    </div>
  );
}

/** Portrait layout: 7 columns (Mon..Sun), weeks stacked as rows (Jan top → Dec bottom), legend right. */
function VerticalGrid({ data, weekdayLabels }: { data: YearHeatmapData; weekdayLabels: string[] }) {
  return (
    <div className="flex gap-5 items-start">
      <div className="flex flex-col gap-[3px] w-fit shrink-0">
        <div className="flex gap-[3px]">
          <div className="w-8 shrink-0" />
          {weekdayLabels.map((wd, i) => (
            <div key={i} className="w-[15px] text-[9px] text-foreground-faint text-center leading-none">{wd}</div>
          ))}
        </div>
        {data.weeks.map((week, row) => {
          const monthLabel = data.monthLabels.find((m) => m.week === row)?.label ?? "";
          return (
            <div key={row} className="flex gap-[3px] items-center">
              <div className="w-8 shrink-0 text-[10px] text-foreground-faint text-right pr-1 leading-none">{monthLabel}</div>
              {week.map((day, col) =>
                day ? <DayCell key={day.key} day={day} size="w-[15px] h-[15px]" dot="w-[4px] h-[4px]" />
                    : <div key={`${row}-${col}`} className="w-[15px] h-[15px]" />,
              )}
            </div>
          );
        })}
      </div>
      <SideColumn data={data} />
    </div>
  );
}

/** Wide layout (GitHub style): weeks as columns (Jan left → Dec right), weekdays as rows; legend right. */
function HorizontalGrid({ data, weekdayLabels }: { data: YearHeatmapData; weekdayLabels: string[] }) {
  return (
    <div className="flex gap-6 items-start">
      <div className="overflow-x-auto min-w-0">
        <div className="inline-flex flex-col gap-1">
          <div className="flex gap-[3px] pl-7 h-4">
            {data.weeks.map((_, col) => (
              <div key={col} className="w-[11px] text-[10px] text-foreground-faint leading-none whitespace-nowrap">
                {data.monthLabels.find((m) => m.week === col)?.label ?? ""}
              </div>
            ))}
          </div>
          <div className="flex gap-[3px]">
            <div className="flex flex-col gap-[3px] pr-1 w-6 shrink-0">
              {weekdayLabels.map((wd, row) => (
                <div key={row} className="h-[11px] text-[9px] text-foreground-faint leading-[11px] text-right">
                  {row % 2 === 0 ? wd : ""}
                </div>
              ))}
            </div>
            {data.weeks.map((week, col) => (
              <div key={col} className="flex flex-col gap-[3px]">
                {week.map((day, row) =>
                  day ? <DayCell key={day.key} day={day} size="w-[11px] h-[11px]" dot="w-[3px] h-[3px]" />
                      : <div key={`${col}-${row}`} className="w-[11px] h-[11px]" />,
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <SideColumn data={data} />
    </div>
  );
}

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

      {/* Container-Query nach KARTEN-Breite (nicht Viewport): schmale Karte → vertikales Grid mit
          Legende rechts; breite Karte → horizontales GitHub-Grid, Legende ebenfalls rechts. Das
          53-Wochen-Grid hat overflow-x-auto als Sicherheitsnetz, falls die Karte grenzwertig schmal ist. */}
      <div className="@container px-6 py-4">
        <div className="@[760px]:hidden">
          <VerticalGrid data={data} weekdayLabels={weekdayLabels} />
        </div>
        <div className="hidden @[760px]:block">
          <HorizontalGrid data={data} weekdayLabels={weekdayLabels} />
        </div>
      </div>
    </Card>
  );
}
