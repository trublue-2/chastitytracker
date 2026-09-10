"use client";

import ListPager from "@/app/components/ListPager";
import WeightRow from "@/app/components/WeightRow";
import usePagedList from "@/app/hooks/usePagedList";
import { LIST_PAGE_SIZE } from "@/lib/constants";
import type { UnitSystem } from "@/lib/weight";
import type { WeightRowData } from "@/lib/weightRows";

/**
 * Die Wiegungen als geblätterte Liste — jüngste zuerst, im Blätter-Muster der übrigen Listen.
 *
 * Eine eigene Komponente und nicht nur ein Block in der Statistik-Karte, weil der Seiten-Zustand
 * dann UNTER dem Diagramm liegt: ein Klick auf „Weiter" zeichnet zehn Zeilen neu statt zusätzlich
 * die Kurve mit ihren Hunderten von Punkten und Beschriftungen. Beim Zeitraum-Wechsel kommen die
 * Zeilen von oben — die Seite bleibt dabei stehen, und weil die Zeiträume ineinanderliegen, zeigt
 * sie danach dieselben Messungen; `usePagedList` klemmt, wenn der engere Zeitraum kürzer ist.
 */
export default function WeightRowList({
  rows, locale, tz, unitSystem,
}: {
  rows: WeightRowData[];
  locale: string;
  tz: string;
  unitSystem: UnitSystem;
}) {
  const { page, setPage, totalPages, visible } = usePagedList(rows, LIST_PAGE_SIZE);

  return (
    <>
      <div className="divide-y divide-border-subtle">
        {visible.map((row) => (
          <WeightRow key={row.id} row={row} locale={locale} tz={tz} unitSystem={unitSystem} />
        ))}
      </div>
      <ListPager page={page} totalPages={totalPages} onPage={setPage} />
    </>
  );
}
