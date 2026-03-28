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
    <section className="bg-surface rounded-2xl border border-border overflow-hidden">
      <div className="px-6 py-4 border-b border-border-subtle">
        <p className="text-sm font-bold text-foreground">{t("monthlyOverview")}</p>
      </div>
      <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-6 py-3 border-b border-border-subtle">
        <span className="text-xs font-semibold uppercase tracking-wider text-foreground-faint">{t("monthCol")}</span>
        <span className="text-xs font-semibold uppercase tracking-wider text-foreground-faint text-right">{t("countCol")}</span>
        <span className="text-xs font-semibold uppercase tracking-wider text-foreground-faint text-right">{t("wearTimeCol")}</span>
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-request)] text-right">{t("goalCol")}</span>
        <span className="text-xs font-semibold uppercase tracking-wider text-foreground-faint text-right">{t("longestCol")}</span>
      </div>
      <div className="divide-y divide-border-subtle">
        {visible.map((m) => {
          const pct = m.targetH ? Math.min((m.wearHours / m.targetH) * 100, 100) : null;
          const reached = pct !== null && pct >= 100;
          return (
            <div key={m.key} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-6 py-3 hover:bg-surface-raised/60 transition items-center">
              <span className="text-sm text-foreground-muted capitalize">{m.label}</span>
              <span className="text-sm font-semibold text-foreground text-right tabular-nums">{m.count}</span>
              <div className="text-right">
                <span className="text-sm font-mono text-foreground-muted tabular-nums">{formatHours(m.wearHours, locale)}</span>
                {pct !== null && (
                  <div className="mt-1 h-1 w-16 bg-border rounded-full overflow-hidden ml-auto">
                    <div className={`h-full rounded-full ${reached ? "bg-ok" : "bg-[var(--color-request)]"}`} style={{ width: `${pct}%` }} />
                  </div>
                )}
              </div>
              <div className="text-right">
                {m.targetH ? (
                  <span className={`text-sm font-mono tabular-nums ${reached ? "text-ok font-semibold" : "text-[var(--color-request)]"}`}>
                    {reached ? "✓ " : ""}{formatHours(m.targetH, locale)}
                  </span>
                ) : <span className="text-sm text-foreground-faint">–</span>}
              </div>
              <span className="text-sm font-mono text-foreground-faint text-right tabular-nums">{formatMs(m.longestMs, locale)}</span>
            </div>
          );
        })}
      </div>
      {!showAll && remaining > 0 && (
        <div className="px-6 py-4 border-t border-border-subtle">
          <button
            onClick={() => setShowAll(true)}
            className="w-full text-sm text-[var(--color-request)] hover:opacity-80 font-medium transition"
          >
            {t("showMore", { count: remaining })}
          </button>
        </div>
      )}
    </section>
  );
}
