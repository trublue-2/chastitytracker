"use client";

import { useState } from "react";
import CategoryIconRender from "@/app/components/CategoryIcon";
import { categoryStyle } from "@/lib/categoryConstants";

/** Kachelgrössen der Trage-Listen. Das Symbol darin bleibt in beiden Fällen `size-4`. */
type ThumbSize = "sm" | "md";

const BOX: Record<ThumbSize, string> = { sm: "size-8", md: "size-9" };

/**
 * Die eingefärbte Kategorie-Kachel — Symbol auf Kategorie-Hintergrund.
 *
 * Eigener Export, weil sie auch ohne Foto-Kontext gebraucht wird (`InactiveCategories`) und sonst
 * eine dritte byte-gleiche Kopie entstünde.
 */
export function CategoryIconTile({
  color,
  icon,
  size = "md",
}: {
  color: string;
  icon: string;
  size?: ThumbSize;
}) {
  const style = categoryStyle(color);
  return (
    <div
      className={`${BOX[size]} rounded-lg flex items-center justify-center shrink-0`}
      style={{ backgroundColor: style.backgroundColor, color: style.color }}
      aria-hidden
    >
      <CategoryIconRender name={icon} className="size-4" />
    </div>
  );
}

/**
 * Foto einer Trage-Session als Thumbnail, mit der Kategorie-Kachel als Rückfall.
 *
 * Extrahiert, weil derselbe Block in der Liste abgeschlossener Sessions und in der Karte der
 * laufenden Session stand — bis auf Grösse und die Frage, ob er klickbar ist, Zeichen für Zeichen
 * gleich. Bewusst NICHT über `ImageViewer`: dessen Vollbild-Plakette ist für grosse Bilder gemacht
 * und würde ein 32-px-Thumbnail zur Hälfte verdecken.
 *
 * Der Ladefehler-Zustand liegt hier, je Instanz, als schlichtes Boolean — wie in `PairRow` und
 * `SessionEventRow`. Die aufrufenden Listen brauchten dafür vorher je ein Set von ids; das war eine
 * eigene Zustandsform für ein Problem, das jede Kachel für sich hat.
 */
export default function CategoryPhotoThumb({
  imageUrl,
  categoryColor,
  categoryIcon,
  size = "md",
  onClick,
  label,
}: {
  imageUrl?: string | null;
  categoryColor: string;
  categoryIcon: string;
  size?: ThumbSize;
  /** Ohne Handler bleibt es reine Anzeige — nötig dort, wo die ganze Zeile schon ein Link ist
   *  (ein Knopf in einem Link wäre ungültig verschachtelt). */
  onClick?: () => void;
  /** Beschriftung des Knopfes; nur mit `onClick` sinnvoll. */
  label?: string;
}) {
  // Gemerkt wird die URL, die NICHT lud — nicht ein blosses „kaputt". Ein Boolean bliebe stehen,
  // wenn dieselbe Kachel-Instanz später ein anderes Foto bekommt: die laufende Karte ist je Kategorie
  // gekeyt, überlebt also einen Session-Wechsel, und ein intaktes Nachfolge-Foto wäre für immer
  // unsichtbar. Mit der URL als Merkmal setzt sich der Rückfall von selbst zurück.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (!imageUrl || failedUrl === imageUrl) {
    return <CategoryIconTile color={categoryColor} icon={categoryIcon} size={size} />;
  }

  const img = (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={imageUrl}
      alt=""
      loading="lazy"
      className="w-full h-full object-cover"
      onError={() => setFailedUrl(imageUrl)}
    />
  );

  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`shrink-0 ${BOX[size]} rounded-lg overflow-hidden hover:opacity-80 transition`}
    >
      {img}
    </button>
  ) : (
    <div className={`shrink-0 ${BOX[size]} rounded-lg overflow-hidden`}>{img}</div>
  );
}
