"use client";

import type { DeviceCheckStatus } from "@/lib/deviceCheck";
import { useState } from "react";
import { ImageOff, CheckCircle2, ScanLine, Lock, Check, AlertTriangle } from "lucide-react";
import { FullscreenImageModal } from "@/app/components/ImageViewer";
import Badge from "@/app/components/Badge";
import DetailField from "@/app/components/DetailField";
import PhotoChoice, { usePhotoChoice } from "@/app/components/PhotoChoice";
import PhotoThumb from "@/app/components/PhotoThumb";
import KontrolleActions from "./KontrolleActions";
import { useTranslations } from "next-intl";
import type { AnforderungStatus, VerifikationStatus } from "@/lib/utils";

/**
 * Geräte-Fakt aus dem Kontroll-Check: erkanntes Gerät + Abgleich gegen das erwartete (verschlossene).
 * Selbst-gated (rendert nichts ohne Check). Nutzt Badge als einheitlichen Fakt-Chip.
 */
function DeviceFact({ t, row }: { t: ReturnType<typeof useTranslations>; row: AdminKontrolleRowData }) {
  if (!row.deviceCheck) return null;
  const isOk = row.deviceCheck === "ok";
  // error = die KI konnte nicht prüfen (Bild/Referenzen unladbar o.ä.) — klar von „kein Gerät erkannt"
  // (missing) und „kein Check gelaufen" (null → gar kein Chip) getrennt.
  const isError = row.deviceCheck === "error";
  return (
    <Badge variant={isOk ? "ok" : "warn"} size="sm" icon={<Lock size={12} />} label={t("deviceLabel")}>
      {isError
        ? <span className="italic opacity-80">{t("deviceUncheckableLabel")}</span>
        : row.deviceCheck === "missing"
        ? <span className="italic opacity-80">{t("deviceNoneLabel")}</span>
        : <span className="font-semibold">{row.deviceCheckNote ?? "—"}</span>}
      {!isOk && row.deviceCheckExpected && (
        <span className="opacity-80">· {t("deviceExpectedLabel")} {row.deviceCheckExpected}</span>
      )}
      {isOk ? <Check size={12} className="shrink-0" /> : <AlertTriangle size={12} className="shrink-0" />}
    </Badge>
  );
}

export interface AdminKontrolleRowData {
  imageUrl: string | null;
  /** Foto durchs Sichtfenster der Box — im Vollbild neben dem Kontroll-Foto wählbar. */
  boxImageUrl?: string | null;
  kommentar: string | null;
  pillLabel: string | null;
  pillCls: string | null;
  username?: string | null;
  code: string | null;
  fulfilledAtStr: string | null;
  deadlineStr: string | null;
  createdAtStr: string | null;
  /** Label für createdAtStr — "Erstellt" normalerweise, "Versand" bei Auto-Kontrollen mit bekanntem Versand-Zeitpunkt. */
  createdLabel: string;
  withdrawnAtStr: string | null;
  /** Formatierter `wirksamAb`-Zeitpunkt — nur bei geplanten (noch nicht ausgelösten) Kontrollen
   *  gesetzt. Die Beschriftung ("Geplant für") liefert `labels.scheduledForLabel`. */
  scheduledForStr: string | null;
  timeCorrectedStr: string | null;
  note: string | null;
  kontrolleId: string | null;
  entryId: string | null;
  anforderungStatus: AnforderungStatus;
  verifikationStatus: VerifikationStatus | null;
  /** Warum die automatische Verifikation nicht gematcht hat (localized), nur bei "unverified" gesetzt. */
  verifikationReasonStr: string | null;
  /** Kontroll-Geräte-Check: null = nicht geprüft · "ok" · "wrong" (ein anderes, BENANNTES Gerät —
   *  `deviceCheckNote` ist dann gesetzt) · "missing" (kein Gerät erkannt) · "error" (nicht prüfbar,
   *  inkl. „Gerät sichtbar, aber keiner Referenz zuzuordnen"). */
  deviceCheck: DeviceCheckStatus | null;
  /** Im Foto erkanntes Gerät (Name) oder null. */
  deviceCheckNote: string | null;
  /** Erwartetes (verschlossenes) Gerät zur Check-Zeit. */
  deviceCheckExpected: string | null;
}

interface Labels {
  fulfilledLabel: string;
  fristLabel: string;
  withdrawnLabel: string;
  scheduledForLabel: string;
  instructionLabel: string;
  noteLabel: string;
  imageAlt: string;
}

const PAGE_SIZE = 10;

