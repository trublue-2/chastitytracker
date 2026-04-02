"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { X, ImageOff } from "lucide-react";
import { useTranslations } from "next-intl";

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
 * Rendered via React Portal on document.body so no parent stacking context
 * (sticky headers, backdrop-filter navbars) can clip it.
 *
 * Inline styles are intentional for the backdrop + z-index: Tailwind CSS v4
 * resolves bg-black as var(--color-black) which can be overridden by data-theme
 * wrappers. Using #000 literals and numeric z-index avoids that entirely.
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

  // Mount guard: createPortal requires document to be available.
  useEffect(() => {
    setMounted(true);
  }, []);

  // Scroll-lock: prevent the page behind from scrolling while modal is open.
  // Also hides the body scrollbar so the underlying page doesn't shift.
  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mounted]);

  // Keyboard: close on Escape.
  useEffect(() => {
    if (!mounted) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [mounted, onClose]);

  if (!mounted) return null;

  const modal = (
    /*
     * Inline backgroundColor + zIndex are load-bearing.
     * - backgroundColor: '#000' bypasses Tailwind v4's CSS var resolution
     *   (bg-black → var(--color-black)) which can resolve to undefined inside
     *   a data-theme wrapper, leaving the backdrop transparent.
     * - zIndex: 99999 as a number avoids any purge / specificity issues with
     *   Tailwind's z-[9999] utility. It must beat z-40 (bottom navs) and
     *   z-30 (sticky headers).
     * - isolation: 'isolate' forces a new stacking context on the modal root
     *   so nothing inside can accidentally leak behind the backdrop.
     */
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        backgroundColor: "#000",
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
        {!imgError && src && (
          <PinchZoomImage src={src} alt={alt} onError={() => setImgError(true)} />
        )}
        {(imgError || !src) && (
          <div className="flex flex-col items-center gap-3 text-white/40">
            <ImageOff size={48} />
            <span className="text-sm">Bild nicht verfügbar</span>
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
}

export default function ImageViewer({ src, alt, width, height, className, kommentar }: Props) {
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
      <button type="button" onClick={() => setOpen(true)} className="block">
        <Image
          src={src}
          alt={resolvedAlt}
          width={width}
          height={height}
          className={className}
          unoptimized
          onError={() => setThumbError(true)}
        />
      </button>

      {open && (
        <FullscreenImageModal
          src={src}
          alt={resolvedAlt}
          onClose={() => setOpen(false)}
          panel={
            kommentar ? (
              <p className="text-sm text-foreground-muted">{kommentar}</p>
            ) : undefined
          }
        />
      )}
    </>
  );
}
