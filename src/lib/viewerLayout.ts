import { cache } from "react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseDashboardLayout, resolveLayout, type ResolvedLayout } from "@/lib/dashboardLayout";
import type { BlockSurface } from "@/lib/dashboardBlockRegistry";

/**
 * Die Dashboard-Konfiguration des **Betrachters** — nicht die des angezeigten Trägers.
 *
 * Der Unterschied ist der ganze Punkt bei den Keyholder-Sichten: `/admin/users/[id]/stats` zeigt
 * die Statistik eines Subs, aber zusammengestellt hat sie die Keyholderin für sich. „Jeder
 * konfiguriert nur sich selbst" heisst deshalb hier: gelesen wird die Zeile des Angemeldeten,
 * nie die des Betrachteten.
 *
 * `cache()` pro Request — dieselbe Begründung wie bei `getControllableSubsCached`: Seite und
 * eingebettete Komponente fragen sonst zweimal dasselbe. Argumente bewusst primitiv, `cache()`
 * schlägt über ihre Identität nach.
 */
const readViewerLayoutRaw = cache(async (): Promise<string | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;
  const row = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { dashboardLayout: true },
  });
  return row?.dashboardLayout ?? null;
});

/** Die aufgelöste Konfiguration des Angemeldeten für EINE Oberfläche. */
export async function viewerLayout(surface: BlockSurface): Promise<ResolvedLayout> {
  return resolveLayout(parseDashboardLayout(await readViewerLayoutRaw()), surface);
}
