import { prisma } from "@/lib/prisma";
import { getIsLocked, getInterruptedLockPeriod } from "@/lib/entries/queries";
import { boxIsPhysicallyLocked } from "@/lib/box/boxStatus";
import { setBoxCommandForUser } from "@/lib/box/boxCommand";
import { announceBoxCommand } from "@/lib/box/boxCommandNotify";
import { serviceFail, type ServiceResult } from "@/lib/serviceResult";
import type { ServiceErrorCode } from "@/lib/serviceErrorCodes";

/** Was die Frage von einer Box wissen muss. */
export type ReopenProbe = { kind: string; locked: boolean; reportedLocked: boolean | null; pendingCommand: string | null };

/**
 * Braucht DIESE Box einen neuen Öffnen-Befehl? Nur die LockMeBox, und nur ohne wartenden Befehl.
 *
 * Bei der LockMeBox bleibt `pendingCommand` stehen, bis die Box den Riegel dort hat, wo er sein soll
 * (`lockmeboxService.ts`) — „Tracker offen, Riegel zu, KEIN Befehl" ist dort also immer ein
 * verlorener Befehl. Bei Heimdall ist es der Normalfall: der Sync zieht das Kommando ab, und die Box
 * wartet danach auf den Knopf (`openArmed`) — dort wäre dieselbe Anzeige ein Fehlalarm.
 */
export const boxNeedsReopen = (b: ReopenProbe): boolean =>
  b.kind === "lockmebox" && b.pendingCommand !== "open" && boxIsPhysicallyLocked(b);

/**
 * Der Reparaturweg für genau einen Zustand: der Tracker steht auf OFFEN, die Box meldet den Riegel
 * aber ZU. Das Gegenstück zu `/api/box/relock` (Tracker zu, Box offen).
 *
 * Er entsteht, wenn der Befehl die Box nie erreicht hat — ein Eintrag ohne Kommando, ein verlorenes
 * `pendingCommand`, eine von Hand zugedrückte Box. Ohne diesen Weg bliebe der Träger „offen", mit dem
 * Schlüssel in einer Box, die nicht aufgeht, und niemand könnte etwas dagegen tun.
 *
 * `null` = die Box darf neu beauftragt werden, sonst der Grund. EINE Ableitung für den Dienst unten
 * UND die Anzeige (`/api/box` → `reopenable`): zwei Fassungen derselben Bedingung zeigten einen Knopf,
 * den der Server dann ablehnt.
 *
 * **Eine Sperrbruch-Öffnung hält die Box mit Absicht zu** (`boxCommandForEntry`: das Dokumentieren des
 * Verstosses darf ihn nicht vollstrecken). Ohne `BOX_REOPEN_HELD` höbe dieser Knopf die Strafe auf,
 * indem der Träger sich selbst öffnet — `getInterruptedLockPeriod` ist dieselbe Frage, die die Anzeige
 * „Sperrzeit aufgebrochen" stellt.
 */
export async function boxReopenBlockReason(
  userId: string,
  boxes: ReopenProbe[],
): Promise<Extract<ServiceErrorCode, `BOX_REOPEN_${string}`> | null> {
  // Billigste Frage zuerst: ohne Box, die ZU meldet, gibt es nichts zu reparieren.
  if (!boxes.some(boxNeedsReopen)) return "BOX_REOPEN_NOT_LOCKED";
  if (await getIsLocked(userId)) return "BOX_REOPEN_NOT_OPEN";
  if (await getInterruptedLockPeriod(userId, new Date())) return "BOX_REOPEN_HELD";
  return null;
}

/** Den Öffnen-Befehl der Box neu setzen. Ausgeführt wird er erst, wenn sich das Handy des Trägers an
 *  der LockMeBox verbindet (`lockmeboxService.ts`). */
export async function requestBoxReopen(userId: string): Promise<ServiceResult<null>> {
  const boxes = await prisma.boxStatus.findMany({ where: { userId }, select: { kind: true, locked: true, reportedLocked: true, pendingCommand: true } });
  const blocked = await boxReopenBlockReason(userId, boxes);
  if (blocked) return serviceFail(409, blocked);
  // Angesagt wird nur, was wirklich gesetzt wurde — dieselbe Regel wie auf dem Eintrags-Pfad.
  if (await setBoxCommandForUser(prisma, userId, "open")) announceBoxCommand(userId, "open");
  return { ok: true, data: null };
}
