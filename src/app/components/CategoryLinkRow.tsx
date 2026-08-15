import Link from "next/link";
import type { ReactNode } from "react";
import Card from "@/app/components/Card";
import RowAction from "@/app/components/RowAction";
import { CategoryIconTile } from "@/app/components/CategoryPhotoThumb";

/**
 * Eine antippbare Kategorie-Zeile des Dashboards: Symbol, Name, Nebenzeile, Handlung rechts.
 *
 * Extrahiert, weil dieselbe Zeile in drei Blöcken derselben Spalte stand (nicht getragen, unfertig,
 * laufend) und die Masse bereits auseinanderliefen — die neueste Kopie war höher und fetter als ihre
 * Nachbarn, ohne dass es dafür einen Grund gab. Rein darstellend und ohne Hooks, damit die
 * Server-Komponente sie genauso benutzen kann wie die Client-Blöcke.
 */
export default function CategoryLinkRow({
  href,
  color,
  icon,
  name,
  /** Nebenzeile unter dem Namen — Stunden, Hinweis, Zeitpunkt. */
  subtitle,
  /** Ton der Nebenzeile: `warn` für einen fehlenden Schritt, sonst gedämpft. */
  subtitleTone = "muted",
  /**
   * Das Handlungswort rechts — was ein Tap auf die Zeile bewirkt („Beginnen", „Gerät ergänzen").
   *
   * Der CHEVRON dahinter kommt aus {@link RowAction} und ist damit nicht mehr Sache des Aufrufers.
   * Genau daran hing er vorher: von den zwei Aufrufern setzte ihn einer und der andere nicht, dieselbe
   * Zeile war also je nach Dashboard-Block als antippbar zu erkennen — oder eben nicht.
   *
   * Icon und Wort bewusst GETRENNT und nicht als fertiger Knoten: so bildet die Zeile {@link RowAction}
   * eins zu eins ab. Zusammengeklebt beim Aufrufer wäre die Reihenfolge wieder dessen Sache.
   */
  actionIcon,
  actionLabel,
}: {
  href: string;
  color: string;
  icon: string;
  name: string;
  subtitle?: ReactNode;
  subtitleTone?: "muted" | "warn";
  actionIcon?: ReactNode;
  actionLabel?: string;
}) {
  return (
    <Card>
      {/* `hover:` FÜR DIE MAUS, das Handlungswort rechts für alle: die App läuft überwiegend auf dem
          Handy, und dort gibt es kein Hover — ein Klickziel, das seine Natur erst beim Überfahren
          verrät, wäre auf dem Hauptgerät gar nicht zu erkennen. */}
      <Link href={href} className="flex items-center gap-3 p-3 hover:bg-surface-raised active:bg-background-subtle transition">
        <CategoryIconTile color={color} icon={icon} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{name}</p>
          {subtitle && (
            <p className={`text-xs ${subtitleTone === "warn" ? "text-warn-text" : "text-foreground-faint"}`}>
              {subtitle}
            </p>
          )}
        </div>
        {actionLabel && <RowAction icon={actionIcon} label={actionLabel} />}
      </Link>
    </Card>
  );
}
