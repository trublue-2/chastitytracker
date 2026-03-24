"use client";

import { useState } from "react";
import ImageViewer from "@/app/components/ImageViewer";
import KontrolleActions from "./KontrolleActions";

export interface AdminKontrolleRowData {
  imageUrl: string | null;
  kommentar: string | null;
  pillLabel: string | null;
  pillCls: string | null;
  username?: string | null;
  code: string | null;
  fulfilledAtStr: string | null;
  deadlineStr: string | null;
  createdAtStr: string | null;
  withdrawnAtStr: string | null;
  timeCorrectedStr: string | null;
  note: string | null;
  kontrolleId: string | null;
  entryId: string | null;
  anforderungStatus: string;
  verifikationStatus: string | null;
}

interface Labels {
  fulfilledLabel: string;
  fristLabel: string;
  createdLabel: string;
  withdrawnLabel: string;
  instructionLabel: string;
  imageAlt: string;
}

const PAGE_SIZE = 10;

export default function AdminKontrolleListClient({ items, labels }: { items: AdminKontrolleRowData[]; labels: Labels }) {
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(items.length / PAGE_SIZE);
  const paginated = items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <>
      <div className="divide-y divide-gray-50">
        {paginated.map((row, i) => (
          <div key={i} className="px-4 py-3 flex items-start gap-3">
            {row.imageUrl && (
              <ImageViewer src={row.imageUrl} alt={labels.imageAlt} width={40} height={40}
                className="w-10 h-10 rounded-xl object-cover flex-shrink-0" kommentar={row.kommentar} />
            )}
            <div className="flex-1 min-w-0 flex flex-col gap-1">
              <div className="flex items-center gap-2 flex-wrap">
                {row.username && <span className="font-semibold text-gray-900 text-sm">{row.username}</span>}
                {row.pillLabel && <span className={`text-xs font-medium border rounded-lg px-2 py-0.5 ${row.pillCls}`}>{row.pillLabel}</span>}
                {row.code && <span className="font-mono font-bold text-orange-500 text-sm">{row.code}</span>}
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
                {row.fulfilledAtStr && <span>{labels.fulfilledLabel}: {row.fulfilledAtStr}</span>}
                {row.deadlineStr && <span>{labels.fristLabel}: {row.deadlineStr}</span>}
                {row.createdAtStr && <span>{labels.createdLabel}: {row.createdAtStr}</span>}
                {row.withdrawnAtStr && <span>{labels.withdrawnLabel}: {row.withdrawnAtStr}</span>}
              </div>
              {row.timeCorrectedStr && (
                <p className="text-xs text-amber-500 font-medium mt-0.5">{row.timeCorrectedStr}</p>
              )}
              {row.kommentar && (
                <p className="text-xs text-gray-400 italic mt-0.5">{labels.instructionLabel}: {row.kommentar}</p>
              )}
              {row.note && (
                <p className="text-xs text-gray-500 italic mt-0.5">„{row.note}"</p>
              )}
            </div>
            {(row.kontrolleId || row.entryId) && (
              <KontrolleActions
                kontrolleId={row.kontrolleId}
                entryId={row.entryId}
                anforderungStatus={row.anforderungStatus}
                verifikationStatus={row.verifikationStatus}
              />
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
