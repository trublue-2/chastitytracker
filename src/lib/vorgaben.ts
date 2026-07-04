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
 * Sortiert alle Vorgaben eines Users **pro Kategorie** nach gueltigAb und
 * setzt die Enddaten automatisch: innerhalb einer Kategorie endet jede
 * Vorgabe am Startdatum der nächstneueren in derselben Kategorie. Die jeweils
 * neueste Vorgabe pro Kategorie bleibt offen (gueltigBis = null).
 *
 * Verkettung über Kategorien hinweg wäre falsch, weil pro Kategorie genau
 * eine Vorgabe gleichzeitig aktiv sein soll — KG und Plug laufen parallel.
 *
 * Ausnahme: Vorgaben mit `validUntilManual` (Keyholder hat bewusst ein Enddatum
 * gesetzt) werden NIE überschrieben — weder verkettet noch auf offen gesetzt.
 */
export async function reorderVorgabenDates(userId: string) {
  const all = await prisma.trainingVorgabe.findMany({
    where: { userId },
    orderBy: { gueltigAb: "asc" },
  });

  // Pro Kategorie gruppieren (null = legacy/pre-migration, eigene Gruppe).
  const byCategory = new Map<string | null, typeof all>();
  for (const v of all) {
    const key = v.categoryId ?? null;
    const list = byCategory.get(key) ?? [];
    list.push(v);
    byCategory.set(key, list);
  }

  for (const list of byCategory.values()) {
    for (let i = 0; i < list.length; i++) {
      if (list[i].validUntilManual) continue; // bewusst gesetztes Ende nie automatisch anfassen
      const expectedBis = list[i + 1]?.gueltigAb ?? null;
      const currentBis = list[i].gueltigBis;

      const changed =
        expectedBis === null
          ? currentBis !== null
          : currentBis === null || currentBis.getTime() !== expectedBis.getTime();

      if (changed) {
        await prisma.trainingVorgabe.update({
          where: { id: list[i].id },
          data: { gueltigBis: expectedBis },
        });
      }
    }
  }
}
