"use client";

import { useState } from "react";
import CalendarContainer, { type CalendarMonthData } from "./CalendarContainer";
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
        <div className="px-6 py-4 border-t border-border-subtle">
          <button
            onClick={() => setShowAll(true)}
            className="w-full text-sm text-[var(--color-request)] hover:text-[var(--color-request-text)] font-medium transition"
          >
            {t("showMore", { count: remaining })}
          </button>
        </div>
      )}
    </>
  );
}
