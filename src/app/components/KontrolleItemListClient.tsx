"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2 } from "lucide-react";
import { FullscreenImageModal } from "@/app/components/ImageViewer";
import DetailField from "@/app/components/DetailField";
import PhotoChoice, { usePhotoChoice } from "@/app/components/PhotoChoice";
import PhotoThumb from "@/app/components/PhotoThumb";
import Badge from "@/app/components/Badge";
import { blockInsetCls } from "@/app/components/inputStyles";
import ListPager from "@/app/components/ListPager";
import usePagedList from "@/app/hooks/usePagedList";
import { LIST_PAGE_SIZE } from "@/lib/constants";

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
  /** Foto durchs Sichtfenster der Box — im Vollbild neben dem Kontroll-Foto wählbar. */
  boxImageUrl?: string | null;
}


function KontrolleThumb({ k, imageAlt }: { k: KontrolleItemData; imageAlt: string }) {
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const photo = usePhotoChoice(k.imageUrl, k.boxImageUrl);

  // Auch ohne Haupt-Foto öffnen, sobald ein Box-Foto da ist: sonst wäre der Schlüssel-Nachweis
  // einer Kontrolle, deren Foto nachträglich entfernt wurde, gar nicht mehr erreichbar.
  const thumbUrl = k.imageUrl ?? k.boxImageUrl;
  if (!thumbUrl) return null;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex-shrink-0">
        <PhotoThumb url={thumbUrl} alt={imageAlt} />
      </button>
      {open && (
        <FullscreenImageModal
          src={photo.src}
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
              <PhotoChoice photo={photo} />
              <DetailField label={tc("dateTime")}>
                <p className="text-sm font-semibold text-foreground">{k.dateTimeStr}</p>
              </DetailField>
              {(k.pill1Label || k.pill2Label) && (
                <div className="flex gap-2 flex-wrap">
                  {k.pill1Label && (
                    <Badge size="sm" tone={k.pill1Cls ?? undefined} label={k.pill1Label} />
                  )}
                  {k.pill2Label && (
                    <Badge size="sm" tone={k.pill2Cls ?? undefined} label={k.pill2Label} />
                  )}
                </div>
              )}
              {k.deadlineStr && (
                <DetailField label={k.deadlinePrefix}>
                  <p className="text-sm text-foreground-muted">{k.deadlineStr}</p>
                </DetailField>
              )}
              {k.timeCorrectedStr && (
                <p className="text-xs text-[var(--color-warn)] font-medium">{k.timeCorrectedStr}</p>
              )}
              {k.kommentar && (
                <DetailField label={tc("instruction")}>
                  <p className="text-sm text-foreground-muted">{k.kommentar}</p>
                </DetailField>
              )}
              {k.note && (
                <DetailField label={tc("note")}>
                  <p className="text-sm text-foreground-muted italic">„{k.note}"</p>
                </DetailField>
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
  const { page, setPage, totalPages, visible } = usePagedList(items, LIST_PAGE_SIZE);

  return (
    <>
      <div className="divide-y divide-border-subtle">
        {visible.map((k) => (
          <div key={k.id} className={`${blockInsetCls} py-3 flex items-start gap-3`}>
            <KontrolleThumb k={k} imageAlt={imageAlt} />
            <div className="flex-1 min-w-0 flex flex-col gap-1">
              <div className="flex items-center gap-2 flex-wrap">
                {k.pill1Label && (
                  <Badge size="sm" tone={k.pill1Cls ?? undefined} label={k.pill1Label} className="flex-shrink-0" />
                )}
                {k.pill2Label && (
                  <Badge size="sm" tone={k.pill2Cls ?? undefined} label={k.pill2Label} className="flex-shrink-0" />
                )}
                {k.code && <span className="font-mono font-semibold text-foreground text-fliess">{k.code}</span>}
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
      <ListPager page={page} totalPages={totalPages} onPage={setPage} />
    </>
  );
}
