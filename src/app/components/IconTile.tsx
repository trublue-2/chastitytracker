import type { ReactNode } from "react";

/** Kachelgrössen — dieselbe Skala wie `CategoryIconTile` (`CategoryPhotoThumb.tsx`), damit die
 *  neutrale und die eingefärbte Kachel in derselben Liste gleich gross sind. Das Symbol darin
 *  bleibt in beiden Fällen `size-4`. */
type TileSize = "sm" | "md";

const BOX: Record<TileSize, string> = { sm: "size-8", md: "size-9" };

/**
 * Die neutrale Symbol-Kachel der Karten und Listenzeilen — graues Quadrat, Symbol darin.
 *
 * Das neutrale Gegenstück zu `CategoryIconTile`: gleiche Geometrie, aber ohne Kategorie-Farbe. Die
 * Klassenkette stand vorher wortgleich in `TaskCard`, `TaskList` und (mit dem Strafen-Block) an zwei
 * weiteren Stellen — vier Kopien in zwei Grössen, die beim nächsten Anfassen des Kartenrahmens
 * auseinanderlaufen.
 *
 * `md` (size-9) für Karten, `sm` (size-8) für Listenzeilen.
 */
export default function IconTile({ icon, size = "md" }: { icon: ReactNode; size?: TileSize }) {
  return (
    <span
      className={`${BOX[size]} shrink-0 rounded-lg flex items-center justify-center bg-surface-raised text-foreground-muted`}
      aria-hidden
    >
      {icon}
    </span>
  );
}
