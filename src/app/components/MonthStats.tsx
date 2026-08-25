"use client";

import { useState } from "react";
import { formatDurationMs, formatTotalHours } from "@/lib/utils";
import { goalPct } from "@/lib/percent";
import { useTranslations, useLocale } from "next-intl";
import BlockHeading from "@/app/components/BlockHeading";
import Section from "@/app/components/Section";
import { blockInsetCls } from "@/app/components/inputStyles";

import type { MonthStat } from "@/lib/statsTypes";

const INITIAL_COUNT = 2;

export default function MonthStats({ months }: { months: MonthStat[] }) {
  const t = useTranslations("stats");
  const locale = useLocale();
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? months : months.slice(0, INITIAL_COUNT);
  const remaining = months.length - INITIAL_COUNT;

  return (
    <Section title={t("monthlyOverview")}>

      {/* Kein Kasten, keine getönte Kopfzeile: eine Tabelle braucht Spalten, keinen Rahmen. Die
          Spaltenköpfe sind leise Versalien wie überall, und die Vorgabe-Spalte ist NEUTRAL —
          Koralle heisst „das will jetzt etwas von dir", und eine Monatsvorgabe von vor drei
          Monaten will gar nichts mehr. Was sie sagt, sagt das Häkchen. */}
      {/* Spaltenköpfe über `BlockHeading as="span"`: dieselbe Stufe wie jede andere Rubrik, aber
          ohne Überschriften-Rang — eine Spalte benennt keinen Abschnitt. */}
      <div className={`grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 ${blockInsetCls} pb-2 border-b border-border-subtle`}>
        <BlockHeading as="span">{t("monthCol")}</BlockHeading>
        <BlockHeading as="span" className="text-right">{t("countCol")}</BlockHeading>
        <BlockHeading as="span" className="text-right">{t("wearTimeCol")}</BlockHeading>
        <BlockHeading as="span" className="text-right">{t("goalCol")}</BlockHeading>
        <BlockHeading as="span" className="text-right">{t("longestCol")}</BlockHeading>
      </div>
      <div className="divide-y divide-border-subtle">
        {visible.map((m) => {
          const pct = goalPct(m.wearHours, m.targetH);
          const reached = pct !== null && pct >= 100;
          return (
            <div key={m.key} className={`grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 ${blockInsetCls} py-2.5 items-center`}>
              <span className="text-fliess text-foreground capitalize">{m.label}</span>
              <span className="text-fliess font-semibold text-foreground text-right tabular-nums">{m.count}</span>
              <div className="text-right">
                <span className="text-fliess text-foreground-muted tabular-nums">{formatTotalHours(m.wearHours)}</span>
                {pct !== null && (
                  <div className="mt-1 h-1 w-16 bg-border-subtle rounded-full overflow-hidden ml-auto">
                    <div className={`h-full rounded-full ${reached ? "bg-ok" : "bg-border-strong"}`} style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                )}
              </div>
              <div className="text-right">
                {m.targetH ? (
                  <span className={`text-fliess tabular-nums ${reached ? "text-ok font-semibold" : "text-foreground-muted"}`}>
                    {reached ? "✓ " : ""}{formatTotalHours(m.targetH)}
                  </span>
                ) : <span className="text-fliess text-foreground-faint">–</span>}
              </div>
              <span className="text-fliess text-foreground-faint text-right tabular-nums">{formatDurationMs(m.longestMs, locale)}</span>
            </div>
          );
        })}
      </div>
      {!showAll && remaining > 0 && (
        <button
          onClick={() => setShowAll(true)}
          className={`self-start ${blockInsetCls} py-1 text-fliess text-foreground-muted hover:text-foreground font-medium transition`}
        >
          {t("showMore", { count: remaining })}
        </button>
      )}
    </Section>
  );
}
