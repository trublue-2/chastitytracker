import { createPrismaMock } from "@/test/prismaMock";

/**
 * TEST-ONLY (wie `prismaMock.ts`, aus demselben Grund).
 *
 * Der Posteingang als STAND statt als Aufrufprotokoll: ein Prisma-Doppelgänger, dessen
 * `message`-Modell auf einem Array im Speicher arbeitet.
 *
 * WARUM SO. Die Zusagen rund um Nachrichten sind Aussagen über den Bestand — welche Zeile steht am
 * Ende da, von wem, und ist es dieselbe wie vorher. Ein Mock, der nur die Aufrufe mitschreibt, kann
 * das nicht beantworten: er sähe die Einmal-Zusage (`once`, ein `findFirst` gegen den Bestand) nie
 * greifen und das Löschen beim Wieder-Eröffnen nie wirken.
 *
 * Geteilt von `offenseDismissedNotice.test.ts` und `judgeOffenseParity.test.ts` — beide brauchen
 * genau diese Tabelle, und zwei Nachbauten desselben Doppelgängers laufen genauso auseinander wie
 * zwei Umsetzungen desselben Vorgangs.
 */

/** Eine Zeile in `Message`, auf die Spalten reduziert, um die es in diesen Tests geht. */
export type MessageRow = {
  id: string;
  subjectUserId: string;
  audience: string;
  bodyKey: string | null;
  senderKind: string;
  senderName: string | null;
  refEntityType: string | null;
  refEntityId: string | null;
  /** Vom Träger weggewischt (soft-dismiss statt Löschen) — fehlt an einer Zeile, gilt sie als offen. */
  subDismissedAt?: Date | null;
};

/**
 * Die FESTSTELLUNGS-Meldung eines Vergehens, wie sie im Posteingang des Trägers steht — genau die
 * Zeile, die `offenseWasAnnounced` liest.
 *
 * Geteilt, weil sie die Vorbedingung JEDER Verwerfungs-Zusage ist: ohne sie meldet der Dienst das
 * Ende einer Geschichte, die der Posteingang nie erzählt hat, und ein Test ohne diese Zeile prüft
 * versehentlich den Schweige-Fall. Zwei Nachbauten derselben Zeile laufen genauso auseinander wie
 * zwei Nachbauten des Doppelgängers oben.
 */
export function offenseAnnouncement(subjectUserId: string, refId: string): MessageRow {
  return {
    id: "announce", subjectUserId, audience: "sub",
    bodyKey: "offenseDetectedMessage", senderKind: "system", senderName: null,
    refEntityType: "detectedOffense", refEntityId: refId,
  };
}

/** Die Where-Formen dieser Tests: Gleichheit je Spalte, `{ in: [...] }`, `{ not: v }`, `null`
 *  (trifft auch die fehlende Spalte) und ein `OR` von Teil-Wheres. Genug, um den Soft-Dismiss-Pfad
 *  (`deleteMessages`) und den Ausblend-Filter (`subDismissedAt: null`) mitzuprüfen. */
const matches = (row: MessageRow, where: Record<string, unknown> = {}): boolean =>
  Object.entries(where).every(([col, cond]) => {
    if (col === "OR") return (cond as Record<string, unknown>[]).some((sub) => matches(row, sub));
    const value = row[col as keyof MessageRow];
    if (cond === null) return value === null || value === undefined;
    if (cond && typeof cond === "object" && "in" in cond) return (cond as { in: unknown[] }).in.includes(value);
    if (cond && typeof cond === "object" && "not" in cond) return value !== (cond as { not: unknown }).not;
    return value === cond;
  });

/**
 * Baut den Doppelgänger über `inbox` (der Aufrufer hält das Array — als `vi.hoisted`, weil eine
 * `vi.mock`-Fabrik vor den Imports läuft).
 *
 * Zurück kommt ein PROXY und keine Kopie der Modelle: nur so ist `prisma.strafeRecord.upsert` im
 * Test dieselbe Funktion, die der Produktivcode aufruft. `$transaction` läuft gegen denselben
 * Doppelgänger — geprüft werden Nachrichten und Urteile, nicht die Isolation.
 */
export function createMessageTablePrisma(inbox: MessageRow[]): unknown {
  const models = createPrismaMock();

  // Aus einem Zähler, der nur steigt — nie aus der aktuellen Zeilenzahl: eine gelöschte Zeile gäbe
  // ihre id sonst an die nächste weiter. Daran hängt der Gelesen-Stand (`MessageRead.messageId`,
  // Cascade), und eine wiederverwendete id wäre genau die Verwechslung, die diese Tests ausschliessen.
  let seq = 0;
  models.message.create.mockImplementation(async ({ data }: { data: Omit<MessageRow, "id"> }) => {
    const row = { id: `m${++seq}`, ...data };
    inbox.push(row);
    return row;
  });
  models.message.findFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
    inbox.find((r) => matches(r, where)) ?? null);
  models.message.findMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
    inbox.filter((r) => matches(r, where)));
  models.message.deleteMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
    const keep = inbox.filter((r) => !matches(r, where));
    const count = inbox.length - keep.length;
    inbox.splice(0, inbox.length, ...keep);
    return { count };
  });
  models.message.updateMany.mockImplementation(
    async ({ where, data }: { where: Record<string, unknown>; data: Partial<MessageRow> }) => {
      let count = 0;
      for (const r of inbox) if (matches(r, where)) { Object.assign(r, data); count++; }
      return { count };
    },
  );

  const prisma: unknown = new Proxy(models, {
    get: (target, prop) =>
      prop === "$transaction"
        ? (fn: (tx: unknown) => unknown) => fn(prisma)
        : Reflect.get(target, prop),
  });
  return prisma;
}
