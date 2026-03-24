import { prisma } from "@/lib/prisma";

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
