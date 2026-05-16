"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

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

const PAGE_SIZE = 10;

/** Paginated list of unified Kontrollen (anforderung + standalone Prüfungen).
 *  Pre-formatted strings come from the server to avoid date-formatting churn here. */
export default function StatsKontrollenList({ rows }: { rows: StatsKontrolleRow[] }) {
  const [page, setPage] = useState(0);
  const tCommon = useTranslations("common");

  if (rows.length === 0) return null;

  const totalPages = Math.ceil(rows.length / PAGE_SIZE);
  const paginated = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <>
      <div className="divide-y divide-border-subtle">
        {paginated.map((k) => (
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

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-border-subtle">
          <button
            type="button"
            onClick={() => setPage((p) => p - 1)}
            disabled={page === 0}
            className="text-xs font-medium text-foreground-muted disabled:text-foreground-faint hover:text-foreground transition"
          >
            ← {tCommon("previous")}
          </button>
          <span className="text-xs text-foreground-faint tabular-nums">
            {page + 1} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= totalPages - 1}
            className="text-xs font-medium text-foreground-muted disabled:text-foreground-faint hover:text-foreground transition"
          >
            {tCommon("next")} →
          </button>
        </div>
      )}
    </>
  );
}
