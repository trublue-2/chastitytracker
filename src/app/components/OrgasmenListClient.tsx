"use client";

import { useState } from "react";

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
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(items.length / PAGE_SIZE);
  const paginated = items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <>
      <div className="divide-y divide-gray-50">
        {paginated.map((e) => (
          <div key={e.id} className="px-5 py-3 flex items-start gap-3 hover:bg-gray-50/60 transition">
            <div className="flex-1 min-w-0">
              <span className="text-sm font-semibold text-gray-900 tabular-nums">{e.dateStr}</span>
              {" "}<span className="text-xs text-gray-400 tabular-nums">{e.timeStr}</span>
              <p className="text-xs text-rose-500 font-medium mt-0.5">{e.orgasmusArt}</p>
              {e.note && <p className="text-xs text-gray-400 italic mt-0.5">„{e.note}"</p>}
            </div>
          </div>
        ))}
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
          <button type="button" onClick={() => setPage(p => p - 1)} disabled={page === 0}
            className="text-xs font-medium text-gray-500 disabled:text-gray-300 hover:text-gray-800 transition">
            ← Zurück
          </button>
          <span className="text-xs text-gray-400 tabular-nums">{page + 1} / {totalPages}</span>
          <button type="button" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}
            className="text-xs font-medium text-gray-500 disabled:text-gray-300 hover:text-gray-800 transition">
            Weiter →
          </button>
        </div>
      )}
    </>
  );
}
