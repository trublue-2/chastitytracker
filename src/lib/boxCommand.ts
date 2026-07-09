import type { Prisma } from "@prisma/client";
import { heimdallEnabled } from "@/lib/constants";

/**
 * Box-Kopplung (vereinheitlichtes Modell): die Heimdall-Box hat keine eigene Bedienung mehr, sondern
 * FOLGT den Verschluss-/Öffnen-Einträgen. Ein VERSCHLUSS-Eintrag setzt das Box-`lock`-Intent, ein
 * OEFFNEN-Eintrag das `open`-Intent. Die Box zieht das Kommando beim nächsten Sync (Pull) — der
 * Instant-Push via MQTT kommt in Stage 1 obendrauf. Reinigung ist kein Sondermechanismus mehr, sondern
 * schlicht OEFFNEN(Grund Reinigung) + späteres VERSCHLUSS; deshalb kein `pendingCommandRelockBy` hier.
 *
 * No-op ohne Heimdall (`HEIMDALL_SYNC_SECRET` nicht gesetzt) und für User ohne Box (updateMany trifft 0
 * Zeilen). Läuft in der Eintrags-Transaktion → atomar mit dem Eintrag.
 */
export async function setBoxCommandForUser(
  tx: Prisma.TransactionClient,
  userId: string,
  cmd: "lock" | "open",
): Promise<void> {
  if (!heimdallEnabled()) return;
  await tx.boxStatus.updateMany({
    where: { userId },
    data: { pendingCommand: cmd, pendingCommandAt: new Date(), pendingCommandRelockBy: null },
  });
}
