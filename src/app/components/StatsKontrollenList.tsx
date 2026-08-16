"use client";

import ListPager from "@/app/components/ListPager";
import usePagedList from "@/app/hooks/usePagedList";
import { LIST_PAGE_SIZE } from "@/lib/constants";

export interface StatsKontrolleRow {
  id: string;
  code: string | null;
  pillLabel: string | null;
  pillCls: string | null;
  /** Pre-formatted primary time line, e.g. "Erfüllt: 12.05., 17:23" or "Erstellt: 12.05.2026, 17:23". */
  primaryLine: string;
  /** Pre-formatted deadline line, or null if not applicable. */
  deadlineLine: string | null;
}


/** Paginated list of unified Kontrollen (anforderung + standalone Prüfungen).
 *  Pre-formatted strings come from the server to avoid date-formatting churn here. */
export default function StatsKontrollenList({ rows }: { rows: StatsKontrolleRow[] }) {
  const { page, setPage, totalPages, visible } = usePagedList(rows, LIST_PAGE_SIZE);

  if (rows.length === 0) return null;

  return (
    <>
      <div className="divide-y divide-border-subtle">
        {visible.map((k) => (
          <div key={k.id} className="px-4 py-3 flex flex-col gap-1">
            <div className="flex items-center gap-2 flex-wrap">
              {k.pillLabel && k.pillCls && (
                <span className={`text-xs font-medium border rounded-lg px-2 py-0.5 flex-shrink-0 ${k.pillCls}`}>{k.pillLabel}</span>
              )}
              {k.code && <span className="font-mono font-bold text-[var(--color-inspect)] text-sm">{k.code}</span>}
            </div>
            <div className="flex items-center gap-3 text-xs text-foreground-faint flex-wrap">
              <span>{k.primaryLine}</span>
              {k.deadlineLine && <span>{k.deadlineLine}</span>}
            </div>
          </div>
        ))}
      </div>

      <ListPager page={page} totalPages={totalPages} onPage={setPage} />
    </>
  );
}
