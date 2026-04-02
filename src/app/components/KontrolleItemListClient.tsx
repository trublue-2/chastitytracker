"use client";

import { useState } from "react";
import { ImageOff, CheckCircle2 } from "lucide-react";
import { FullscreenImageModal } from "@/app/components/ImageViewer";

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
  timeCorrectedStr?: string | null;
}

const PAGE_SIZE = 10;

function KontrolleThumb({ k, imageAlt }: { k: KontrolleItemData; imageAlt: string }) {
  const [open, setOpen] = useState(false);
  const [imgError, setImgError] = useState(false);

  if (!k.imageUrl) return null;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex-shrink-0">
        {imgError ? (
          <div className="w-10 h-10 rounded-xl bg-surface-raised flex items-center justify-center">
            <ImageOff size={16} className="text-foreground-faint" />
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={k.imageUrl} alt={imageAlt} className="w-10 h-10 rounded-xl object-cover"
            onError={() => setImgError(true)} />
        )}
      </button>
      {open && (
        <FullscreenImageModal
          src={k.imageUrl}
          alt={imageAlt}
          onClose={() => setOpen(false)}
          title={
            <span className="flex items-center gap-1.5">
              <CheckCircle2 size={14} />
              {k.code && <span className="font-mono font-bold text-[var(--color-inspect)]">{k.code}</span>}
            </span>
          }
          panel={
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-xs text-foreground-faint uppercase tracking-wider font-semibold mb-0.5">Datum / Zeit</p>
                <p className="text-sm font-semibold text-foreground">{k.dateTimeStr}</p>
              </div>
              {(k.pill1Label || k.pill2Label) && (
                <div className="flex gap-2 flex-wrap">
                  {k.pill1Label && (
                    <span className={`text-xs font-medium border rounded-lg px-2 py-0.5 ${k.pill1Cls}`}>{k.pill1Label}</span>
                  )}
                  {k.pill2Label && (
                    <span className={`text-xs font-medium border rounded-lg px-2 py-0.5 ${k.pill2Cls}`}>{k.pill2Label}</span>
                  )}
                </div>
              )}
              {k.deadlineStr && (
                <div>
                  <p className="text-xs text-foreground-faint uppercase tracking-wider font-semibold mb-0.5">{k.deadlinePrefix}</p>
                  <p className="text-sm text-foreground-muted">{k.deadlineStr}</p>
                </div>
              )}
              {k.timeCorrectedStr && (
                <p className="text-xs text-[var(--color-warn)] font-medium">{k.timeCorrectedStr}</p>
              )}
              {k.kommentar && (
                <div>
                  <p className="text-xs text-foreground-faint uppercase tracking-wider font-semibold mb-0.5">Anweisung</p>
                  <p className="text-sm text-foreground-muted">{k.kommentar}</p>
                </div>
              )}
              {k.note && (
                <div>
                  <p className="text-xs text-foreground-faint uppercase tracking-wider font-semibold mb-0.5">Notiz</p>
                  <p className="text-sm text-foreground-muted italic">„{k.note}"</p>
                </div>
              )}
            </div>
          }
        />
      )}
    </>
  );
}

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
      <div className="divide-y divide-border-subtle">
        {paginated.map((k) => (
          <div key={k.id} className="px-4 py-3 flex items-start gap-3">
            <KontrolleThumb k={k} imageAlt={imageAlt} />
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
                {k.code && <span className="font-mono font-bold text-[var(--color-inspect)] text-sm">{k.code}</span>}
              </div>
              <div className="flex items-center gap-3 text-xs text-foreground-faint flex-wrap">
                <span>{k.dateTimePrefix ? `${k.dateTimePrefix} ` : ""}{k.dateTimeStr}</span>
                {k.deadlineStr && <span>{k.deadlinePrefix} {k.deadlineStr}</span>}
              </div>
              {k.timeCorrectedStr && <p className="text-xs text-[var(--color-warn)] font-medium">{k.timeCorrectedStr}</p>}
              {k.kommentar && <p className="text-xs text-[var(--color-warn-text)] truncate">{k.kommentar}</p>}
              {k.note && <p className="text-xs text-foreground-faint italic truncate">„{k.note}"</p>}
            </div>
          </div>
        ))}
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-border">
          <button type="button" onClick={() => setPage(p => p - 1)} disabled={page === 0}
            className="text-xs font-medium text-foreground-muted disabled:text-foreground-faint hover:text-foreground transition">
            ← Zurück
          </button>
          <span className="text-xs text-foreground-faint tabular-nums">{page + 1} / {totalPages}</span>
          <button type="button" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}
            className="text-xs font-medium text-foreground-muted disabled:text-foreground-faint hover:text-foreground transition">
            Weiter →
          </button>
        </div>
      )}
    </>
  );
}
