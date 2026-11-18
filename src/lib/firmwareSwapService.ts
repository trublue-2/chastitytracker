import { prisma } from "@/lib/prisma";
import { removeBox } from "@/lib/boxPairing";
import { heimdallFetch, heimdallUsername } from "@/lib/heimdallApi";
import { encryptLockmeboxCommand, lockmeboxFirmwarePlaintext } from "@/lib/lockmebox";
import { serviceFail, type ServiceResult } from "@/lib/serviceResult";

/**
 * Eine LockMeBox mit Werks-Firmware auf Heimdall umstellen — der Server-Teil.
 *
 * Die Werks-Firmware kennt einen Update-Befehl: per Bluetooth bekommt sie eine Adresse und ein WLAN,
 * lädt die Datei dort über HTTP und startet sie (`lockmeboxFirmwarePlaintext`). Das Handy reicht den
 * Befehl wie jeden anderen nur weiter; gebaut wird er hier, weil nur der Server den Schlüssel kennt.
 * Die Adresse stellt der Heimdall-Server aus: eine Einmal-Adresse, und dazu legt er das Gerät für
 * diesen Träger gleich an, damit sich die Box nach dem Neustart selbst anmelden kann.
 *
 * **Die LockMeBox-Zeile verschwindet, bevor der Befehl hinausgeht**, über {@link removeBox} — dieselben
 * Bedingungen wie beim Entfernen: Träger offen, kein Aufruf wartet, die Box selbst offen. Damit hängt
 * nichts an einer Box, die gleich eine andere Firmware hat, und die Heimdall-Box findet beim ersten
 * Abgleich keine zweite Box vor (eine Box je Träger). Heimdall wird davor gefragt, damit dessen Absage
 * die Kopplung nicht kostet. Scheitert erst das Senden, ist nichts verloren: die Box ist offen, und der
 * nächste Kontakt koppelt sie wieder (`lockmeboxRelayStep`).
 *
 * Das WLAN-Passwort geht nur durch: in den Befehl, nirgends gespeichert, nicht geloggt.
 */

/** So lange darf der Heimdall-Server antworten — der Träger steht an der Box und wartet. */
const HEIMDALL_TIMEOUT_MS = 10_000;

export interface FirmwareSwapInput {
  boxId: string;
  ssid: string;
  password: string;
}

export interface FirmwareSwapStart {
  /** Der verschlüsselte Update-Befehl für die Box. */
  frame: string;
  /** Das Heimdall-Gerät, dessen Fortschritt {@link firmwareSwapProgress} abfragt. */
  deviceId: string;
  /** Für den Setup-Link (`heimdallProvisionLink`), der im Browser entsteht. */
  provisionToken: string;
  serverUrl: string;
}

export interface FirmwareSwapProgress {
  /** Die Box hat die Firmware geholt. */
  downloaded: boolean;
  /** Sie hat sich als Heimdall-Box angemeldet — der Wechsel ist durch. */
  registered: boolean;
}

export async function startFirmwareSwap(userId: string, input: FirmwareSwapInput): Promise<ServiceResult<FirmwareSwapStart>> {
  const [box, username] = await Promise.all([
    prisma.boxStatus.findUnique({ where: { userId_boxId: { userId, boxId: input.boxId } }, select: { kind: true, name: true } }),
    heimdallUsername(userId),
  ]);
  if (!box || !username) return serviceFail(404, "NOT_FOUND");
  if (box.kind !== "lockmebox") return serviceFail(409, "BOX_BLE_OTHER_BOX");

  // Erst Heimdall fragen: scheitert es dort (schon eine Heimdall-Box, Server weg), bleibt die
  // Kopplung stehen. Ein angelegtes Gerät, aus dem nichts wird, nimmt der nächste Versuch wieder.
  const res = await heimdallFetch("/api/tracker/takeover", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, name: box.name }),
    timeoutMs: HEIMDALL_TIMEOUT_MS,
  })?.catch(() => null);
  if (!res?.ok) {
    if (res?.status === 409) return serviceFail(409, "BOX_SWAP_HEIMDALL_EXISTS");
    console.warn(`[firmwareSwap] Heimdall-Server: ${res ? `HTTP ${res.status}` : "nicht erreichbar"}`);
    return serviceFail(503, "BOX_SWAP_UNAVAILABLE");
  }

  // Dann die Kopplung lösen — VOR dem Befehl, damit die Heimdall-Box beim ersten Abgleich keine
  // zweite Box vorfindet.
  const removed = await removeBox(userId, input.boxId);
  if (!removed.ok) return removed.error === "BOX_REMOVE_BLOCKED" ? serviceFail(409, "BOX_SWAP_BLOCKED") : removed;
  const takeover = (await res.json()) as { deviceId: string; provisionToken: string; downloadUrl: string; serverUrl: string };

  return {
    ok: true,
    data: {
      frame: encryptLockmeboxCommand(lockmeboxFirmwarePlaintext(takeover.downloadUrl, input.ssid, input.password)),
      deviceId: takeover.deviceId,
      provisionToken: takeover.provisionToken,
      serverUrl: takeover.serverUrl,
    },
  };
}

/** Wie weit ist der Wechsel? Heimdall gibt nur ein Gerät heraus, das auf diesen Träger gemappt ist. */
export async function firmwareSwapProgress(userId: string, deviceId: string): Promise<ServiceResult<FirmwareSwapProgress>> {
  const username = await heimdallUsername(userId);
  if (!username) return serviceFail(404, "NOT_FOUND");
  const query = new URLSearchParams({ username });
  const res = await heimdallFetch(`/api/tracker/takeover/${encodeURIComponent(deviceId)}?${query}`, {
    timeoutMs: HEIMDALL_TIMEOUT_MS,
  })?.catch(() => null);
  if (res?.status === 404) return serviceFail(404, "NOT_FOUND");
  if (!res?.ok) return serviceFail(503, "BOX_SWAP_UNAVAILABLE");
  const body = (await res.json()) as FirmwareSwapProgress;
  return { ok: true, data: { downloaded: body.downloaded, registered: body.registered } };
}
