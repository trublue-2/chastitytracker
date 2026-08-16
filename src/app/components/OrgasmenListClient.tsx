"use client";

import ListPager from "@/app/components/ListPager";
import usePagedList from "@/app/hooks/usePagedList";
import { LIST_PAGE_SIZE } from "@/lib/constants";

export interface OrgasmusItemData {
  id: string;
  dateStr: string;
  timeStr: string;
  orgasmusArt: string | null;
  note: string | null;
  editHref: string;
}


export default function OrgasmenListClient({ items }: { items: OrgasmusItemData[] }) {
  const { page, setPage, totalPages, visible } = usePagedList(items, LIST_PAGE_SIZE);

  return (
    <>
      <div className="divide-y divide-border-subtle">
        {visible.map((e) => (
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
      <ListPager page={page} totalPages={totalPages} onPage={setPage} />
    </>
  );
}
