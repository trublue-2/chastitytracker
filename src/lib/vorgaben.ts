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

/** Die KANONISCHE Kategorie-Kennung einer Vorgabe — bewusst `isKgVorgabe` und nicht eine eigene
 *  Kategorie-Prüfung: KG kommt in ZWEI Schreibweisen vor (`categoryId: null` aus dem Bestand vor der
 *  Kategorie-Migration und über den MCP ohne `category`, sonst die id der eingebauten Kategorie).
 *  Die Lesepfade fassen beide längst zusammen; die Verkettung tat es nicht und liess sie darum nie
 *  einander beenden.
 *
 *  **Der Vorfall (23.08.2026):** ein neues KG-Ziel beendete das laufende vom 19.06. nicht,
 *  `list_training_goals` zeigte ZWEI aktive KG-Ziele nebeneinander. Zwei Schreibweisen, zwei
 *  Gruppen, keine gemeinsame Kette. `null` ist hier der Schlüssel der KG-Gruppe und bleibt
 *  eindeutig: jede andere Kategorie hat eine id.
 *
 *  Wer Vorgaben nach Kategorie GRUPPIERT oder FILTERT, vergleicht diese Kennung — nicht die rohe
 *  `categoryId`. `list_training_goals { category: "KG" }" liess sonst genau die Ziele weg, die auf
 *  dem anderen Weg entstanden waren. */
export function goalCategoryKey(v: Parameters<typeof isKgVorgabe>[0]): string | null {
  return isKgVorgabe(v) ? null : v.categoryId ?? null;
}

/**
 * Sortiert alle Vorgaben eines Users **pro Kategorie** nach gueltigAb und
 * setzt die Enddaten automatisch: innerhalb einer Kategorie endet jede
 * Vorgabe am Startdatum der nächstneueren in derselben Kategorie. Die jeweils
 * neueste Vorgabe pro Kategorie bleibt offen (gueltigBis = null).
 *
 * Verkettung über Kategorien hinweg wäre falsch, weil pro Kategorie genau
 * eine Vorgabe gleichzeitig aktiv sein soll — KG und Plug laufen parallel.
 * KG zählt dabei als EINE Kategorie, egal in welcher Schreibweise (siehe `goalCategoryKey`).
 *
 * Ausnahme: Vorgaben mit `validUntilManual` (Keyholder hat bewusst ein Enddatum
 * gesetzt) werden NIE überschrieben — weder verkettet noch auf offen gesetzt.
 */
export async function reorderVorgabenDates(userId: string) {
  // deletedAt:null (B-04): eine soft-gelöschte Vorgabe nimmt an der Datums-Verkettung nicht mehr
  // teil — sonst würde ihr gueltigBis weiter mitgeschrieben, obwohl sie aus jeder Sicht raus ist.
  const all = await prisma.trainingVorgabe.findMany({
    where: { userId, deletedAt: null },
    orderBy: { gueltigAb: "asc" },
    // `isBuiltIn` mitladen, damit `goalCategoryKey` dasselbe Prädikat benutzt wie die Lesepfade, statt
    // die Kategorie-Tabelle ein zweites Mal zu befragen und die Regel neu zu formulieren.
    include: { category: { select: { isBuiltIn: true } } },
  });

  // Pro Kategorie gruppieren — über DENSELBEN Schlüssel, mit dem `getActiveVorgabe` und
  // `isKgVorgabe` lesen: KG ist eine Kategorie, auch wenn sie in zwei Schreibweisen vorkommt.
  const byCategory = new Map<string | null, typeof all>();
  for (const v of all) {
    const key = goalCategoryKey(v);
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
