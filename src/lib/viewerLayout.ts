import { auth } from "@/lib/auth";
import { userRowCached } from "@/lib/dashboardData";
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
 * Gelesen wird über `userRowCached` — dieselbe gecachte Zeile, aus der die Blöcke ihre
 * Einstellungen nehmen. Auf dem Träger-Dashboard sind Betrachter und Betrachteter dieselbe Person,
 * also kostet die Konfiguration dort gar keine eigene Abfrage; auf den Keyholder-Sichten sind es
 * zwei verschiedene Zeilen und damit zwei Abfragen, wie zuvor.
 *
 * `viewerId` mitgeben, wenn die Seite die Sitzung ohnehin schon aufgelöst hat: `auth()` ist NICHT
 * gecacht, und ein zweiter Aufruf entschlüsselt nicht nur das Token erneut, sondern kann bei
 * abgelaufener Rollen-Prüfung auch noch zwei Abfragen nachziehen.
 */
export async function viewerLayout<S extends BlockSurface>(
  surface: S,
  viewerId?: string,
): Promise<ResolvedLayout<S>> {
  const id = viewerId ?? (await auth())?.user?.id;
  const raw = id ? (await userRowCached(id))?.dashboardLayout : null;
  return resolveLayout(parseDashboardLayout(raw), surface);
}
