"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";

const SIZES = {
  sm: "w-10 h-10",
  md: "w-12 h-12",
  lg: "w-14 h-14 sm:w-16 sm:h-16",
} as const;

/**
 * Quadratische Foto-Vorschau mit Platzhalter, wenn das Bild nicht lädt. Denselben Rumpf hatten
 * zuletzt vier Stellen je eigen (Kontroll-Liste des Subs, Kontroll-Liste des Keyholders,
 * Session-Zeile, Foto-Auswahl) — ein fehlendes `onError` fiel dabei erst auf, wenn eine Datei
 * wirklich fehlte.
 *
 * Bewusst NUR die Darstellung: Klickverhalten und Modal bleiben beim Aufrufer, die unterscheiden
 * sich je Liste.
 */
export default function PhotoThumb({
  url,
  alt,
  size = "sm",
  className = "",
}: {
  url: string;
  alt: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const [imgError, setImgError] = useState(false);
  const box = `${SIZES[size]} rounded-xl ${className}`;

  if (imgError) {
    return (
      <div className={`${box} bg-surface-raised flex items-center justify-center`}>
        <ImageOff size={16} className="text-foreground-faint" />
      </div>
    );
  }
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img src={url} alt={alt} loading="lazy" onError={() => setImgError(true)}
      className={`${box} object-cover`} />
  );
}
