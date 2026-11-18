import { prisma } from "@/lib/prisma";
import { boxReportedLockedSafe, commitPendingOpenSafe } from "@/lib/lockCommit";
import { toPendingCommand, type BoxKind } from "@/lib/boxStatus";
import { nextLockmeboxCommand, parseLockmeboxStatus, type LockmeboxRelayInput, type LockmeboxRelayResult } from "@/lib/lockmeboxProtocol";
import { clearBoxCommandForUser } from "@/lib/boxCommand";
import { boxPairedElsewhere, otherBoxExists } from "@/lib/boxPairing";
import { isUniqueConstraintOn } from "@/lib/prismaErrors";
import { encryptLockmeboxCommand, generateLockmeboxPassword, lockmeboxPlaintext } from "@/lib/lockmebox";
import { serviceFail, type ServiceResult } from "@/lib/serviceResult";

/**
 * Die Handy-Brücke zur LockMeBox mit Werks-Firmware.
 *
 * Die Box hat kein Netz, nur Bluetooth. Das Handy des Trägers ist deshalb ein reines Relais: es
 * reicht die Statuszeilen der Box hierher und schreibt die Befehle, die es von hier bekommt, zurück
 * an die Box. Es entscheidet nichts und kennt weder den Schlüssel noch das Passwort.
 *
 * Die Box FOLGT den Einträgen wie die Heimdall-Box: ein Verschluss-Eintrag setzt `pendingCommand =
 * "lock"`, eine erlaubte Öffnung `"open"` (`boxCommand.ts`). Neu ist nur der Weg: statt dass die Box
 * das Kommando beim Sync abholt, holt es das Handy, sobald jemand an der Box auf „Verbinden" tippt.
 *
 * Ablauf einer Sitzung, je Schritt ein Aufruf:
 *   1. ohne Zeile → Antwort ist der Status-Befehl (`S`)
 *   2. mit Statuszeile → Zustand übernehmen; Antwort ist der anstehende Befehl oder nichts
 *   3. mit der Antwort auf diesen Befehl → Zustand übernehmen, Kommando als erledigt streichen
 *
 * Gekoppelt wird beim ersten Kontakt: eine unbekannte Box bekommt eine Zeile samt Passwort — sofern
 * der Träger noch keine andere Box führt (eine Box je Träger, `boxPairing.ts`).
 */

/** Das Passwort dieser Box (`LockmeboxSecret`): das hinterlegte, sonst ein neues. `upsert` mit leerem
 *  Update — zwei gleichzeitige Erstkontakte einigen sich auf EIN Passwort; emuliert Prisma das upsert
 *  statt `ON CONFLICT`, fängt der Rückfall den Verlierer des Wettlaufs. */
async function lockmeboxSecretFor(boxId: string): Promise<string> {
  const select = { password: true } as const;
  const { password } = await prisma.lockmeboxSecret
    .upsert({ where: { boxId }, create: { boxId, password: generateLockmeboxPassword() }, update: {}, select })
    .catch((e) => {
      if (!isUniqueConstraintOn(e, "boxId")) throw e;
      return prisma.lockmeboxSecret.findUniqueOrThrow({ where: { boxId }, select });
    });
  return password;
}

export async function lockmeboxRelayStep(
  userId: string,
  input: LockmeboxRelayInput,
): Promise<ServiceResult<LockmeboxRelayResult>> {
  const status = input.line === null ? null : parseLockmeboxStatus(input.line);
  if (input.line !== null && !status) return serviceFail(400, "BOX_BLE_BAD_STATUS");

  const key = { userId_boxId: { userId, boxId: input.boxId } };
  const now = new Date();
  // Koppeln beim ersten Kontakt — nur ohne andere Box (`otherBoxExists`) und nur, wenn die Box keinem
  // anderen gehört. Das Passwort gehört der Box (`lockmeboxSecretFor`, Begründung am Schema-Modell).
  const select = { kind: true, lockPassword: true, pendingCommand: true } as const;
  let box = await prisma.boxStatus.findUnique({ where: key, select });
  if (!box) {
    if (await otherBoxExists(prisma, userId, input.boxId)) return serviceFail(409, "BOX_ONE_PER_USER");
    if (await boxPairedElsewhere(prisma, userId, input.boxId)) return serviceFail(409, "BOX_PAIRED_ELSEWHERE");
    // Zwei gleichzeitige Erstkontakte: der zweite trifft auf die eben angelegte Zeile und liest sie.
    box = await prisma.boxStatus
      .create({
        data: { userId, boxId: input.boxId, name: input.boxId, kind: "lockmebox" satisfies BoxKind, locked: false, lockPassword: await lockmeboxSecretFor(input.boxId) },
        select,
      })
      .catch(async (e) => {
        if (!isUniqueConstraintOn(e, "boxId")) throw e;
        return prisma.boxStatus.findUniqueOrThrow({ where: key, select });
      });
  }
  if (box.kind !== "lockmebox" || !box.lockPassword) return serviceFail(409, "BOX_BLE_OTHER_BOX");

  const pending = toPendingCommand(box.pendingCommand);
  const next = nextLockmeboxCommand(status, pending, input.sent);
  if (status) {
    // Geht jetzt ein Schliessbefehl hinaus, gilt die Box ab SOFORT als „vermutlich zu": SOLL zu, IST
    // unbekannt. Reisst die Verbindung ab, nachdem sie zugefahren ist, aber bevor ihre Antwort hier
    // ankommt, stünde sonst „offen" in der Zeile — und „Box entfernen" oder das Löschen des Nutzers
    // liesse eine verschlossene Box still verschwinden (`lockmeboxMayBeLocked`). Erst ihre nächste
    // Meldung setzt den Zustand wieder aus der Box selbst.
    const lockGoingOut = next.command === "lock";
    await prisma.boxStatus.update({
      where: key,
      data: {
        // Die Box kennt kein eigenes SOLL: sie ist zu, bis der Tracker sie öffnet. SOLL und IST
        // sind deshalb dieselbe Meldung; was der Tracker will, steht in `pendingCommand`.
        locked: lockGoingOut || status.locked,
        reportedLocked: lockGoingOut ? null : status.locked,
        battery: status.battery,
        charging: status.charging,
        fwVersion: status.fwVersion,
        lastSyncAt: now,
      },
    });
    // Nur DIESES Kommando dieser Box streichen: hat ein Eintrag inzwischen ein anderes gesetzt, oder
    // wartet eine zweite Box noch auf ihres, bleibt es stehen.
    if (next.settled && pending) await clearBoxCommandForUser(prisma, userId, pending, input.boxId);
    // „Riegel zu" vollzieht einen wartenden Verschluss-Aufruf — derselbe Trichter wie bei Heimdall.
    // „Riegel offen" vollzieht die wartende Öffnung: der Tracker schaltet erst um, wenn die Box
    // tatsächlich aufgegangen ist.
    if (status.locked) await boxReportedLockedSafe(userId, now, "box/ble");
    else await commitPendingOpenSafe(userId, now, "box/ble");
  }

  return {
    ok: true,
    data: {
      send: next.command ? { command: next.command, frame: encryptLockmeboxCommand(lockmeboxPlaintext(next.command, box.lockPassword)) } : null,
      problem: next.problem,
      locked: status?.locked ?? null,
      info: status ? { battery: status.battery, charging: status.charging, fwVersion: status.fwVersion } : null,
    },
  };
}
