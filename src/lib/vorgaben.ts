import { prisma } from "@/lib/prisma";

/** True if the vorgabe targets the built-in KG category (or is legacy pre-migration
 *  with no category). Centralizes the predicate so calendar/monthstats and goal-card
 *  filtering stay in sync. */
export function isKgVorgabe(v: {
  categoryId?: string | null;
  category?: { isBuiltIn: boolean } | null;
}): boolean {
  return !v.categoryId || v.category?.isBuiltIn === true;
}

/**
 * Sortiert alle Vorgaben eines Users nach gueltigAb und setzt die Enddaten
 * automatisch: jede Vorgabe endet am Startdatum der nächstneueren.
 * Die neueste Vorgabe bleibt offen (gueltigBis = null).
 */
export async function reorderVorgabenDates(userId: string) {
  const all = await prisma.trainingVorgabe.findMany({
    where: { userId },
    orderBy: { gueltigAb: "asc" },
  });

  for (let i = 0; i < all.length; i++) {
    const expectedBis = all[i + 1]?.gueltigAb ?? null;
    const currentBis = all[i].gueltigBis;

    const changed =
      expectedBis === null
        ? currentBis !== null
        : currentBis === null || currentBis.getTime() !== expectedBis.getTime();

    if (changed) {
      await prisma.trainingVorgabe.update({
        where: { id: all[i].id },
        data: { gueltigBis: expectedBis },
      });
    }
  }
}
