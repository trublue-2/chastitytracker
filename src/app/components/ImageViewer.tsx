"use client";

import { useState } from "react";
import Image from "next/image";
import { X, ImageOff } from "lucide-react";
import { useTranslations } from "next-intl";

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
  const [error, setError] = useState(false);

  if (error) {
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
          onError={() => setError(true)}
        />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black flex flex-col cursor-pointer"
          onClick={() => setOpen(false)}
        >
          {/* Back button – safe area aware */}
          <div
            className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
            style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 text-white/80 active:text-white transition p-2 -m-2"
            >
              <X size={26} />
              <span className="text-base font-medium">{t("close")}</span>
            </button>
          </div>

          {/* Image */}
          <div className="flex-1 min-h-0 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={resolvedAlt}
              className="max-w-full max-h-full object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
              onError={() => setError(true)}
            />
          </div>

          {/* Kommentar footer */}
          {kommentar && (
            <div className="flex-shrink-0 bg-white/10 px-4 py-3" onClick={(e) => e.stopPropagation()}>
              <p className="text-sm text-white/90">{kommentar}</p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
