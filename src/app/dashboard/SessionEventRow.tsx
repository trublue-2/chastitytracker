"use client";

import { useState, useRef, useEffect } from "react";
import { Lock, LockOpen, CheckCircle2, Droplets, ImageOff, MoreVertical, Camera, AlertTriangle, AlertCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { FullscreenImageModal } from "@/app/components/ImageViewer";

export interface SessionEventData {
  type: "verschluss" | "kontrolle" | "orgasmus" | "reinigung";
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
  kombiniertePillLabel: string | null;
  kombiniertePillCls: string | null;
  orgasmusArt: string | null;
  pauseDurationStr?: string | null;
  timeCorrected?: boolean;
  timeCorrectedSystemStr?: string | null;
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
        className="w-6 h-6 flex items-center justify-center rounded-lg text-foreground-faint hover:text-foreground-muted hover:bg-surface-raised active:bg-border-subtle transition">
        <MoreVertical size={16} />
      </button>
      {open && (
        <div ref={menuRef} style={{ top: pos.top, right: pos.right }}
          className="fixed w-40 bg-surface border border-border-subtle rounded-xl shadow-lg z-50 overflow-hidden">
          <Link href={href} onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-3 text-sm text-foreground-muted hover:bg-surface-raised transition">
            <Camera size={14} className="text-foreground-faint" />
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

  // Reinigung → compact inline row (no modal)
  if (ev.type === "reinigung") {
    return (
      <div className="w-full flex items-center gap-4 px-5 py-3 text-left">
        <div className="shrink-0 w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden">
          {ev.imageUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={ev.imageUrl} alt="" loading="lazy" className="w-full h-full object-cover rounded-xl" />
          ) : (
            <div className="w-full h-full bg-sky-50 flex items-center justify-center rounded-xl">
              <LockOpen size={18} className="text-sky-400" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0 pt-0.5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="mb-0.5 sm:hidden">
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-sky-600 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-full">
                  <LockOpen size={10} />{t("sessionReinigung")}
                </span>
              </div>
              <span className="block text-sm font-semibold text-foreground tabular-nums">{ev.dateStr}</span>
              <span className="block text-xs text-foreground-faint tabular-nums">{ev.timeStr}</span>
            </div>
            <span className="hidden sm:inline-flex items-center gap-1 text-xs font-semibold text-sky-600 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-full shrink-0">
              <LockOpen size={10} />{t("sessionReinigung")}
            </span>
          </div>
          {ev.pauseDurationStr && (
            <p className="text-xs text-sky-500 mt-0.5">{ev.pauseDurationStr}</p>
          )}
          {ev.note && <p className="text-xs text-foreground-faint italic mt-0.5 truncate">„{ev.note}"</p>}
        </div>
      </div>
    );
  }

  const typePill = ev.type === "verschluss" ? (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-lock-text)] bg-[var(--color-lock-bg)] border border-[var(--color-lock-border)] px-2 py-0.5 rounded-full">
      <Lock size={10} />{t("lock")}
    </span>
  ) : ev.type === "kontrolle" ? (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${ev.kombiniertePillCls ?? "bg-surface-raised text-foreground-muted border-border"}`}>
      <CheckCircle2 size={10} />{ev.kombiniertePillLabel ?? t("sessionKontrolle")}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-sperrzeit)] bg-[var(--color-sperrzeit-bg)] border border-[var(--color-sperrzeit-border)] px-2 py-0.5 rounded-full">
      <Droplets size={10} />{t("sessionOrgasmus")}
    </span>
  );

  // Open / overdue kontrolle → banner style
  if (ev.captureHref) {
    const textCls = ev.isOverdue ? "text-warn-text" : "text-[var(--color-warn)]";
    return (
      <div className={`px-5 py-3 flex items-center gap-3 border-t border-b bg-warn-bg border-[var(--color-warn-border)] ${textCls}`}>
        {ev.isOverdue
          ? <AlertCircle size={20} className="flex-shrink-0 text-warn" />
          : <AlertTriangle size={20} className="flex-shrink-0 text-[var(--color-warn)]" />
        }
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
        className="w-full flex items-start gap-4 px-5 py-4 text-left hover:bg-surface-raised/60 transition active:bg-border-subtle/60 cursor-pointer"
      >
        {/* Photo */}
        <div className="shrink-0">
          {ev.imageUrl && !imgError ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ev.imageUrl} alt="" loading="lazy" className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl object-cover"
              onError={() => setImgError(true)} />
          ) : imgError ? (
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-surface-raised flex items-center justify-center">
              <ImageOff size={18} className="text-foreground-faint" />
            </div>
          ) : (
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-surface-raised flex items-center justify-center">
              {icon}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 pt-0.5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="mb-0.5 sm:hidden">{typePill}</div>
              <span className="block text-sm font-semibold text-foreground tabular-nums">{ev.dateStr}</span>
              <span className={`block text-xs tabular-nums ${ev.timeCorrected ? "text-warn font-medium" : "text-foreground-faint"}`}>{ev.timeStr}</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="hidden sm:inline-flex">{typePill}</span>
              {ev.captureHref && (
                <div onClick={(e) => e.stopPropagation()}>
                  <CaptureButton href={ev.captureHref} />
                </div>
              )}
            </div>
          </div>
          {ev.exifStr && <p className="text-xs text-[var(--color-warn)] mt-0.5">{tc("exifDate")}: {ev.exifStr}</p>}
          {ev.orgasmusArt && <p className="text-xs text-[var(--color-orgasm)] mt-0.5">{ev.orgasmusArt}</p>}
          {ev.kontrolleKommentar && <p className="text-xs text-[var(--color-warn)] mt-0.5 truncate">{ev.kontrolleKommentar}</p>}
          {ev.note && <p className="text-xs text-foreground-faint italic mt-0.5 truncate">„{ev.note}"</p>}
        </div>
      </div>

      {open && (
        <FullscreenImageModal
          src={ev.imageUrl ?? ""}
          alt=""
          onClose={() => setOpen(false)}
          title={typePill}
          panel={
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-xs text-foreground-faint uppercase tracking-wider font-semibold mb-0.5">{tc("dateTime")}</p>
                <p className="text-sm font-semibold text-foreground">{ev.dateStr}, {ev.timeStr}</p>
              </div>
              {ev.exifStr && (
                <div>
                  <p className="text-xs text-foreground-faint uppercase tracking-wider font-semibold mb-0.5">{tc("exifDate")}</p>
                  <p className="text-sm text-[var(--color-warn)]">{ev.exifStr}</p>
                </div>
              )}
              {ev.orgasmusArt && (
                <div>
                  <p className="text-xs text-foreground-faint uppercase tracking-wider font-semibold mb-0.5">{tc("type")}</p>
                  <p className="text-sm text-foreground-muted">{ev.orgasmusArt}</p>
                </div>
              )}
              {ev.deadlineStr && (
                <div>
                  <p className="text-xs text-foreground-faint uppercase tracking-wider font-semibold mb-0.5">{tc("deadline")}</p>
                  <p className="text-sm text-foreground-muted">{ev.deadlineStr}</p>
                </div>
              )}
              {ev.timeCorrectedSystemStr && (
                <div>
                  <p className="text-xs text-[var(--color-warn)] uppercase tracking-wider font-semibold mb-0.5">{tc("timeCorrected")}</p>
                  <p className="text-sm text-[var(--color-warn)]">{tc("specified")}: {ev.dateStr}, {ev.timeStr}</p>
                  <p className="text-sm text-[var(--color-warn)]">{tc("systemTime")}: {ev.timeCorrectedSystemStr}</p>
                </div>
              )}
              {ev.kontrolleKommentar && (
                <div>
                  <p className="text-xs text-foreground-faint uppercase tracking-wider font-semibold mb-0.5">{tc("instruction")}</p>
                  <p className="text-sm text-[var(--color-warn)]">{ev.kontrolleKommentar}</p>
                </div>
              )}
              {ev.note && (
                <div>
                  <p className="text-xs text-foreground-faint uppercase tracking-wider font-semibold mb-0.5">{tc("note")}</p>
                  <p className="text-sm text-foreground-muted italic">„{ev.note}"</p>
                </div>
              )}
            </div>
          }
        />
      )}
    </>
  );
}
