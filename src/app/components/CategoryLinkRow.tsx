import Link from "next/link";
import type { ReactNode } from "react";
import Card from "@/app/components/Card";
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
  /** Was rechts steht — Handlungswort, Dauer, Pille. */
  trailing,
}: {
  href: string;
  color: string;
  icon: string;
  name: string;
  subtitle?: ReactNode;
  subtitleTone?: "muted" | "warn";
  trailing?: ReactNode;
}) {
  return (
    <Card>
      <Link href={href} className="flex items-center gap-3 p-3 active:bg-background-subtle transition">
        <CategoryIconTile color={color} icon={icon} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{name}</p>
          {subtitle && (
            <p className={`text-xs ${subtitleTone === "warn" ? "text-warn-text" : "text-foreground-faint"}`}>
              {subtitle}
            </p>
          )}
        </div>
        {trailing && <span className="shrink-0 flex items-center gap-1 text-xs text-foreground-faint">{trailing}</span>}
      </Link>
    </Card>
  );
}
