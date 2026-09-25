import { prisma } from "@/lib/prisma";
import { getIsLocked, type PrismaTx } from "@/lib/queries";
import { findPendingLockTx, findPendingOpenTx } from "@/lib/lockCommit";
import { boxIsPhysicallyLocked } from "@/lib/boxStatus";
import { serviceFail, type ServiceResult } from "@/lib/serviceResult";

type Db = PrismaTx | typeof prisma;

/**
 * **Ein Träger führt genau EINE Box** (Entscheid 25.09.2026).
 *
 * Der Schlüssel liegt in einer Box, nicht in zweien. Mit zweien liefen die Regeln auseinander: ein
 * Verschluss gälte mit dem Riegel IRGENDEINER Box, eine Öffnung aber nur mit der LockMeBox — der
 * Tracker stünde auf „verschlossen", während eine der beiden offen dasteht, oder hinge im Aufruf,
 * weil die andere nie bestätigt. Deshalb lehnt jede Kopplung eine zweite Box ab, gleich welcher
 * Art; gewechselt wird über {@link removeBox}.
 *
 * Geprüft wird nur beim ANLEGEN einer Zeile: eine bestehende Box meldet sich weiter wie immer.
 */
export async function otherBoxExists(db: Db, userId: string, boxId: string): Promise<boolean> {
  return !!(await db.boxStatus.findFirst({ where: { userId, NOT: { boxId } }, select: { id: true } }));
}

/**
 * Die Box des Trägers entfernen — der Weg zum Box-Wechsel. Nur, wenn nichts an ihr hängt:
 *
 * - der Träger ist offen und kein Verschluss- oder Öffnungs-Aufruf wartet;
 * - die Box hat kein unerledigtes Kommando;
 * - sie ist nicht zu (`boxIsPhysicallyLocked`: die IST-Meldung, ohne sie das SOLL). Bei der
 *   LockMeBox wäre das Passwort danach weg, eine verschlossene Box liesse sich nie mehr öffnen.
 *
 * Eine Heimdall-Box, die weiter synchronisiert, legt ihre Zeile beim nächsten Sync neu an, solange
 * keine andere Box da ist — abmelden muss man sie deshalb auch bei Heimdall.
 */
export async function removeBox(userId: string, boxId: string): Promise<ServiceResult<null>> {
  return prisma.$transaction(async (tx) => {
    const box = await tx.boxStatus.findUnique({
      where: { userId_boxId: { userId, boxId } },
      select: { id: true, pendingCommand: true, locked: true, reportedLocked: true },
    });
    if (!box) return serviceFail(404, "NOT_FOUND");
    const [locked, pendingLock, pendingOpen] = await Promise.all([
      getIsLocked(userId, tx),
      findPendingLockTx(tx, userId),
      findPendingOpenTx(tx, userId),
    ]);
    if (locked || pendingLock || pendingOpen || box.pendingCommand || boxIsPhysicallyLocked(box)) {
      return serviceFail(409, "BOX_REMOVE_BLOCKED");
    }
    await tx.boxStatus.delete({ where: { id: box.id } });
    return { ok: true as const, data: null };
  });
}
