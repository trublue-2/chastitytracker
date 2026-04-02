"use client";

import { useState } from "react";
import { ImageOff, CheckCircle2 } from "lucide-react";
import { FullscreenImageModal } from "@/app/components/ImageViewer";
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

function AdminKontrolleThumb({ row, labels }: { row: AdminKontrolleRowData; labels: Labels }) {
  const [open, setOpen] = useState(false);
  const [imgError, setImgError] = useState(false);

  if (!row.imageUrl) return null;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex-shrink-0">
        {imgError ? (
          <div className="w-10 h-10 rounded-xl bg-surface-raised flex items-center justify-center">
            <ImageOff size={16} className="text-foreground-faint" />
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={row.imageUrl} alt={labels.imageAlt} className="w-10 h-10 rounded-xl object-cover"
            onError={() => setImgError(true)} />
        )}
      </button>
      {open && (
        <FullscreenImageModal
          src={row.imageUrl}
          alt={labels.imageAlt}
          onClose={() => setOpen(false)}
          title={
            <span className="flex items-center gap-1.5">
              <CheckCircle2 size={14} />
              {row.username && <span className="font-semibold">{row.username}</span>}
              {row.code && <span className="font-mono font-bold text-[var(--color-inspect)]">{row.code}</span>}
            </span>
          }
          panel={
            <div className="flex flex-col gap-3">
              {row.pillLabel && (
                <span className={`text-xs font-medium border rounded-lg px-2 py-0.5 self-start ${row.pillCls}`}>{row.pillLabel}</span>
              )}
              {row.fulfilledAtStr && (
                <div>
                  <p className="text-xs text-foreground-faint uppercase tracking-wider font-semibold mb-0.5">{labels.fulfilledLabel}</p>
                  <p className="text-sm text-foreground-muted">{row.fulfilledAtStr}</p>
                </div>
              )}
              {row.deadlineStr && (
                <div>
                  <p className="text-xs text-foreground-faint uppercase tracking-wider font-semibold mb-0.5">{labels.fristLabel}</p>
                  <p className="text-sm text-foreground-muted">{row.deadlineStr}</p>
                </div>
              )}
              {row.createdAtStr && (
                <div>
                  <p className="text-xs text-foreground-faint uppercase tracking-wider font-semibold mb-0.5">{labels.createdLabel}</p>
                  <p className="text-sm text-foreground-muted">{row.createdAtStr}</p>
                </div>
              )}
              {row.timeCorrectedStr && (
                <p className="text-xs text-warn font-medium">{row.timeCorrectedStr}</p>
              )}
              {row.kommentar && (
                <div>
                  <p className="text-xs text-foreground-faint uppercase tracking-wider font-semibold mb-0.5">{labels.instructionLabel}</p>
                  <p className="text-sm text-foreground-muted">{row.kommentar}</p>
                </div>
              )}
              {row.note && (
                <div>
                  <p className="text-xs text-foreground-faint uppercase tracking-wider font-semibold mb-0.5">Notiz</p>
                  <p className="text-sm text-foreground-muted italic">„{row.note}"</p>
                </div>
              )}
            </div>
          }
        />
      )}
    </>
  );
}

export default function AdminKontrolleListClient({ items, labels }: { items: AdminKontrolleRowData[]; labels: Labels }) {
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(items.length / PAGE_SIZE);
  const paginated = items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <>
      <div className="divide-y divide-border-subtle">
        {paginated.map((row, i) => (
          <div key={i} className="px-4 py-3 flex items-start gap-3">
            <AdminKontrolleThumb row={row} labels={labels} />
            <div className="flex-1 min-w-0 flex flex-col gap-1">
              <div className="flex items-center gap-2 flex-wrap">
                {row.username && <span className="font-semibold text-foreground text-sm">{row.username}</span>}
                {row.pillLabel && <span className={`text-xs font-medium border rounded-lg px-2 py-0.5 ${row.pillCls}`}>{row.pillLabel}</span>}
                {row.code && <span className="font-mono font-bold text-[var(--color-inspect)] text-sm">{row.code}</span>}
              </div>
              <div className="flex items-center gap-3 text-xs text-foreground-faint flex-wrap">
                {row.fulfilledAtStr && <span>{labels.fulfilledLabel}: {row.fulfilledAtStr}</span>}
                {row.deadlineStr && <span>{labels.fristLabel}: {row.deadlineStr}</span>}
                {row.createdAtStr && <span>{labels.createdLabel}: {row.createdAtStr}</span>}
                {row.withdrawnAtStr && <span>{labels.withdrawnLabel}: {row.withdrawnAtStr}</span>}
              </div>
              {row.timeCorrectedStr && (
                <p className="text-xs text-warn font-medium mt-0.5">{row.timeCorrectedStr}</p>
              )}
              {row.kommentar && (
                <p className="text-xs text-foreground-faint italic mt-0.5">{labels.instructionLabel}: {row.kommentar}</p>
              )}
              {row.note && (
                <p className="text-xs text-foreground-muted italic mt-0.5">„{row.note}"</p>
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
        <div className="flex items-center justify-between px-5 py-3 border-t border-border-subtle">
          <button type="button" onClick={() => setPage(p => p - 1)} disabled={page === 0}
            className="text-xs font-medium text-foreground-muted disabled:opacity-40 hover:text-foreground transition">
            ← Zurück
          </button>
          <span className="text-xs text-foreground-faint tabular-nums">{page + 1} / {totalPages}</span>
          <button type="button" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}
            className="text-xs font-medium text-foreground-muted disabled:opacity-40 hover:text-foreground transition">
            Weiter →
          </button>
        </div>
      )}
    </>
  );
}
