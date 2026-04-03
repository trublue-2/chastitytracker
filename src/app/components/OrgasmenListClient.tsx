"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

export interface OrgasmusItemData {
  id: string;
  dateStr: string;
  timeStr: string;
  orgasmusArt: string | null;
  note: string | null;
  editHref: string;
}

const PAGE_SIZE = 10;

export default function OrgasmenListClient({ items }: { items: OrgasmusItemData[] }) {
  const tc = useTranslations("common");
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(items.length / PAGE_SIZE);
  const paginated = items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <>
      <div className="divide-y divide-border-subtle">
        {paginated.map((e) => (
          <div key={e.id} className="px-5 py-3 flex items-start gap-3 hover:bg-surface-raised/60 transition">
            <div className="flex-1 min-w-0">
              <span className="text-sm font-semibold text-foreground tabular-nums">{e.dateStr}</span>
              {" "}<span className="text-xs text-foreground-faint tabular-nums">{e.timeStr}</span>
              <p className="text-xs text-[var(--color-orgasm)] font-medium mt-0.5">{e.orgasmusArt}</p>
              {e.note && <p className="text-xs text-foreground-faint italic mt-0.5">„{e.note}"</p>}
            </div>
          </div>
        ))}
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-border">
          <button type="button" onClick={() => setPage(p => p - 1)} disabled={page === 0}
            className="text-xs font-medium text-foreground-muted disabled:text-foreground-faint hover:text-foreground transition">
            ← {tc("previous")}
          </button>
          <span className="text-xs text-foreground-faint tabular-nums">{page + 1} / {totalPages}</span>
          <button type="button" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}
            className="text-xs font-medium text-foreground-muted disabled:text-foreground-faint hover:text-foreground transition">
            {tc("next")} →
          </button>
        </div>
      )}
    </>
  );
}
