"use client";

import { useState, useRef, useEffect } from "react";
import { X, Lock, CheckCircle2, Droplets, ImageOff, MoreVertical, Camera } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import EntryActions from "./EntryActions";

export interface SessionEventData {
  type: "verschluss" | "kontrolle" | "orgasmus";
  dateStr: string;
  timeStr: string;
  imageUrl: string | null;
  exifStr: string | null;
  note: string | null;
  entryId: string | null;
  captureHref: string | null;
  deadlineStr: string | null;
  isOverdue: boolean;
  kontrolleCode: string | null;
  kontrolleKommentar: string | null;
  kontrolleStatusLabel: string | null;
  orgasmusArt: string | null;
}

function PinchZoomImage({ src, onError }: { src: string; onError: () => void }) {
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
    if (e.touches.length === 2) { lastDistRef.current = pinchDist(e.touches); lastTouchRef.current = null; }
    else { lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }
  }
  function handleTouchMove(e: React.TouchEvent) {
    e.stopPropagation();
    if (e.touches.length === 2 && lastDistRef.current !== null) {
      const d = pinchDist(e.touches);
      const ratio = d / lastDistRef.current;
      lastDistRef.current = d;
      setTf(prev => { const scale = Math.min(Math.max(prev.scale * ratio, 1), 5); return { scale, x: scale === 1 ? 0 : prev.x, y: scale === 1 ? 0 : prev.y }; });
    } else if (e.touches.length === 1 && lastTouchRef.current && tfRef.current.scale > 1) {
      const dx = e.touches[0].clientX - lastTouchRef.current.x;
      const dy = e.touches[0].clientY - lastTouchRef.current.y;
      lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      setTf(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
    } else { lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }
  }
  function handleTouchEnd(e: React.TouchEvent) {
    e.stopPropagation(); lastDistRef.current = null; lastTouchRef.current = null;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className="max-w-full max-h-full object-contain rounded-lg select-none"
      style={{ transform: `scale(${tf.scale}) translate(${tf.x / tf.scale}px, ${tf.y / tf.scale}px)`, touchAction: "none", willChange: "transform", cursor: tf.scale > 1 ? "grab" : "default" }}
      draggable={false} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
      onClick={(e) => e.stopPropagation()} onError={onError}
    />
  );
}

function CaptureButton({ href }: { href: string }) {
  const t = useTranslations("dashboard");
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function openMenu() {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    }
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent | TouchEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("touchstart", onOutside);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("touchstart", onOutside);
    };
  }, [open]);

  return (
    <div className="relative flex-shrink-0">
      <button ref={btnRef} type="button" onClick={openMenu}
        className="w-6 h-6 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 active:bg-gray-200 transition">
        <MoreVertical size={16} />
      </button>
      {open && (
        <div ref={menuRef} style={{ top: pos.top, right: pos.right }}
          className="fixed w-40 bg-white border border-gray-100 rounded-xl shadow-lg z-50 overflow-hidden">
          <Link href={href} onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition">
            <Camera size={14} className="text-gray-400" />
            {t("captureNow")}
          </Link>
        </div>
      )}
    </div>
  );
}

