import { prisma } from "@/lib/prisma";
import { lockmeboxEnabled } from "@/lib/constants";
import { notifyHeimdall } from "@/lib/heimdallNotify";
import { deliveryChannels } from "@/lib/deliveryChannels";
import { emailT } from "@/lib/emailI18n";
import { firePush } from "@/lib/push";
import { NOTIFY_RECIPIENT_SELECT } from "@/lib/notify";
import type { BoxKind } from "@/lib/boxStatus";

/**
 * Ein Box-Kommando steht an — sag es dem, der es ausführt. Nach dem Commit gerufen, und zwar genau
 * dann, wenn `setBoxCommandForUser` ein Kommando gesetzt hat (sein Rückgabewert): Eintrag, erneutes
 * Verriegeln, Sofort-Freigabe.
 *
 * - **Heimdall-Box:** der Instant-Push an den Heimdall-Server (`notifyHeimdall`), eine LIVE Box
 *   vollzieht sofort.
 * - **LockMeBox:** sie hat kein Netz — ausgeführt wird erst, wenn das Handy des Trägers sich
 *   verbindet, und das sucht nur, solange die App offen ist. Deshalb eine Push-Mitteilung an den
 *   Träger: Antippen öffnet die Übersicht, deren Box-Karte selbst nach der Box sucht. Ohne sie bliebe
 *   ein im Browser oder von der Keyholderin ausgelöster Befehl liegen, bis zufällig jemand die App
 *   öffnet.
 *
 * Fire-and-forget: der auslösende Flow darf von keinem der beiden Wege abhängen.
 */
export function announceBoxCommand(userId: string, command: "lock" | "open"): void {
  announce(userId, command).catch((e: unknown) => {
    console.warn(`[boxCommandNotify] Ansage fehlgeschlagen: ${(e as Error).message}`);
  });
}

async function announce(userId: string, command: "lock" | "open"): Promise<void> {
  // EINE Abfrage für beide Wege: der Name für Heimdall, Sprache und Kanäle für die Mitteilung, und
  // welche Box-Arten der Träger führt — jeder Weg meldet sich nur bei seiner eigenen Box.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { ...NOTIFY_RECIPIENT_SELECT, boxStatuses: { select: { kind: true } } },
  });
  if (!user) return;
  const kinds = new Set(user.boxStatuses.map((b) => b.kind));
  if (kinds.has("heimdall" satisfies BoxKind)) notifyHeimdall(user.username, command);
  if (!kinds.has("lockmebox" satisfies BoxKind) || !lockmeboxEnabled()) return;
  // Wichtig, nicht beiläufig: ohne den Gang zur Box gilt der Befehl nie.
  if (!(await deliveryChannels(user, "important")).push) return;
  const t = emailT(user.locale);
  firePush(userId, t("boxWaitingPushTitle"), t(command === "lock" ? "boxWaitingPushLock" : "boxWaitingPushOpen"), "/dashboard");
}
