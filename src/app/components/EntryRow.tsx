"use client";

import { useState } from "react";
import { Lock, LockOpen, ClipboardList, Droplets, Camera, Play, Square } from "lucide-react";
import { formatDateTime, formatTime, APP_TZ } from "@/lib/utils";
import { TYPE_STATS_KEYS } from "@/lib/constants";
import { FullscreenImageModal } from "@/app/components/ImageViewer";
import EntryDetailPanel from "@/app/components/EntryDetailPanel";
import CategoryIconRender from "@/app/components/CategoryIcon";
import { categoryStyle } from "@/lib/categoryConstants";
import { listRowCls, listRowButtonCls, listRowTimeCls } from "@/app/components/inputStyles";
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
  /** Governing timezone of the data owner (sub). Defaults to APP_TZ (Europe/Zurich). */
  tz?: string;
  /** Pre-resolved display labels via the data-owner's reason config (from a server parent). When
   *  omitted, the raw stored value (orgasmusArt) / built-in i18n (oeffnenGrund) is shown. */
  orgasmusLabel?: string | null;
  openingLabel?: string | null;
  /** Optional action slot (e.g. EntryActions menu) */
  actions?: ReactNode;
  /** Nur die Uhrzeit statt Datum und Uhrzeit — für Listen, die ihre Tage schon überschreiben
   *  (`DayGroups`). Ohne Tageskopf drumherum wäre eine reine Uhrzeit nicht datierbar, deshalb
   *  bleibt das volle Datum der Standard. */
  timeOnly?: boolean;
}

export default function EntryRow({ entry: e, locale, tz = APP_TZ, orgasmusLabel, openingLabel, actions, timeOnly }: Props) {
  const [showDetail, setShowDetail] = useState(false);
  const tStats = useTranslations("stats");

  const startTime = e.startTime instanceof Date ? e.startTime : new Date(e.startTime);

  const isWear = e.type === "WEAR_BEGIN" || e.type === "WEAR_END";
  const wearActionLabel = isWear ? tStats(e.type === "WEAR_BEGIN" ? "wearBeginShort" : "wearEndShort") : "";
  const wearLabel = isWear && e.category
    ? `${e.category.name} · ${wearActionLabel}`
    : tStats(TYPE_STATS_KEYS[e.type] ?? "lock");

  const typeTitle = (
    <span className="flex items-center gap-1.5">
      {typeIcon(e.type, 14)}
      {wearLabel}
    </span>
  );

  return (
    <>
      <div className={listRowCls}>
        <button
          type="button"
          onClick={() => setShowDetail(true)}
          className={listRowButtonCls}
        >
          {/* Die Zeit führt die Zeile an, nicht die Art. In einer nach Tagen gruppierten Liste ist
              sie die einzige Spalte, die jede Zeile hat und die geordnet ist — an ihr entlang liest
              man. Feste Breite, damit die Arten darunter auf einer Kante stehen. */}
          <span className={listRowTimeCls}>
            {timeOnly ? formatTime(startTime, locale, tz) : formatDateTime(startTime, locale, tz)}
          </span>

          {/* Die Art ist neutral. Farbe heisst in diesem System „das will jetzt etwas von dir" —
              ein vergangener Eintrag will nichts mehr. Zwölf korallene „Kontrolle" untereinander
              haben genau deshalb aufgehört, etwas zu bedeuten. Die einzige Farbe, die bleibt, ist
              die der Kategorie: sie sagt WELCHE, nicht ob — und sie sitzt nur noch im Zeichen. */}
          <span className="flex items-center gap-1.5 min-w-0 text-fliess text-foreground">
            {isWear && e.category ? (
              <>
                <CategoryIconRender
                  name={e.category.icon}
                  className="size-3.5 flex-shrink-0"
                  style={{ color: categoryStyle(e.category.color).color }}
                />
                <span className="truncate">{e.category.name}</span>
                <span className="text-foreground-faint whitespace-nowrap">{wearActionLabel}</span>
              </>
            ) : (
              <>
                <span className="text-foreground-faint flex-shrink-0">{typeIcon(e.type, 13)}</span>
                <span className="truncate">{tStats(TYPE_STATS_KEYS[e.type] ?? "lock")}</span>
              </>
            )}
          </span>

          {e.imageUrl && (
            <Camera size={12} className="text-foreground-faint flex-shrink-0" />
          )}
          {e.orgasmusArt && (
            <span className="text-neben text-foreground-muted whitespace-nowrap">{orgasmusLabel ?? e.orgasmusArt}</span>
          )}
          {e.type === "VERSCHLUSS" && e.kontrollCode && (
            <span className="text-neben text-foreground-faint font-mono tabular-nums">#{e.kontrollCode}</span>
          )}
          {e.note && (
            <span className="text-neben text-foreground-faint italic truncate min-w-0">„{e.note}"</span>
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
              tz={tz}
              imageExifTime={e.imageExifTime}
              oeffnenGrund={e.oeffnenGrund}
              orgasmusArt={e.orgasmusArt}
              openingLabel={openingLabel}
              orgasmusLabel={orgasmusLabel}
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
