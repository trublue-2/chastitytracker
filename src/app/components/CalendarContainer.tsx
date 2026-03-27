"use client";

import { useState, Fragment } from "react";
import { formatHours, toDateLocale } from "@/lib/utils";
import { useLocale, useTranslations } from "next-intl";

export type DayEntry = {
  type: string;
  time: string;
  note?: string | null;
  orgasmusArt?: string | null;
};

export type DayVorgabe = {
  minProTagH?: number | null;
  minProWocheH?: number | null;
  minProMonatH?: number | null;
  notiz?: string | null;
};

export type CalendarDayData = {
  day: number;
  dateLabel: string;
  wearHours: number;
  hasOrgasm: boolean;
  dailyGoalMet: boolean | null;
  colorClass: string;
  entries: DayEntry[];
  vorgabe: DayVorgabe | null;
};

export type CalendarMonthData = {
  label: string;
  weeks: (CalendarDayData | null)[][];
  weekGoalMet: (boolean | null)[];
  weekGoalPct: (number | null)[];
  monthGoalMet: boolean | null;
  monthGoalPct: number | null;
};

export default function CalendarContainer({ months }: { months: CalendarMonthData[] }) {
  const locale = useLocale();
  const t = useTranslations("calendar");
  const [selected, setSelected] = useState<CalendarDayData | null>(null);

  const TYPE_LABELS: Record<string, string> = {
    VERSCHLUSS: t("typeVerschluss"),
    OEFFNEN: t("typeOeffnen"),
    PRUEFUNG: t("typePruefung"),
    ORGASMUS: t("typeOrgasmus"),
  };

  // Generate locale-aware short day names starting from Monday
  const DAY_NAMES = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(2024, 0, 1 + i); // 2024-01-01 is a Monday
    return date.toLocaleDateString(toDateLocale(locale), { weekday: "short" });
  });

  return (
    <>
      <div className="px-4 py-4 grid grid-cols-1 sm:grid-cols-2 gap-6">
        {months.map((m, mi) => (
          <div key={mi}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-foreground capitalize">{m.label}</p>
              {m.monthGoalMet !== null && (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${m.monthGoalMet ? "bg-ok-bg text-ok-text border-ok-border" : "bg-surface-raised text-foreground-faint border-border"}`}>
                  {m.monthGoalMet ? "✓ Monatsziel" : `${m.monthGoalPct}%`}
                </span>
              )}
            </div>
            <div className="grid grid-cols-8 gap-0.5">
              {/* Header */}
              {DAY_NAMES.map((d) => (
                <div key={d} className="text-center text-xs text-foreground-faint font-medium pb-1">{d}</div>
              ))}
              <div className="pb-1" />

              {/* Weeks */}
              {m.weeks.map((week, wi) => (
                <Fragment key={wi}>
                  {week.map((dayData, di) => {
                    if (!dayData) return <div key={`${wi}-${di}`} className="aspect-square" />;
                    const hasData = dayData.entries.length > 0 || dayData.wearHours > 0;
                    return (
                      <button
                        key={`${wi}-${di}`}
                        onClick={() => hasData && setSelected(dayData)}
                        className={`relative rounded aspect-square flex items-center justify-center w-full ${dayData.colorClass} ${dayData.dailyGoalMet === true ? "ring-2 ring-emerald-400" : ""} ${hasData ? "cursor-pointer hover:opacity-75 active:scale-95 transition-all" : "cursor-default"}`}
                        title={dayData.wearHours > 0 ? `${Math.round(dayData.wearHours * 10) / 10}h` : undefined}
                      >
                        <span className="text-xs font-medium leading-none">{dayData.day}</span>
                        {dayData.hasOrgasm && <span className="absolute bottom-0.5 right-0.5 w-1.5 h-1.5 bg-[var(--color-orgasm)] rounded-full" />}
                      </button>
                    );
                  })}
                  {/* Weekly goal indicator */}
                  <div className="flex items-center justify-center aspect-square">
                    {m.weekGoalMet[wi] === true && <span className="text-ok text-xs font-bold leading-none">✓</span>}
                    {m.weekGoalMet[wi] === false && m.weekGoalPct[wi] !== null && (
                      <span className="text-foreground-faint text-[10px] font-medium leading-none">{m.weekGoalPct[wi]}%</span>
                    )}
                  </div>
                </Fragment>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Single shared modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="relative bg-surface rounded-2xl shadow-overlay border border-border w-full max-w-sm p-5 flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <p className="font-bold text-foreground">{selected.dateLabel}</p>
              <button onClick={() => setSelected(null)} className="text-foreground-faint hover:text-foreground-muted text-lg leading-none px-1 transition">✕</button>
            </div>

            {selected.wearHours > 0 && (
              <div className="flex items-center justify-between bg-lock-bg rounded-xl px-4 py-3">
                <span className="text-sm text-lock-text font-medium">{t("wearTime")}</span>
                <span className="text-sm font-bold text-lock-text tabular-nums">{formatHours(selected.wearHours, locale)}</span>
              </div>
            )}

            {selected.vorgabe && (
              <div className="bg-request-bg rounded-xl px-4 py-3 flex flex-col gap-1.5 border border-request-border">
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-request)] mb-0.5">{t("validGoal")}</p>
                {selected.vorgabe.minProTagH != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-request-text">{t("minPerDay")}</span>
                    <span className={`text-xs font-bold ${selected.wearHours >= selected.vorgabe.minProTagH ? "text-ok" : "text-[var(--color-request)]"}`}>
                      {selected.wearHours >= selected.vorgabe.minProTagH ? "✓ " : ""}{formatHours(selected.vorgabe.minProTagH, locale)}
                    </span>
                  </div>
                )}
                {selected.vorgabe.minProWocheH != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-request-text">{t("minPerWeek")}</span>
                    <span className="text-xs font-bold text-[var(--color-request)]">{formatHours(selected.vorgabe.minProWocheH, locale)}</span>
                  </div>
                )}
                {selected.vorgabe.minProMonatH != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-request-text">{t("minPerMonth")}</span>
                    <span className="text-xs font-bold text-[var(--color-request)]">{formatHours(selected.vorgabe.minProMonatH, locale)}</span>
                  </div>
                )}
                {selected.vorgabe.notiz && <p className="text-xs text-request-text italic mt-0.5 opacity-70">{selected.vorgabe.notiz}</p>}
              </div>
            )}

            {selected.entries.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-foreground-faint mb-2">{t("entries")}</p>
                <div className="flex flex-col divide-y divide-border-subtle">
                  {selected.entries.map((e, i) => (
                    <div key={i} className="flex items-start justify-between gap-2 py-2">
                      <span className="text-sm text-foreground-muted">{TYPE_LABELS[e.type] ?? e.type}</span>
                      <div className="text-right">
                        <span className="text-foreground-muted font-mono text-xs tabular-nums whitespace-nowrap">{e.time}</span>
                        {e.orgasmusArt && <p className="text-xs text-[var(--color-orgasm)]">{e.orgasmusArt}</p>}
                        {e.note && <p className="text-xs text-foreground-faint italic">{e.note}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