function AdminKontrolleThumb({ row, labels }: { row: AdminKontrolleRowData; labels: Labels }) {
  const t = useTranslations("admin");
  const [open, setOpen] = useState(false);
  const photo = usePhotoChoice(row.imageUrl, row.boxImageUrl);

  // Auch ohne Kontroll-Foto öffnen, sobald ein Box-Foto da ist — sonst zeigte dieselbe Kontrolle
  // den Schlüssel-Nachweis in der Vorschau der User-Seite, in dieser Vollliste aber nicht.
  const thumbUrl = row.imageUrl ?? row.boxImageUrl;
  if (!thumbUrl) {
    return (
      <div className="flex-shrink-0 size-10 rounded-xl bg-surface-raised flex items-center justify-center">
        <ImageOff size={16} className="text-foreground-faint" />
      </div>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={labels.imageAlt} className="flex-shrink-0">
        <PhotoThumb url={thumbUrl} alt={labels.imageAlt} />
      </button>
      {open && (
        <FullscreenImageModal
          src={photo.src}
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
              <PhotoChoice photo={photo} />
              {row.pillLabel && (
                <span className={`text-xs font-medium border rounded-lg px-2 py-0.5 self-start ${row.pillCls}`}>{row.pillLabel}</span>
              )}
              {row.verifikationReasonStr && (
                <p className="text-xs text-warn">{row.verifikationReasonStr}</p>
              )}
              <DeviceFact t={t} row={row} />
              {row.scheduledForStr && (
                <DetailField label={labels.scheduledForLabel}>
                  <p className="text-sm text-foreground-muted">{row.scheduledForStr}</p>
                </DetailField>
              )}
              {row.fulfilledAtStr && (
                <DetailField label={labels.fulfilledLabel}>
                  <p className="text-sm text-foreground-muted">{row.fulfilledAtStr}</p>
                </DetailField>
              )}
              {row.deadlineStr && (
                <DetailField label={labels.fristLabel}>
                  <p className="text-sm text-foreground-muted">{row.deadlineStr}</p>
                </DetailField>
              )}
              {row.createdAtStr && (
                <DetailField label={row.createdLabel}>
                  <p className="text-sm text-foreground-muted">{row.createdAtStr}</p>
                </DetailField>
              )}
              {row.timeCorrectedStr && (
                <p className="text-xs text-warn font-medium">{row.timeCorrectedStr}</p>
              )}
              {row.kommentar && (
                <DetailField label={labels.instructionLabel}>
                  <p className="text-sm text-foreground-muted">{row.kommentar}</p>
                </DetailField>
              )}
              {row.note && (
                <DetailField label={labels.noteLabel}>
                  <p className="text-sm text-foreground-muted italic">„{row.note}"</p>
                </DetailField>
              )}
            </div>
          }
        />
      )}
    </>
  );
}

export default function AdminKontrolleListClient({ items, allItems, labels }: { items: AdminKontrolleRowData[]; allItems?: AdminKontrolleRowData[]; labels: Labels }) {
  const [page, setPage] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const t = useTranslations("admin");
  const tc = useTranslations("common");

  const activeItems = showAll && allItems ? allItems : items;
  const totalPages = Math.ceil(activeItems.length / PAGE_SIZE);
  const safePage = Math.min(page, Math.max(0, totalPages - 1));
  const paginated = activeItems.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  function toggleShowAll() {
    setShowAll(v => !v);
    setPage(0);
  }

  return (
    <>
      <div className="divide-y divide-border-subtle">
        {paginated.map((row, i) => (
          <div key={i} className="px-4 py-3 flex items-start gap-3">
            <AdminKontrolleThumb row={row} labels={labels} />
            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
              {(row.username || row.pillLabel) && (
                <div className="flex items-center gap-2 flex-wrap">
                  {row.username && <span className="font-semibold text-foreground text-sm">{row.username}</span>}
                  {row.pillLabel && <span className={`text-xs font-medium border rounded-lg px-2 py-0.5 ${row.pillCls}`}>{row.pillLabel}</span>}
                </div>
              )}
              {row.verifikationReasonStr && (
                <p className="text-xs text-warn">{row.verifikationReasonStr}</p>
              )}
              {(row.code || row.deviceCheck) && (
                <div className="flex items-center gap-2 flex-wrap">
                  {row.code && (
                    <Badge variant="inspect" size="sm" icon={<ScanLine size={12} />} label={t("codeLabel")}>
                      <span className="font-mono font-bold">{row.code}</span>
                    </Badge>
                  )}
                  <DeviceFact t={t} row={row} />
                </div>
              )}
              <div className="flex items-center gap-3 text-xs text-foreground-faint flex-wrap">
                {row.scheduledForStr && <span>{labels.scheduledForLabel}: {row.scheduledForStr}</span>}
                {row.fulfilledAtStr && <span>{labels.fulfilledLabel}: {row.fulfilledAtStr}</span>}
                {row.deadlineStr && <span>{labels.fristLabel}: {row.deadlineStr}</span>}
                {row.createdAtStr && <span>{row.createdLabel}: {row.createdAtStr}</span>}
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
      <div className="flex items-center justify-between px-5 py-3 border-t border-border-subtle">
        {totalPages > 1 ? (
          <>
            <button type="button" onClick={() => setPage(p => p - 1)} disabled={safePage === 0}
              className="text-xs font-medium text-foreground-muted disabled:opacity-40 hover:text-foreground transition">
              ← {tc("back")}
            </button>
            <span className="text-xs text-foreground-faint tabular-nums">{safePage + 1} / {totalPages}</span>
            <button type="button" onClick={() => setPage(p => p + 1)} disabled={safePage >= totalPages - 1}
              className="text-xs font-medium text-foreground-muted disabled:opacity-40 hover:text-foreground transition">
              {tc("next")} →
            </button>
          </>
        ) : <span />}
      </div>
      {allItems && allItems.length > items.length && (
        <div className="px-5 pb-3">
          <button
            type="button"
            onClick={toggleShowAll}
            className="w-full text-xs font-medium text-foreground-muted hover:text-foreground py-2 rounded-lg hover:bg-surface-raised transition"
          >
            {showAll ? t("alarmeShowAlarmsOnly") : t("alarmeShowAll", { count: allItems.length })}
          </button>
        </div>
      )}
    </>
  );
}