export default function SessionEventRow({ ev, icon }: { ev: SessionEventData; icon: React.ReactNode }) {
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [imgError, setImgError] = useState(false);
  const hasImage = !!ev.imageUrl && !imgError;

  const typePill = ev.type === "verschluss" ? (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
      <Lock size={10} />{t("lock")}
    </span>
  ) : ev.type === "kontrolle" ? (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-orange-700 bg-orange-50 px-2 py-0.5 rounded-full border border-orange-200">
      <CheckCircle2 size={10} />
      {ev.kontrolleStatusLabel ?? t("sessionKontrolle")}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
      <Droplets size={10} />{t("sessionOrgasmus")}
    </span>
  );

  // Open / overdue kontrolle → banner style
  if (ev.captureHref) {
    const colorCls = ev.isOverdue
      ? "bg-red-50 border-red-200 text-red-700"
      : "bg-amber-50 border-amber-200 text-amber-700";
    return (
      <div className={`px-5 py-3 flex items-center gap-3 border-t border-b ${colorCls}`}>
        <span className="text-lg flex-shrink-0">{ev.isOverdue ? "🚨" : "⚠️"}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold">
            {ev.isOverdue ? t("inspectionOverdue") : t("inspectionRequired")}
          </p>
          {ev.deadlineStr && (
            <p className="text-xs opacity-80">
              {ev.isOverdue ? t("overduePrefix") : t("untilPrefix")} {ev.deadlineStr}
              {ev.kontrolleCode && <> · <span className="font-mono font-bold">{ev.kontrolleCode}</span></>}
            </p>
          )}
          {ev.kontrolleKommentar && (
            <p className="text-xs font-medium mt-1 opacity-90">{ev.kontrolleKommentar}</p>
          )}
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <CaptureButton href={ev.captureHref} />
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => e.key === "Enter" && setOpen(true)}
        className="w-full flex items-start gap-4 px-5 py-4 text-left hover:bg-gray-50/60 transition active:bg-gray-100/60 cursor-pointer"
      >
        {/* Photo */}
        <div className="shrink-0">
          {ev.imageUrl && !imgError ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ev.imageUrl} alt="" className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl object-cover"
              onError={() => setImgError(true)} />
          ) : imgError ? (
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-gray-100 flex items-center justify-center">
              <ImageOff size={18} className="text-gray-300" />
            </div>
          ) : (
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-gray-100 flex items-center justify-center">
              {icon}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 pt-0.5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="block text-sm font-semibold text-gray-900 tabular-nums">{ev.dateStr}</span>
              <span className="block text-xs text-gray-400 tabular-nums">{ev.timeStr}</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {typePill}
              {ev.entryId ? (
                <div onClick={(e) => e.stopPropagation()}>
                  <EntryActions id={ev.entryId} editHref={`/dashboard/edit/${ev.entryId}`} />
                </div>
              ) : ev.captureHref ? (
                <div onClick={(e) => e.stopPropagation()}>
                  <CaptureButton href={ev.captureHref} />
                </div>
              ) : null}
            </div>
          </div>
          {ev.exifStr && <p className="text-xs text-amber-600 mt-0.5">EXIF: {ev.exifStr}</p>}
          {ev.orgasmusArt && <p className="text-xs text-rose-400 mt-0.5">{ev.orgasmusArt}</p>}
          {ev.note && <p className="text-xs text-gray-400 italic mt-0.5 truncate">„{ev.note}"</p>}
        </div>
      </div>

      {/* Detail Modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex flex-col"
          style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
          onClick={() => setOpen(false)}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <span className="text-white/70 text-sm font-medium flex items-center gap-1.5">
              {typePill}
            </span>
            <button onClick={() => setOpen(false)} className="flex items-center gap-1.5 text-white/80 active:text-white transition p-2 -m-2">
              <X size={22} />
              <span className="text-sm font-medium">{tc("close")}</span>
            </button>
          </div>

          {/* Image */}
          {hasImage ? (
            <div className="flex-1 min-h-0 flex items-center justify-center px-4 pb-4 overflow-hidden" onClick={() => setOpen(false)}>
              <PinchZoomImage src={ev.imageUrl!} onError={() => setImgError(true)} />
            </div>
          ) : (
            <div className="flex-1" />
          )}

          {/* Details panel */}
          <div className="flex-shrink-0 bg-white rounded-t-2xl px-5 py-5 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-0.5">{tc("dateTime")}</p>
              <p className="text-sm font-semibold text-gray-900">{ev.dateStr}, {ev.timeStr}</p>
            </div>
            {ev.exifStr && (
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-0.5">{tc("exifDate")}</p>
                <p className="text-sm text-amber-600">{ev.exifStr}</p>
              </div>
            )}
            {ev.orgasmusArt && (
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-0.5">Art</p>
                <p className="text-sm text-gray-700">{ev.orgasmusArt}</p>
              </div>
            )}
            {ev.note && (
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-0.5">{tc("note")}</p>
                <p className="text-sm text-gray-700 italic">„{ev.note}"</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
