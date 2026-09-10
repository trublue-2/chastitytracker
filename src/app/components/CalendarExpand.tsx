"use client";

import CalendarContainer from "./CalendarContainer";
import ShowMore, { useShowMore } from "@/app/components/ShowMore";
import type { CalendarMonthData } from "@/lib/statsTypes";

/** Wie viele Monate ohne Aufklappen zu sehen sind. */
const INITIAL_COUNT = 2;

export default function CalendarExpand({ months }: { months: CalendarMonthData[] }) {
  const { visible, hidden, showAll, toggle } = useShowMore(months, INITIAL_COUNT);

  return (
    <>
      <CalendarContainer months={visible} />
      {hidden > 0 && (
        <div className="pt-2">
          <ShowMore hidden={hidden} showAll={showAll} onToggle={toggle} />
        </div>
      )}
    </>
  );
}
