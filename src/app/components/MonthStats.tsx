"use client";

import { useState } from "react";
import { formatHours, formatMs } from "@/lib/utils";
import { useTranslations, useLocale } from "next-intl";

export type MonthStat = {
  key: string;
  label: string;
  count: number;
  totalMs: number;
  longestMs: number;
  wearHours: number;
  targetH: number | null;
};

const INITIAL_COUNT = 2;

export default function MonthStats({ months }: { months: MonthStat[] }) {
  const t = useTranslations("stats");
  const locale = useLocale();
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? months : months.slice(0, INITIAL_COUNT);
  const remaining = months.length - INITIAL_COUNT;

  return (
    <section className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-50">
        <p className="text-sm font-bold text-gray-900">{t("monthlyOverview")}</p>
      </div>
      <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-6 py-3 border-b border-gray-50">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">{t("monthCol")}</span>
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 text-right">{t("countCol")}</span>
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 text-right">{t("wearTimeCol")}</span>
        <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400 text-right">{t("goalCol")}</span>
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 text-right">{t("longestCol")}</span>
      </div>
      <div className="divide-y divide-gray-50">
        {visible.map((m) => {
          const pct = m.targetH ? Math.min((m.wearHours / m.targetH) * 100, 100) : null;
          const reached = pct !== null && pct >= 100;
          return (
            <div key={m.key} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-6 py-3 hover:bg-gray-50/60 transition items-center">
              <span className="text-sm text-gray-700 capitalize">{m.label}</span>
              <span className="text-sm font-semibold text-gray-900 text-right tabular-nums">{m.count}</span>
              <div className="text-right">
                <span className="text-sm font-mono text-gray-500 tabular-nums">{formatHours(m.wearHours, locale)}</span>
                {pct !== null && (
                  <div className="mt-1 h-1 w-16 bg-gray-100 rounded-full overflow-hidden ml-auto">
                    <div className={`h-full rounded-full ${reached ? "bg-emerald-400" : "bg-indigo-300"}`} style={{ width: `${pct}%` }} />
                  </div>
                )}
              </div>
              <div className="text-right">
                {m.targetH ? (
                  <span className={`text-sm font-mono tabular-nums ${reached ? "text-emerald-600 font-semibold" : "text-indigo-400"}`}>
                    {reached ? "✓ " : ""}{formatHours(m.targetH, locale)}
                  </span>
                ) : <span className="text-sm text-gray-300">–</span>}
              </div>
              <span className="text-sm font-mono text-gray-400 text-right tabular-nums">{formatMs(m.longestMs, locale)}</span>
            </div>
          );
        })}
      </div>
      {!showAll && remaining > 0 && (
        <div className="px-6 py-4 border-t border-gray-50">
          <button
            onClick={() => setShowAll(true)}
            className="w-full text-sm text-indigo-500 hover:text-indigo-700 font-medium transition"
          >
            {t("showMore", { count: remaining })}
          </button>
        </div>
      )}
    </section>
  );
}
