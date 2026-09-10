"use client";

import { useState } from "react";
import CalendarContainer from "./CalendarContainer";
import ExpandToggle from "@/app/components/ExpandToggle";
import type { CalendarMonthData } from "@/lib/statsTypes";
import { useTranslations } from "next-intl";

/** Wie viele Monate ohne Aufklappen zu sehen sind. */
const INITIAL_COUNT = 2;

export default function CalendarExpand({ months }: { months: CalendarMonthData[] }) {
  const t = useTranslations("stats");
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? months : months.slice(0, INITIAL_COUNT);
  const hidden = months.length - INITIAL_COUNT;

  return (
    <>
      <CalendarContainer months={visible} />
      {/* Die Zeile bleibt stehen, sobald es überhaupt etwas zu klappen gibt: an `!showAll` gehängt
          verschwand mit dem Aufklappen der einzige Weg zurück. Leise und ohne Bedeutungsfarbe —
          „zwei weitere Monate" fordert nichts; in `--color-request` (Orange) stand die Zeile
          zwischen lauter erledigten Monaten wie eine offene Anforderung. */}
      {hidden > 0 && (
        <div className="pt-2">
          <ExpandToggle
            label={showAll ? t("showLess") : t("showMore", { count: hidden })}
            open={showAll}
            onToggle={() => setShowAll((v) => !v)}
          />
        </div>
      )}
    </>
  );
}
