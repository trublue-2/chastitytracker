"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Timer } from "lucide-react";
import CategoryIconRender from "@/app/components/CategoryIcon";
import { FullscreenImageModal } from "@/app/components/ImageViewer";
import { categoryStyle } from "@/lib/categoryConstants";

import type { WearSessionRow } from "@/lib/wearSessionRows";
export type { WearSessionRow } from "@/lib/wearSessionRows";

const PAGE_SIZE = 5;

/** Read-only list of completed non-KG wear sessions, grouped by category icon
 *  and sorted by start time (newest first). Active sessions live in
 *  ActiveWearSessions at the top of the dashboard — they're filtered out here. */
export default function WearSessionList({ sessions }: { sessions: WearSessionRow[] }) {
  const [page, setPage] = useState(0);
  // Ein Modal für die ganze Liste statt eines je Zeile — es kann ohnehin nur eines offen sein.
  const [openImage, setOpenImage] = useState<{ url: string; category: string } | null>(null);
  // Nicht ladbare Fotos (gelöschte Datei) fallen auf das Kategorie-Icon zurück, statt das kaputte
  // Bild-Symbol des Browsers zu zeigen — gleiche Absicherung wie in PairRow/SessionEventRow.
  const [brokenImages, setBrokenImages] = useState<ReadonlySet<string>>(new Set());
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");

  if (sessions.length === 0) return null;

  const totalPages = Math.ceil(sessions.length / PAGE_SIZE);
  const paginated = sessions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="bg-surface rounded-2xl border border-border overflow-hidden">
      <div className="px-5 py-3 border-b border-border-subtle">
        <p className="text-xs font-semibold uppercase tracking-wider text-foreground-faint">
          {t("otherCategorySessions")}
        </p>
      </div>

      <div className="divide-y divide-border-subtle">
        {paginated.map((s) => {
          const style = categoryStyle(s.categoryColor);
          const sameDay = s.startDateStr === s.endDateStr;
          return (
            <div key={s.id} className="flex items-center gap-3 px-5 py-3">
              {/* Beim Trage-Beginn aufgenommenes Foto — Klick öffnet es gross. Ohne Foto bleibt das
                  Kategorie-Icon stehen; die Kategorie ist über Name und Farbe ohnehin kenntlich.
                  Thumbnail wie in SessionEventRow (Wrapper mit shrink-0 + object-cover), NICHT über
                  `ImageViewer`: dessen Vollbild-Plakette ist für grössere Bilder gemacht und würde
                  ein 32px-Thumbnail zur Hälfte verdecken. */}
              {s.imageUrl && !brokenImages.has(s.id) ? (
                <button
                  type="button"
                  onClick={() => setOpenImage({ url: s.imageUrl!, category: s.categoryName })}
                  aria-label={t("wearSessionPhotoAlt", { category: s.categoryName })}
                  className="shrink-0 size-8 rounded-lg overflow-hidden hover:opacity-80 transition"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={s.imageUrl}
                    alt=""
                    loading="lazy"
                    className="w-full h-full object-cover"
                    onError={() => setBrokenImages((prev) => new Set(prev).add(s.id))}
                  />
                </button>
              ) : (
                <div
                  className="size-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: style.backgroundColor, color: style.color }}
                  aria-hidden
                >
                  <CategoryIconRender name={s.categoryIcon} className="size-4" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{s.categoryName}</p>
                <p className="text-xs text-foreground-faint tabular-nums truncate">
                  {sameDay
                    ? `${s.startDateStr}, ${s.startTimeStr} – ${s.endTimeStr}`
                    : `${s.startDateStr}, ${s.startTimeStr} – ${s.endDateStr}, ${s.endTimeStr}`}
                </p>
              </div>
              <span className="text-xs font-mono text-foreground-muted bg-surface-raised border border-border px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                <Timer size={10} />{s.durationStr}
              </span>
            </div>
          );
        })}
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

      {openImage && (
        <FullscreenImageModal
          src={openImage.url}
          alt={t("wearSessionPhotoAlt", { category: openImage.category })}
          onClose={() => setOpenImage(null)}
        />
      )}
    </div>
  );
}
