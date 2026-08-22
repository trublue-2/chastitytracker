import { Fragment, type ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import DashboardStack from "@/app/components/DashboardStack";
import type { BlockSurface } from "@/lib/dashboardBlockRegistry";
import type { ResolvedLayout } from "@/lib/dashboardLayout";

/**
 * Der Block-Stapel einer Seite: die Beschriftungen für den Bearbeiten-Modus und die gerenderten
 * Blöcke darunter.
 *
 * Die drei Seiten mit Stapel schrieben diese zehn Zeilen wortgleich hintereinander — dieselbe
 * `meta`-Abbildung, dieselbe Fragment-Schleife, derselbe Übersetzer. Hier stehen sie einmal.
 *
 * `nodes` kommt fertig herein statt als Tabelle: `renderStack` hat sie zu diesem Zeitpunkt schon
 * geladen, und diese Komponente soll nichts über Datenbeschaffung wissen. Ihr Gegenstück
 * `DashboardStack` ist der Client-Teil (Bearbeiten-Modus, Pfeile, Speichern).
 */
export default async function BlockStack<S extends BlockSurface>({
  layout,
  nodes,
}: {
  layout: ResolvedLayout<S>;
  /** Die sichtbaren Blöcke in ihrer Reihenfolge — üblicherweise das Ergebnis von `renderStack`. */
  nodes: { id: string; node: ReactNode }[];
}) {
  // Die Beschriftungen der Blöcke liegen im `dashboard`-Namensraum, auch die der Statistik-Seiten:
  // ein Block heisst auf jeder Oberfläche gleich.
  const t = await getTranslations("dashboard");

  return (
    <DashboardStack
      surface={layout.surface}
      meta={layout.all.map(({ block, hidden }) => ({
        id: block.id, label: t(block.labelKey), hidden, alwaysOn: block.alwaysOn,
      }))}
    >
      {nodes.map(({ id, node }) => (
        <Fragment key={id}>{node}</Fragment>
      ))}
    </DashboardStack>
  );
}
