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
 * der Tracker (Strafbuch, `cleaningRelockDeadline`). Die Box bekommt diese Frist bewusst nicht —
 * sie würde den Riegel bei deren Ablauf unbeaufsichtigt zufahren.
 *
 * No-op ohne Heimdall (`HEIMDALL_SYNC_SECRET` nicht gesetzt) und für User ohne Box (updateMany trifft 0
 * Zeilen). Läuft in der Eintrags-Transaktion → atomar mit dem Eintrag.
 */
export async function setBoxCommandForUser(
  tx: Prisma.TransactionClient,
  userId: string,
  cmd: "lock" | "open",
): Promise<boolean> {
  // Gibt zurück, ob wirklich ein Kommando ansteht. Wer das aus einer Zeilenzahl daneben ableitet,
  // meldet auf einer Installation ohne Heimdall „Box beauftragt", wo nichts geschrieben wurde —
  // dieselbe Regel wie bei `boxCommandForEntry`: EINE Entscheidung speist Pull und Push.
  if (!heimdallEnabled()) return false;
  const { count } = await tx.boxStatus.updateMany({
    where: { userId },
    data: { pendingCommand: cmd, pendingCommandAt: new Date() },
  });
  return count > 0;
}

/**
 * Ein noch NICHT abgeholtes Kommando streichen — das Gegenstück zu {@link setBoxCommandForUser},
 * und aus demselben Grund hier: dieses Modul ist der einzige Schreiber des
 * `pendingCommand`/`pendingCommandAt`-Paares, samt Heimdall-Guard.
 *
 * `only` engt auf eine Richtung ein: wer einen Verschluss-AUFRUF zurücknimmt, streicht sein `lock` —
 * ein zwischenzeitlich gesetztes `open` gehört einem anderen Vorgang und bliebe stehen.
 *
 * **Was es NICHT kann:** eine Box, die das Kommando beim letzten Sync bereits gezogen hat, wartet
 * weiter auf den Knopf. Von hier aus ändert das nichts mehr — sie schliesst dann auf Knopfdruck
 * ohne Eintrag, derselbe Zustand wie bei jedem von Hand verriegelten Schloss.
 */
export async function clearBoxCommandForUser(
  tx: Prisma.TransactionClient,
  userId: string,
  only?: "lock" | "open",
): Promise<boolean> {
  if (!heimdallEnabled()) return false;
  const { count } = await tx.boxStatus.updateMany({
    where: { userId, ...(only ? { pendingCommand: only } : {}) },
    data: { pendingCommand: null, pendingCommandAt: null },
  });
  return count > 0;
}

export interface BoxCommandInput {
  type: string;
  /** Liegt der Schlüssel in der Box? `null`/`undefined` = das Formular hat nicht gefragt (keine Box,
   *  Admin-Pfad, Alt-Client) → wie bisher: die Box folgt. */
  keyInBox?: boolean | null;
  /** Hat diese Öffnung eine Sperrzeit gebrochen? Dann war sie verboten. */
  brokeLockPeriod: boolean;
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
export function boxCommandForEntry({ type, keyInBox, brokeLockPeriod }: BoxCommandInput): "lock" | "open" | null {
  // Nur ein ausdrückliches `false` hält die Box zurück — `null`/`undefined` heisst „nicht erklärt".
  if (type === "VERSCHLUSS") return keyInBox === false ? null : "lock";
  if (type === "OEFFNEN") return brokeLockPeriod ? null : "open";
  return null;
}
