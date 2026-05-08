"use client";

import { useState } from "react";
import { Lock, LockOpen, ClipboardList, Droplets, Camera, Play, Square } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { TYPE_COLORS, TYPE_STATS_KEYS } from "@/lib/constants";
import { FullscreenImageModal } from "@/app/components/ImageViewer";
import EntryDetailPanel from "@/app/components/EntryDetailPanel";
import CategoryIconRender from "@/app/components/CategoryIcon";
import { categoryStyle } from "@/lib/categoryConstants";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

function typeIcon(type: string, size: number): ReactNode {
  const icons: Record<string, ReactNode> = {
    VERSCHLUSS: <Lock size={size} />,
    OEFFNEN: <LockOpen size={size} />,
    PRUEFUNG: <ClipboardList size={size} />,
    ORGASMUS: <Droplets size={size} />,
    WEAR_BEGIN: <Play size={size} />,
    WEAR_END: <Square size={size} />,
  };
  return icons[type];
}

interface Entry {
  id: string;
  type: string;
  startTime: Date | string;
  note: string | null;
  orgasmusArt: string | null;
  kontrollCode: string | null;
  imageUrl?: string | null;
  imageExifTime?: Date | string | null;
  oeffnenGrund?: string | null;
  verifikationStatus?: string | null;
  /** Category info for WEAR_BEGIN/WEAR_END entries — derived via Entry.device.category. */
  category?: { name: string; color: string; icon: string } | null;
}

interface Props {
  entry: Entry;
  locale: string;
  /** Optional action slot (e.g. EntryActions menu) */
  actions?: ReactNode;
}

export default function EntryRow({ entry: e, locale, actions }: Props) {
  const [showDetail, setShowDetail] = useState(false);
  const tStats = useTranslations("stats");

  const startTime = e.startTime instanceof Date ? e.startTime : new Date(e.startTime);

  const isWear = e.type === "WEAR_BEGIN" || e.type === "WEAR_END";
  const wearLabel = isWear && e.category
    ? `${e.category.name} ${e.type === "WEAR_BEGIN" ? "▶" : "■"}`
    : tStats(TYPE_STATS_KEYS[e.type] ?? "lock");

  const typeTitle = (
    <span className="flex items-center gap-1.5">
      {typeIcon(e.type, 14)}
      {wearLabel}
    </span>
  );

  return (
    <>
      <div className="px-5 py-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setShowDetail(true)}
          className="flex items-center gap-3 flex-1 min-w-0 text-left hover:bg-surface-raised/60 -mx-2 px-2 -my-1 py-1 rounded-lg transition"
        >
          {isWear && e.category ? (
            <span
              className="flex items-center gap-1 text-xs font-semibold w-24 flex-shrink-0"
              style={{ color: categoryStyle(e.category.color).color }}
            >
              <CategoryIconRender name={e.category.icon} className="size-3" />
              <span className="truncate">{e.category.name}</span>
              <span className="ml-0.5">{e.type === "WEAR_BEGIN" ? "▶" : "■"}</span>
            </span>
          ) : (
            <span className={`flex items-center gap-1 text-xs font-semibold w-24 flex-shrink-0 ${TYPE_COLORS[e.type] ?? "text-foreground-muted"}`}>
              {typeIcon(e.type, 12)}
              {tStats(TYPE_STATS_KEYS[e.type] ?? "lock")}
            </span>
          )}
          <span className="text-sm text-foreground tabular-nums">
            {formatDateTime(startTime, locale)}
          </span>
          {e.imageUrl && (
            <Camera size={12} className="text-foreground-faint flex-shrink-0" />
          )}
          {e.orgasmusArt && (
            <span className="text-xs text-[var(--color-orgasm)] font-medium">{e.orgasmusArt}</span>
          )}
          {e.type === "VERSCHLUSS" && e.kontrollCode && (
            <span className="text-xs text-[var(--color-lock)] font-mono tabular-nums">#{e.kontrollCode}</span>
          )}
          {e.note && (
            <span className="text-xs text-foreground-faint italic truncate min-w-0">„{e.note}"</span>
          )}
        </button>
        {actions && <div className="flex-shrink-0">{actions}</div>}
      </div>

      {showDetail && (
        <FullscreenImageModal
          src={e.imageUrl ?? ""}
          alt={tStats(TYPE_STATS_KEYS[e.type] ?? "lock")}
          onClose={() => setShowDetail(false)}
          title={typeTitle}
          panel={
            <EntryDetailPanel
              startTime={startTime}
              locale={locale}
              imageExifTime={e.imageExifTime}
              oeffnenGrund={e.oeffnenGrund}
              orgasmusArt={e.orgasmusArt}
              kontrollCode={e.kontrollCode}
              verifikationStatus={e.verifikationStatus}
              note={e.note}
            />
          }
        />
      )}
    </>
  );
}
