"use client";

import { useState } from "react";
import { Lock, LockOpen, Timer, ImageOff } from "lucide-react";
import { formatDateTime, toDateLocale, APP_TZ } from "@/lib/utils";
import { useTranslations, useLocale } from "next-intl";
import { FullscreenImageModal } from "@/app/components/ImageViewer";

const GRUND_LABELS: Record<string, string> = {
  REINIGUNG: "Reinigung",
  KEYHOLDER: "Von Keyholder erlaubt",
  NOTFALL: "Notfall",
  ANDERES: "Anderes",
};

interface PairEntry {
  id: string;
  startTime: string;
  imageUrl: string | null;
  imageExifTime: string | null;
  note: string | null;
  oeffnenGrund: string | null;
  kontrollCode: string | null;
  verifikationStatus: string | null;
}

interface Props {
  verschluss: PairEntry;
  oeffnen: PairEntry | null;
  active: boolean;
  duration: string | null;
  photoStatus: "no-photo" | "exif-mismatch" | "ok";
}

function EntryPanel({ entry, type }: { entry: PairEntry; type: "VERSCHLUSS" | "OEFFNEN" }) {
  const tc = useTranslations("common");
  const ti = useTranslations("inspectionForm");
  const dl = toDateLocale(useLocale());

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-xs text-foreground-faint uppercase tracking-wider font-semibold mb-0.5">{tc("dateTime")}</p>
        <p className="text-sm font-semibold text-foreground">{formatDateTime(new Date(entry.startTime), dl)}</p>
      </div>

      {entry.imageExifTime && (
        <div>
          <p className="text-xs text-foreground-faint uppercase tracking-wider font-semibold mb-0.5">{tc("exifDate")}</p>
          <p className="text-sm text-foreground-muted">{formatDateTime(new Date(entry.imageExifTime), dl)}</p>
        </div>
      )}

      {entry.oeffnenGrund && (
        <div>
          <p className="text-xs text-foreground-faint uppercase tracking-wider font-semibold mb-0.5">Grund</p>
          <span className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full border border-unlock-border bg-unlock-bg text-unlock-text">
            {GRUND_LABELS[entry.oeffnenGrund] ?? entry.oeffnenGrund}
          </span>
        </div>
      )}

      {entry.note && (
        <div>
          <p className="text-xs text-foreground-faint uppercase tracking-wider font-semibold mb-0.5">{tc("note")}</p>
          <p className="text-sm text-foreground-muted italic">„{entry.note}"</p>
        </div>
      )}

      {entry.kontrollCode && (
        <div>
          <p className="text-xs text-foreground-faint uppercase tracking-wider font-semibold mb-0.5">{ti("controlCode")}</p>
          <p className="text-sm font-mono font-bold text-[var(--color-inspect)]">{entry.kontrollCode}</p>
        </div>
      )}
    </div>
  );
}

