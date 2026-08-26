"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { X, ImageOff, Maximize2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useDialogBehaviour } from "@/app/hooks/useDialogBehaviour";

// ─── Pinch-zoom image ────────────────────────────────────────────────────────

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

// ─── Fullscreen modal ─────────────────────────────────────────────────────────

/**
 * Reusable fullscreen image overlay.
 *
 * Rendered via React Portal on document.body: that lifts the overlay out of
 * every ancestor of the call site, so none can confine its z-index inside a
 * stacking context or capture its `position: fixed` as containing block.
 * No call site does either today — the portal is what keeps it that way
 * without having to re-audit them.
 *
 * @param title  Optional node shown left of the close button.
 * @param panel  Optional content rendered in the bottom sheet panel.
 */
export function FullscreenImageModal({
  src,
  alt,
  onClose,
  title,
  panel,
}: {
  src: string;
  alt: string;
  onClose: () => void;
  title?: React.ReactNode;
  panel?: React.ReactNode;
}) {
  const t = useTranslations("common");
  const [imgError, setImgError] = useState(false);
  const [mounted, setMounted] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Fehlerzustand gehört zum BILD, nicht zum Modal: seit das Panel zwischen Eintrags- und Box-Foto
  // umschalten kann, wechselt `src` bei offenem Modal. Ohne diesen Reset bliebe „Bild nicht
  // verfügbar" nach einem gescheiterten ersten Bild stehen — und das vorhandene zweite Foto wäre
  // nur über Schliessen und neu Öffnen erreichbar.
  useEffect(() => { setImgError(false); }, [src]);

  // Mount guard: createPortal requires document to be available.
  useEffect(() => {
    setMounted(true);
  }, []);

  // Escape, Scroll-Sperre, Autofokus, Fokus-Falle und Fokus-Rückgabe über den geteilten Hook.
  //
  // Hier stand der VIERTE Nachbau derselben Mechanik, und der folgenreichste: das Vollbild liegt
  // auf `z-index: 99999` über allem, hatte aber als einziger Dialog gar keine Fokus-Falle. Wer es
  // mit der Tastatur öffnete, tabbte anschliessend unsichtbar durch die Seite dahinter. Die eigene
  // Scroll-Sperre merkte sich ausserdem ihren eigenen Vorwert — lag das Vollbild über einem Sheet
  // (Aufgaben-Nachweis: `TaskList` → `TaskCard`), gab sie beim Schliessen `"hidden"` zurück und die
  // Seite liess sich bis zum Neuladen nicht mehr scrollen. Der Hook zählt die offenen Dialoge
  // stattdessen an einer Stelle.
  useDialogBehaviour(dialogRef, { open: mounted, onClose });

  if (!mounted) return null;

  const modal = (
    /*
     * The root is styled inline, but NOT because Tailwind would fail here —
     * every property below has a utility equivalent (fixed, inset-0, flex,
     * flex-col, isolate, bg-black, z-[99999]). Load-bearing is only the
     * z-index VALUE:
     * - zIndex 99999 must stay above everything that can share the screen:
     *   z-50 (sheets, menus, PhotoCapture — the components a thumbnail gets
     *   opened from), z-40 (bottom navs), z-30 (sticky headers) and the two
     *   z-[9999] portals (ToastProvider, ActionModal).
     * - isolation: 'isolate' is belt-and-braces: a position:fixed element with
     *   a non-auto z-index already opens its own stacking context.
     * - backgroundColor '#000' is a leftover, not a workaround. The overlay
     *   this replaced (v2.2.4) used plain bg-black and worked: --color-black
     *   comes from Tailwind's own theme layer, and no [data-theme] block in
     *   globals.css redefines it. bg-black is the Design-System-conform
     *   spelling and would behave identically.
     */
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      /* `tabIndex={-1}`: der Hook gibt dem Dialog selbst den Fokus, damit der Screenreader beim
         Öffnen Rolle und Bildbeschreibung ansagt. */
      tabIndex={-1}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        backgroundColor: "var(--lightbox-bg)",
        display: "flex",
        flexDirection: "column",
        isolation: "isolate",
        // Respect iOS safe areas inside the modal itself.
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {/* Image area — tap backdrop to close */}
      <div
        style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", overflow: "hidden" }}
        onClick={onClose}
      >
        {/* `key={src}` setzt auch Zoom und Verschiebung zurück — sonst landete man im zweiten
            Foto in der Zoom-Position des ersten. */}
        {!imgError && src && (
          <PinchZoomImage key={src} src={src} alt={alt} onError={() => setImgError(true)} />
        )}
        {(imgError || !src) && (
          <div className="flex flex-col items-center gap-3 text-white/40">
            <ImageOff size={48} />
            <span className="text-sm">{t("imageUnavailable")}</span>
          </div>
        )}
      </div>

      {/*
       * Bottom sheet — stopPropagation prevents the tap-to-close from
       * triggering when the user interacts with the panel content.
       *
       * The close button lives here (not at the top of the screen) so it is
       * always reachable regardless of how many sticky headers the current
       * page has. On the admin/users/[id] route there are three stacked
       * sticky bars (AdminHeader z-30 + UserContextBar z-20 + UserSubNav
       * z-10), which collectively occupy ~160px at the top of the viewport.
       */}
      <div
        className="flex-shrink-0 bg-surface rounded-t-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title row + close button */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <span className="text-sm font-medium text-foreground-muted">
            {title}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 text-foreground-muted active:text-foreground transition-colors p-2 -mr-2 rounded-xl"
            aria-label={t("close")}
          >
            <X size={20} />
            <span className="text-sm font-medium">{t("close")}</span>
          </button>
        </div>

        {/* Optional panel content */}
        {panel && <div className="px-5 pb-5">{panel}</div>}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

// ─── Thumbnail + modal combo (used in Kontrolle lists) ───────────────────────

interface Props {
  src: string;
  alt?: string;
  width: number;
  height: number;
  className?: string;
  kommentar?: string | null;
  modalTitle?: React.ReactNode;
  modalPanel?: React.ReactNode;
}

export default function ImageViewer({ src, alt, width, height, className, kommentar, modalTitle, modalPanel }: Props) {
  const t = useTranslations("common");
  const resolvedAlt = alt ?? t("photo");
  const [open, setOpen] = useState(false);
  const [thumbError, setThumbError] = useState(false);

  if (thumbError) {
    return (
      <div
        className={`${className} flex items-center justify-center bg-surface-raised text-foreground-faint rounded-xl`}
        title={t("photoUnavailable")}
      >
        <ImageOff size={Math.min(width, height) / 2.5} />
      </div>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="relative block group">
        <Image
          src={src}
          alt={resolvedAlt}
          width={width}
          height={height}
          className={className}
          unoptimized
          onError={() => setThumbError(true)}
        />
        <span className="absolute bottom-0.5 right-0.5 w-5 h-5 flex items-center justify-center rounded-md bg-black/50 text-white opacity-70 group-hover:opacity-100 transition-opacity pointer-events-none">
          <Maximize2 size={11} strokeWidth={2.5} />
        </span>
      </button>

      {open && (
        <FullscreenImageModal
          src={src}
          alt={resolvedAlt}
          onClose={() => setOpen(false)}
          title={modalTitle}
          panel={
            modalPanel ?? (kommentar ? (
              <p className="text-sm text-foreground-muted">{kommentar}</p>
            ) : undefined)
          }
        />
      )}
    </>
  );
}
