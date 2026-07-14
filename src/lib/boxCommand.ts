import type { Prisma } from "@prisma/client";
import { heimdallEnabled } from "@/lib/constants";

/**
 * Box-Kopplung (vereinheitlichtes Modell): die Heimdall-Box hat keine eigene Bedienung mehr, sondern
 * FOLGT den Verschluss-/Öffnen-Einträgen. Ein VERSCHLUSS-Eintrag setzt das Box-`lock`-Intent, ein
 * OEFFNEN-Eintrag das `open`-Intent. Die Box zieht das Kommando beim nächsten Sync (Pull); der
 * Instant-Push via MQTT (`heimdallNotify`) liegt obendrauf.
 *
 * Zwei Kommandos, keine Frist. Eine Reinigungspause ist OEFFNEN(Grund Reinigung) + späteres
 * VERSCHLUSS: das `open` setzt in Heimdall den aus der Sperrzeit gezogenen Dauerauftrag aus
 * (`holdOpen`), das `lock` nimmt ihn zurück. WANN wiederverschlossen sein muss, entscheidet allein
 * der Tracker (Strafbuch, `reinigungRelockDeadline`). Die Box bekommt diese Frist bewusst nicht —
 * sie würde den Riegel bei deren Ablauf unbeaufsichtigt zufahren.
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
    data: { pendingCommand: cmd, pendingCommandAt: new Date() },
  });
}

export interface BoxCommandInput {
  type: string;
  /** Liegt der Schlüssel in der Box? `undefined` = das Formular hat nicht gefragt (keine Box,
   *  Admin-Pfad, Alt-Client) → wie bisher: die Box folgt. */
  keyInBox?: boolean;
  /** Hat diese Öffnung eine Sperrzeit gebrochen? Dann war sie verboten. */
  brokeSperrzeit: boolean;
}

/**
 * Welches Kommando folgt aus diesem Eintrag? `null` = die Box rührt sich nicht.
 *
 * Zwei Fälle, in denen die Box dem Eintrag NICHT folgt — beide sind der Kern eigener Bugs:
 *
 * 1. **`keyInBox: false`** — der Sub verschliesst sich, behält den Schlüssel aber (Reise). Die Box
 *    verriegelte trotzdem und meldete `hardwareEnforced: true`, während der Schlüssel in seiner
 *    Tasche lag. Das Formular zwang ihn deshalb, „ja, in der Box" anzukreuzen, um überhaupt
 *    speichern zu können — es erzwang eine Falschangabe, um eine Falschmeldung zu erzeugen.
 * 2. **Gebrochene Sperrzeit** — die Öffnung war verboten. Sie zu dokumentieren darf sie nicht
 *    vollstrecken: der Riegel bleibt zu, der Eintrag steht trotzdem im Strafbuch.
 */
export function boxCommandForEntry({ type, keyInBox, brokeSperrzeit }: BoxCommandInput): "lock" | "open" | null {
  if (type === "VERSCHLUSS") return keyInBox === false ? null : "lock";
  if (type === "OEFFNEN") return brokeSperrzeit ? null : "open";
  return null;
}