export default function PairRow({ verschluss, oeffnen, active, duration, photoStatus }: Props) {
  const tc = useTranslations("common");
  const td = useTranslations("dashboard");
  const dl = toDateLocale(useLocale());
  const [showVerschluss, setShowVerschluss] = useState(false);
  const [showOeffnen, setShowOeffnen] = useState(false);
  const [imgError, setImgError] = useState(false);

  function splitDT(iso: string) {
    const d = new Date(iso);
    return {
      date: d.toLocaleDateString(dl, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: APP_TZ }),
      time: d.toLocaleTimeString(dl, { hour: "2-digit", minute: "2-digit", timeZone: APP_TZ }),
    };
  }

  const accentBorder =
    photoStatus === "no-photo" ? "border-l-4 border-l-warn" :
    photoStatus === "exif-mismatch" ? "border-l-4 border-l-[var(--color-warn)]" :
    "border-l-4 border-l-transparent";

  return (
    <>
      <div className={`grid grid-cols-[80px_1fr_1fr] sm:grid-cols-[96px_1fr_1fr] lg:grid-cols-[96px_1fr_1fr_160px] gap-4 px-5 py-4 hover:bg-surface-raised/60 transition ${accentBorder}`}>

        {/* Col 1: Photo */}
        <div className="flex items-start pt-0.5">
          {verschluss.imageUrl && !imgError ? (
            <button type="button" onClick={() => setShowVerschluss(true)} className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={verschluss.imageUrl}
                alt={tc("photo")}
                className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl object-cover hover:opacity-90 transition"
                onError={() => setImgError(true)}
              />
            </button>
          ) : imgError ? (
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-surface-raised flex items-center justify-center text-foreground-faint">
              <ImageOff size={20} />
            </div>
          ) : null}
        </div>

        {/* Col 2: Verschluss */}
        <div className="flex flex-col items-start min-w-0 gap-1">
          <div className="flex items-center gap-1 min-w-0">
            <button
              type="button"
              onClick={() => setShowVerschluss(true)}
              className="font-semibold text-foreground hover:text-[var(--color-inspect)] transition text-left"
            >
              {(() => { const dt = splitDT(verschluss.startTime); return (<><span className="block text-sm tabular-nums">{dt.date}</span><span className="block text-xs tabular-nums text-foreground-faint font-normal">{dt.time}</span></>); })()}
            </button>
          </div>
          {verschluss.imageExifTime && photoStatus === "exif-mismatch" && (
            <p className="text-xs text-[var(--color-warn)]">{tc("exifDate")}: {formatDateTime(new Date(verschluss.imageExifTime), dl)}</p>
          )}
          {photoStatus === "no-photo" && <p className="text-xs text-warn">{td("noPhoto")}</p>}
          {verschluss.note && (
            <p className="text-xs text-foreground-faint italic truncate" title={verschluss.note}>
              „{verschluss.note}"
            </p>
          )}
        </div>

        {/* Col 3: Öffnung */}
        <div className="flex flex-col min-w-0 gap-1">
          {oeffnen ? (
            <>
              <div className="flex items-center gap-1 min-w-0">
                <button
                  type="button"
                  onClick={() => setShowOeffnen(true)}
                  className="font-semibold text-foreground hover:text-[var(--color-inspect)] transition text-left"
                >
                  {(() => { const dt = splitDT(oeffnen.startTime); return (<><span className="block text-sm tabular-nums">{dt.date}</span><span className="block text-xs tabular-nums text-foreground-faint font-normal">{dt.time}</span></>); })()}
                </button>
              </div>
              {oeffnen.oeffnenGrund && (
                <span className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full border border-unlock-border bg-unlock-bg text-unlock-text self-start">
                  {GRUND_LABELS[oeffnen.oeffnenGrund] ?? oeffnen.oeffnenGrund}
                </span>
              )}
              {oeffnen.note && (
                <p className="text-xs text-foreground-faint italic truncate" title={oeffnen.note}>
                  „{oeffnen.note}"
                </p>
              )}
            </>
          ) : active ? (
            <span className="inline-flex items-center text-xs font-semibold text-[var(--color-lock-text)] bg-[var(--color-lock-bg)] border border-[var(--color-lock-border)] px-2 py-0.5 rounded-full self-start">
              {td("stillLocked")}
            </span>
          ) : (
            <p className="text-sm text-foreground-faint">{td("notCaptured")}</p>
          )}
        </div>

        {/* Col 4: Duration */}
        <div className="hidden lg:flex items-start pt-0.5">
          {duration ? (
            <span className="text-xs font-mono text-foreground-muted bg-surface-raised px-2.5 py-1 rounded-lg whitespace-nowrap flex items-center gap-1">
              <Timer size={11} />{duration}
            </span>
          ) : (
            <span className="text-foreground-faint text-sm">–</span>
          )}
        </div>
      </div>

      {showVerschluss && (
        <FullscreenImageModal
          src={verschluss.imageUrl ?? ""}
          alt={tc("photo")}
          onClose={() => setShowVerschluss(false)}
          title={<span className="flex items-center gap-1.5"><Lock size={14} />{td("lock")}</span>}
          panel={<EntryPanel entry={verschluss} type="VERSCHLUSS" />}
        />
      )}
      {showOeffnen && oeffnen && (
        <FullscreenImageModal
          src={oeffnen.imageUrl ?? ""}
          alt={tc("photo")}
          onClose={() => setShowOeffnen(false)}
          title={<span className="flex items-center gap-1.5"><LockOpen size={14} />{td("opening")}</span>}
          panel={<EntryPanel entry={oeffnen} type="OEFFNEN" />}
        />
      )}
    </>
  );
}
