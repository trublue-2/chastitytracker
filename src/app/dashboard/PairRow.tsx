"use client";

import { useState, useRef } from "react";
import { X, Lock, LockOpen, Timer, ImageOff } from "lucide-react";
import { formatDateTime, toDateLocale } from "@/lib/utils";
import EntryActions from "./EntryActions";
import { useTranslations, useLocale } from "next-intl";

interface PairEntry {
  id: string;
  startTime: string;
  imageUrl: string | null;
  imageExifTime: string | null;
  note: string | null;
  kontrollCode: string | null;
  aiVerified: boolean | null;
}

interface Props {
  verschluss: PairEntry;
  oeffnen: PairEntry | null;
  active: boolean;
  duration: string | null;
  photoStatus: "no-photo" | "exif-mismatch" | "ok";
}

function PinchZoomImage({ src, alt, onError }: { src: string; alt: string; onError: () => void }) {
  const [tf, setTf] = useState({ scale: 1, x: 0, y: 0 });
  const tfRef = useRef(tf);
  tfRef.current = tf;
  const lastDistRef = useRef<number | null>(null);
  const lastTouchRef = useRef<{ x: number; y: number } | null>(null);

  function pinchDist(t: React.TouchList) {
    return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  }

  function handleTouchStart(e: React.TouchEvent) {
    e.stopPropagation();
    if (e.touches.length === 2) {
      lastDistRef.current = pinchDist(e.touches);
      lastTouchRef.current = null;
    } else {
      lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  }

  function handleTouchMove(e: React.TouchEvent) {
    e.stopPropagation();
    if (e.touches.length === 2 && lastDistRef.current !== null) {
      const d = pinchDist(e.touches);
      const ratio = d / lastDistRef.current;
      lastDistRef.current = d;
      setTf(prev => {
        const scale = Math.min(Math.max(prev.scale * ratio, 1), 5);
        return { scale, x: scale === 1 ? 0 : prev.x, y: scale === 1 ? 0 : prev.y };
      });
    } else if (e.touches.length === 1 && lastTouchRef.current && tfRef.current.scale > 1) {
      const dx = e.touches[0].clientX - lastTouchRef.current.x;
      const dy = e.touches[0].clientY - lastTouchRef.current.y;
      lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      setTf(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
    } else {
      lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  }

  function handleTouchEnd(e: React.TouchEvent) {
    e.stopPropagation();
    lastDistRef.current = null;
    lastTouchRef.current = null;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className="max-w-full max-h-full object-contain rounded-lg select-none"
      style={{
        transform: `scale(${tf.scale}) translate(${tf.x / tf.scale}px, ${tf.y / tf.scale}px)`,
        touchAction: "none",
        willChange: "transform",
        cursor: tf.scale > 1 ? "grab" : "default",
      }}
      draggable={false}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={(e) => e.stopPropagation()}
      onError={onError}
    />
  );
}

function DetailModal({
  entry,
  type,
  onClose,
}: {
  entry: PairEntry;
  type: "VERSCHLUSS" | "OEFFNEN";
  onClose: () => void;
}) {
  const tc = useTranslations("common");
  const td = useTranslations("dashboard");
  const ti = useTranslations("inspectionForm");
  const dl = toDateLocale(useLocale());
  const [imgError, setImgError] = useState(false);
  const hasImage = !!entry.imageUrl && !imgError;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex flex-col"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
      onClick={onClose}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-white/70 text-sm font-medium flex items-center gap-1.5">
          {type === "VERSCHLUSS"
            ? <><Lock size={14} /> {td("lock")}</>
            : <><LockOpen size={14} /> {td("opening")}</>}
        </span>
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-white/80 active:text-white transition p-2 -m-2"
        >
          <X size={22} />
          <span className="text-sm font-medium">{tc("close")}</span>
        </button>
      </div>

      {/* Image */}
      {hasImage && (
        <div
          className="flex-1 min-h-0 flex items-center justify-center px-4 pb-4 overflow-hidden"
          onClick={onClose}
        >
          <PinchZoomImage src={entry.imageUrl!} alt={tc("photo")} onError={() => setImgError(true)} />
        </div>
      )}
      {!hasImage && <div className="flex-1" />}

      {/* Details panel */}
      <div
        className="flex-shrink-0 bg-white rounded-t-2xl px-5 py-5 flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-0.5">{tc("dateTime")}</p>
            <p className="text-sm font-semibold text-gray-900">{formatDateTime(new Date(entry.startTime), dl)}</p>
          </div>
          <EntryActions id={entry.id} editHref={`/dashboard/edit/${entry.id}`} />
        </div>

        {entry.imageExifTime && (
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-0.5">{tc("exifDate")}</p>
            <p className="text-sm text-gray-700">{formatDateTime(new Date(entry.imageExifTime), dl)}</p>
          </div>
        )}

        {entry.note && (
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-0.5">{tc("note")}</p>
            <p className="text-sm text-gray-700 italic">„{entry.note}"</p>
          </div>
        )}

        {entry.kontrollCode && (
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-0.5">{ti("controlCode")}</p>
            <p className="text-sm font-mono font-bold text-orange-500">{entry.kontrollCode}</p>
          </div>
        )}
      </div>
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
      date: d.toLocaleDateString(dl, { day: "2-digit", month: "2-digit", year: "numeric" }),
      time: d.toLocaleTimeString(dl, { hour: "2-digit", minute: "2-digit" }),
    };
  }

  const accentBorder =
    photoStatus === "no-photo" ? "border-l-4 border-l-red-400" :
    photoStatus === "exif-mismatch" ? "border-l-4 border-l-amber-400" :
    "border-l-4 border-l-transparent";

  return (
    <>
      <div className={`grid grid-cols-[80px_1fr_1fr] sm:grid-cols-[96px_1fr_1fr] lg:grid-cols-[96px_1fr_1fr_160px] gap-4 px-5 py-4 hover:bg-gray-50/60 transition ${accentBorder}`}>

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
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-gray-100 flex items-center justify-center text-gray-400">
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
              className="font-semibold text-gray-900 hover:text-orange-600 transition text-left"
            >
              {(() => { const dt = splitDT(verschluss.startTime); return (<><span className="block text-sm tabular-nums">{dt.date}</span><span className="block text-xs tabular-nums text-gray-400 font-normal">{dt.time}</span></>); })()}
            </button>
            <EntryActions id={verschluss.id} editHref={`/dashboard/edit/${verschluss.id}`} />
          </div>
          {verschluss.imageExifTime && photoStatus === "exif-mismatch" && (
            <p className="text-xs text-amber-600">EXIF: {formatDateTime(new Date(verschluss.imageExifTime), dl)}</p>
          )}
          {photoStatus === "no-photo" && <p className="text-xs text-red-400">{td("noPhoto")}</p>}
        </div>

        {/* Col 3: Öffnung */}
        <div className="flex flex-col min-w-0 gap-1">
          {oeffnen ? (
            <>
              <div className="flex items-center gap-1 min-w-0">
                <button
                  type="button"
                  onClick={() => setShowOeffnen(true)}
                  className="font-semibold text-gray-900 hover:text-orange-600 transition text-left"
                >
                  {(() => { const dt = splitDT(oeffnen.startTime); return (<><span className="block text-sm tabular-nums">{dt.date}</span><span className="block text-xs tabular-nums text-gray-400 font-normal">{dt.time}</span></>); })()}
                </button>
                <EntryActions id={oeffnen.id} editHref={`/dashboard/edit/${oeffnen.id}`} />
              </div>
              {oeffnen.note && (
                <p className="text-xs text-gray-400 italic truncate" title={oeffnen.note}>
                  „{oeffnen.note}"
                </p>
              )}
            </>
          ) : active ? (
            <span className="inline-flex items-center text-xs font-semibold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full self-start">
              {td("stillLocked")}
            </span>
          ) : (
            <p className="text-sm text-gray-300">{td("notCaptured")}</p>
          )}
        </div>

        {/* Col 4: Duration */}
        <div className="hidden lg:flex items-start pt-0.5">
          {duration ? (
            <span className="text-xs font-mono text-gray-500 bg-gray-100 px-2.5 py-1 rounded-lg whitespace-nowrap flex items-center gap-1">
              <Timer size={11} />{duration}
            </span>
          ) : (
            <span className="text-gray-200 text-sm">–</span>
          )}
        </div>
      </div>

      {showVerschluss && (
        <DetailModal entry={verschluss} type="VERSCHLUSS" onClose={() => setShowVerschluss(false)} />
      )}
      {showOeffnen && oeffnen && (
        <DetailModal entry={oeffnen} type="OEFFNEN" onClose={() => setShowOeffnen(false)} />
      )}
    </>
  );
}
