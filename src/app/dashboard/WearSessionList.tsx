"use client";

import Section from "@/app/components/Section";
import { blockInsetCls } from "@/app/components/inputStyles";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Timer } from "lucide-react";
import CategoryIconRender from "@/app/components/CategoryIcon";
import CategoryPhotoThumb from "@/app/components/CategoryPhotoThumb";
import { FullscreenImageModal } from "@/app/components/ImageViewer";
import DetailField from "@/app/components/DetailField";
import ListPager from "@/app/components/ListPager";
import usePagedList from "@/app/hooks/usePagedList";
import { BLOCK_PAGE_SIZE } from "@/lib/constants";
import { categoryStyle } from "@/lib/categoryConstants";

import type { WearSessionRow } from "@/lib/wearSessionRows";
export type { WearSessionRow } from "@/lib/wearSessionRows";


/** Read-only list of completed non-KG wear sessions, grouped by category icon
 *  and sorted by start time (newest first). Active sessions live in
 *  ActiveWearSessions at the top of the dashboard — they're filtered out here. */
export default function WearSessionList({ sessions, defaultCollapsed }: { sessions: WearSessionRow[]; defaultCollapsed?: boolean }) {
  const { page, setPage, totalPages, visible } = usePagedList(sessions, BLOCK_PAGE_SIZE);
  // Ein Modal für die ganze Liste statt eines je Zeile — es kann ohnehin nur eines offen sein.
  // Die ganze Zeile im State, weil das Detail-Panel Kategorie, Zeit und Gerät daraus zieht.
  const [openRow, setOpenRow] = useState<WearSessionRow | null>(null);
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");

  if (sessions.length === 0) return null;

  return (
    <Section title={t("otherCategorySessions")} defaultCollapsed={defaultCollapsed}>
      <div className="divide-y divide-border-subtle">
        {visible.map((s) => {
          const sameDay = s.startDateStr === s.endDateStr;
          return (
            <div key={s.id} className={`flex items-center gap-3 ${blockInsetCls} py-3`}>
              {/* Beim Trage-Beginn aufgenommenes Foto — Klick öffnet es gross. Ohne Foto bleibt das
                  Kategorie-Symbol stehen; die Kategorie ist über Name und Farbe ohnehin kenntlich. */}
              <CategoryPhotoThumb
                imageUrl={s.imageUrl}
                categoryColor={s.categoryColor}
                categoryIcon={s.categoryIcon}
                size="sm"
                onClick={() => setOpenRow(s)}
                label={t("wearSessionPhotoAlt", { category: s.categoryName })}
              />
              <div className="flex-1 min-w-0">
                {/* Gerätename neben der Kategorie — wie in der Karte der laufenden Session. Ohne ihn
                    sehen mehrere Sessions derselben Kategorie identisch aus, und gerade dort ist die
                    Frage „welches Gerät war das?" die interessante. */}
                <p className="text-sm font-semibold text-foreground truncate">
                  {s.categoryName}
                  {s.deviceName && (
                    <span className="font-normal text-foreground-muted"> · {s.deviceName}</span>
                  )}
                </p>
                <p className="text-xs text-foreground-faint tabular-nums truncate">
                  {sameDay
                    ? `${s.startDateStr}, ${s.startTimeStr} – ${s.endTimeStr}`
                    : `${s.startDateStr}, ${s.startTimeStr} – ${s.endDateStr}, ${s.endTimeStr}`}
                </p>
              </div>
              <span className="text-neben text-foreground-muted tabular-nums flex items-center gap-1 shrink-0">
                <Timer size={10} />{s.durationStr}
              </span>
            </div>
          );
        })}
      </div>

      <ListPager page={page} totalPages={totalPages} onPage={setPage} />

      {openRow?.imageUrl && (
        <FullscreenImageModal
          src={openRow.imageUrl}
          alt={t("wearSessionPhotoAlt", { category: openRow.categoryName })}
          onClose={() => setOpenRow(null)}
          // Kopf + Panel analog zum KG-Foto (SessionEventRow): dort steht die Typ-Pille über
          // Datum/Zeit und Gerät. Hier tritt die Kategorie an die Stelle des Eintragstyps.
          title={
            <span
              className="inline-flex items-center gap-1.5 text-fliess font-semibold text-foreground"
            >
              <CategoryIconRender name={openRow.categoryIcon} className="size-3.5" style={{ color: categoryStyle(openRow.categoryColor).color }} />
              {openRow.categoryName}
            </span>
          }
          panel={
            <div className="flex flex-col gap-3">
              <DetailField label={tCommon("dateTime")}>
                <p className="text-sm font-semibold text-foreground">{openRow.startDateStr}, {openRow.startTimeStr}</p>
              </DetailField>
              {openRow.deviceName && (
                <DetailField label={tCommon("device")}>
                  <p className="text-sm text-foreground-muted">{openRow.deviceName}</p>
                </DetailField>
              )}
              <DetailField label={tCommon("duration")}>
                <p className="text-sm text-foreground-muted">{openRow.durationStr}</p>
              </DetailField>
            </div>
          }
        />
      )}
    </Section>
  );
}
