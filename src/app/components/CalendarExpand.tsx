"use client";

import { useState } from "react";
import CalendarContainer from "./CalendarContainer";
import type { CalendarMonthData } from "@/lib/statsTypes";
import { useTranslations } from "next-intl";

export default function CalendarExpand({ months }: { months: CalendarMonthData[] }) {
  const t = useTranslations("stats");
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? months : months.slice(0, 2);
  const remaining = months.length - 2;

  return (
    <>
      <CalendarContainer months={visible} />
      {!showAll && remaining > 0 && (
        <div className="pt-2">
          <button
            onClick={() => setShowAll(true)}
            /* Leise, nicht in einer Bedeutungsfarbe — und dieselbe Fassung wie der Zwilling in
               `MonthStats`. „Zwei weitere Monate anzeigen" fordert nichts und meldet nichts, es
               klappt auf; in `--color-request` (Orange) stand es zwischen lauter erledigten
               Monaten wie eine offene Anforderung. */
            className="w-full text-sm text-foreground-muted hover:text-foreground font-medium transition"
          >
            {t("showMore", { count: remaining })}
          </button>
        </div>
      )}
    </>
  );
}
