"use client";

import { useState } from "react";
import ImageViewer from "@/app/components/ImageViewer";
import EntryActions from "@/app/dashboard/EntryActions";

export interface KontrolleItemData {
  id: string;
  imageUrl: string | null;
  kommentar: string | null;
  pill1Label: string | null;
  pill1Cls: string | null;
  pill2Label: string | null;
  pill2Cls: string | null;
  code: string | null;
  dateTimeStr: string;
  dateTimePrefix: string | null;
  deadlineStr: string | null;
  deadlinePrefix: string;
  note: string | null;
  entryId: string | null;
  editHref: string | null;
}

const PAGE_SIZE = 10;

export default function KontrolleItemListClient({
  items,
  imageAlt,
}: {
  items: KontrolleItemData[];
  imageAlt: string;
}) {
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(items.length / PAGE_SIZE);
  const paginated = items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <>
      <div className="divide-y divide-gray-50">
        {paginated.map((k) => (
          <div key={k.id} className="px-4 py-3 flex items-start gap-3">
            {k.imageUrl && (
              <ImageViewer
                src={k.imageUrl}
                alt={imageAlt}
                width={40}
                height={40}
                className="w-10 h-10 rounded-xl object-cover flex-shrink-0"
                kommentar={k.kommentar}
              />
            )}
            <div className="flex-1 min-w-0 flex flex-col gap-1">
              <div className="flex items-center gap-2 flex-wrap">
                {k.pill1Label && (
                  <span className={`text-xs font-medium border rounded-lg px-2 py-0.5 flex-shrink-0 ${k.pill1Cls}`}>
                    {k.pill1Label}
                  </span>
                )}
                {k.pill2Label && (
                  <span className={`text-xs font-medium border rounded-lg px-2 py-0.5 flex-shrink-0 ${k.pill2Cls}`}>
                    {k.pill2Label}
                  </span>
                )}
                {k.code && <span className="font-mono font-bold text-orange-500 text-sm">{k.code}</span>}
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
                <span>{k.dateTimePrefix ? `${k.dateTimePrefix} ` : ""}{k.dateTimeStr}</span>
                {k.deadlineStr && <span>{k.deadlinePrefix} {k.deadlineStr}</span>}
              </div>
              {k.kommentar && <p className="text-xs text-amber-700 truncate">{k.kommentar}</p>}
              {k.note && <p className="text-xs text-gray-400 italic truncate">„{k.note}"</p>}
            </div>
            {k.entryId && k.editHref && (
              <EntryActions id={k.entryId} editHref={k.editHref} />
            )}
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
