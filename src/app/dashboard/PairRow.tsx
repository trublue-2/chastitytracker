"use client";

import { useState } from "react";
import { Lock, LockOpen, Timer, ImageOff } from "lucide-react";
import { formatDateTime, toDateLocale, APP_TZ } from "@/lib/utils";
import { useTranslations, useLocale } from "next-intl";
import { FullscreenImageModal } from "@/app/components/ImageViewer";
import EntryDetailPanel from "@/app/components/EntryDetailPanel";
import { GRUND_I18N_KEYS } from "@/lib/constants";

function splitDT(iso: string, dl: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString(dl, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: APP_TZ }),
    time: d.toLocaleTimeString(dl, { hour: "2-digit", minute: "2-digit", timeZone: APP_TZ }),
  };
}

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

function entryDetailPanel(entry: PairEntry, dl: string) {
  return (
    <EntryDetailPanel
      startTime={new Date(entry.startTime)}
      locale={dl}
      imageExifTime={entry.imageExifTime}
      oeffnenGrund={entry.oeffnenGrund}
      kontrollCode={entry.kontrollCode}
      verifikationStatus={entry.verifikationStatus}
      note={entry.note}
    />
  );
}

export default function PairRow({ verschluss, oeffnen, active, duration, photoStatus }: Props) {
  const tc = useTranslations("common");
  const td = useTranslations("dashboard");
  const tOpen = useTranslations("openForm");
  const dl = toDateLocale(useLocale());
  const [showVerschluss, setShowVerschluss] = useState(false);
  const [showOeffnen, setShowOeffnen] = useState(false);
  const [imgError, setImgError] = useState(false);

  const verschlussDT = splitDT(verschluss.startTime, dl);
  const oeffnenDT = oeffnen ? splitDT(oeffnen.startTime, dl) : null;

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
              <span className="block text-sm tabular-nums">{verschlussDT.date}</span>
              <span className="block text-xs tabular-nums text-foreground-faint font-normal">{verschlussDT.time}</span>
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
                  <span className="block text-sm tabular-nums">{oeffnenDT!.date}</span>
                  <span className="block text-xs tabular-nums text-foreground-faint font-normal">{oeffnenDT!.time}</span>
                </button>
              </div>
              {oeffnen.oeffnenGrund && (
                <span className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full border border-unlock-border bg-unlock-bg text-unlock-text self-start">
                  {GRUND_I18N_KEYS[oeffnen.oeffnenGrund as keyof typeof GRUND_I18N_KEYS] ? tOpen(GRUND_I18N_KEYS[oeffnen.oeffnenGrund as keyof typeof GRUND_I18N_KEYS]) : oeffnen.oeffnenGrund}
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
          panel={entryDetailPanel(verschluss, dl)}
        />
      )}
      {showOeffnen && oeffnen && (
        <FullscreenImageModal
          src={oeffnen.imageUrl ?? ""}
          alt={tc("photo")}
          onClose={() => setShowOeffnen(false)}
          title={<span className="flex items-center gap-1.5"><LockOpen size={14} />{td("opening")}</span>}
          panel={entryDetailPanel(oeffnen, dl)}
        />
      )}
    </>
  );
}
