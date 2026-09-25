// Das Handy als Relais zur LockMeBox — die Client-Hälfte von `lockmeboxService.ts`.
//
// Ein Code für App UND Browser: `@capacitor-community/bluetooth-le` spricht in der iOS-/Android-App
// das native Bluetooth an und fällt im Browser auf Web Bluetooth zurück (Chrome/Edge auf Android und
// am Desktop). Safari — und damit JEDER Browser auf dem iPhone — kennt Web Bluetooth nicht; dort geht
// es nur in der App. Alle Module werden dynamisch geladen, damit nichts davon im Server-Rendering läuft.

import { fetchWithTimeout, parseApiErrorCode } from "@/lib/apiClient";
import { codedError, codeOf } from "@/lib/codedError";
import { isNativePlatform } from "@/lib/nativePush";
import {
  LOCKMEBOX_COMMAND_LETTER, LOCKMEBOX_NAME_PREFIX, LOCKMEBOX_NAME_RE, LOCKMEBOX_RX, LOCKMEBOX_SERVICE,
  LOCKMEBOX_TX, splitLockmeboxFrames, type LockmeboxCommand, type LockmeboxProblem, type LockmeboxRelayInput,
  type LockmeboxRelayResult,
} from "@/lib/lockmeboxProtocol";

/** So lange wartet das Handy auf die Antwort der Box auf einen Befehl. Der Motor braucht ein paar
 *  Sekunden, die Box antwortet erst danach. */
const REPLY_TIMEOUT_MS = 8_000;
/** Status + höchstens ein Befehl + dessen Antwort — mehr braucht eine Sitzung nie. Die Grenze
 *  schützt nur davor, dass ein Fehler die Verbindung endlos offen hält. */
const MAX_STEPS = 4;
/** Kennzeichen eines Server-Fehlers (`codedError`), der Code steht dahinter. */
const RELAY_ERROR_PREFIX = "LOCKMEBOX_RELAY:";

export type LockmeboxSessionError =
  | LockmeboxProblem
  /** Kein Bluetooth in diesem Browser. */
  | "notSupported"
  /** In der App: Bluetooth ist aus oder für die App nicht erlaubt. */
  | "permission"
  /** Keine Box gewählt bzw. gefunden (schläft sie? erst den Knopf drücken). */
  | "noDevice"
  /** Die Box hat auf einen Befehl nicht geantwortet. */
  | "noReply"
  /** Der Server hat abgelehnt (Code in `code`) oder war nicht erreichbar (`code` leer). */
  | "server";

export type LockmeboxSessionOutcome =
  | { ok: true; locked: boolean | null }
  | { ok: false; error: LockmeboxSessionError; code?: string | null };

/** Wie erreicht dieses Gerät die Box? `native` = die App (sucht selbst im Hintergrund), `web` =
 *  Web Bluetooth (nur über die Geräteauswahl nach einem Klick), `null` = gar nicht. In der App nur,
 *  wenn deren Build das Plugin schon enthält — ältere Builds laden die Web-Oberfläche zwar neu,
 *  bringen es aber nicht mit. */
export async function lockmeboxBleMode(): Promise<"native" | "web" | null> {
  let mode: "native" | "web" | null;
  if (await isNativePlatform()) {
    const { Capacitor } = await import("@capacitor/core");
    mode = Capacitor.isPluginAvailable("BluetoothLe") ? "native" : null;
  } else {
    mode = typeof navigator !== "undefined" && "bluetooth" in navigator ? "web" : null;
  }
  // Das Plugin schon jetzt laden: der Browser zeigt die Geräteauswahl nur innerhalb weniger Sekunden
  // nach dem Klick. Lüde es erst dann, verstriche die Frist beim ersten Mal über ein langsames Netz.
  if (mode) void import("@capacitor-community/bluetooth-le").catch(() => {});
  return mode;
}

async function relayStep(body: LockmeboxRelayInput): Promise<LockmeboxRelayResult> {
  // Jeder Fehler auf diesem Weg ist einer des SERVERS oder der Leitung, nie der Box — getrennt
  // markiert, damit der Träger nicht an der Box sucht, was am Netz liegt.
  const res = await fetchWithTimeout("/api/box/ble", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {
    throw codedError(RELAY_ERROR_PREFIX);
  });
  if (!res.ok) throw codedError(RELAY_ERROR_PREFIX + ((await parseApiErrorCode(res)) ?? ""));
  return res.json();
}

type BleModule = typeof import("@capacitor-community/bluetooth-le");
type FoundBox = { deviceId: string; boxId: string };

/** Bluetooth bereit machen — `null` bei Erfolg, sonst der passende Fehler. */
async function initBle(ble: BleModule): Promise<LockmeboxSessionError | null> {
  try {
    await ble.BleClient.initialize();
    return null;
  } catch {
    // In der App heisst das: Bluetooth aus oder nicht erlaubt — behebbar in den Einstellungen.
    return (await isNativePlatform()) ? "permission" : "notSupported";
  }
}

/**
 * Sitzung per GERÄTEAUSWAHL — der Knopf „Mit Box verbinden". MUSS aus einem Klick heraus gerufen
 * werden: der Browser zeigt die Auswahl nur auf eine Nutzeraktion hin. Koppelt auch eine neue Box.
 */
export async function runLockmeboxSession(): Promise<LockmeboxSessionOutcome> {
  const ble = await import("@capacitor-community/bluetooth-le");
  const initError = await initBle(ble);
  if (initError) return { ok: false, error: initError };
  let device: { deviceId: string; name?: string };
  try {
    device = await ble.BleClient.requestDevice({ namePrefix: LOCKMEBOX_NAME_PREFIX, optionalServices: [LOCKMEBOX_SERVICE] });
  } catch {
    return { ok: false, error: "noDevice" };
  }
  const boxId = device.name ?? "";
  if (!LOCKMEBOX_NAME_RE.test(boxId)) return { ok: false, error: "noDevice" };
  return relaySession(ble, { deviceId: device.deviceId, boxId });
}

/**
 * Sitzung per SUCHE — nur in der App: sie sucht im Hintergrund nach GENAU dieser, bereits gekoppelten
 * Box und spricht sie an, sobald sie auftaucht (nach dem Knopfdruck an der Box). Kein Klick nötig.
 * Endet mit `null`, wenn `signal` abbricht, bevor die Box auftaucht.
 */
export async function runLockmeboxAutoSession(boxId: string, signal: AbortSignal): Promise<LockmeboxSessionOutcome | null> {
  const ble = await import("@capacitor-community/bluetooth-le");
  const initError = await initBle(ble);
  if (initError) return { ok: false, error: initError };
  const found = await new Promise<FoundBox | null>((resolve) => {
    const finish = (box: FoundBox | null) => {
      signal.removeEventListener("abort", onAbort);
      void ble.BleClient.stopLEScan().catch(() => {});
      resolve(box);
    };
    const onAbort = () => finish(null);
    if (signal.aborted) return resolve(null);
    signal.addEventListener("abort", onAbort);
    ble.BleClient.requestLEScan({ namePrefix: LOCKMEBOX_NAME_PREFIX }, (result) => {
      if ((result.device.name ?? result.localName) === boxId) finish({ deviceId: result.device.deviceId, boxId });
    }).catch(() => finish(null));
  });
  return found ? relaySession(ble, found) : null;
}

/** Verbinden, Status an den Server, dessen Befehl an die Box, Antwort zurück — bis der Server nichts
 *  mehr zu tun hat. Trennt am Ende in jedem Fall. */
async function relaySession(ble: BleModule, { deviceId, boxId }: FoundBox): Promise<LockmeboxSessionOutcome> {
  const { BleClient, textToDataView, dataViewToText } = ble;

  // Die Box schickt eine Zeile in mehreren Stücken. `buffer` hält die angefangene; wartet gerade ein
  // Befehl auf Antwort, erfüllt die erste passende Zeile sein Versprechen. Zeilen davor (die Box
  // meldet sich beim Verbinden von selbst) fallen weg.
  let buffer = "";
  let awaiting: { prefix: string; resolve: (line: string | null) => void } | null = null;
  const onNotify = (value: DataView) => {
    const split = splitLockmeboxFrames(buffer + dataViewToText(value));
    buffer = split.rest;
    const hit = awaiting && split.frames.find((l) => l.startsWith(awaiting!.prefix));
    if (hit) awaiting!.resolve(hit);
  };
  const sendAndAwait = (command: LockmeboxCommand, frame: string) =>
    new Promise<string | null>((resolve, reject) => {
      const timer = setTimeout(() => done(null), REPLY_TIMEOUT_MS);
      const done = (line: string | null) => {
        clearTimeout(timer);
        awaiting = null;
        resolve(line);
      };
      awaiting = { prefix: `<${LOCKMEBOX_COMMAND_LETTER[command]}/`, resolve: done };
      BleClient.write(deviceId, LOCKMEBOX_SERVICE, LOCKMEBOX_RX, textToDataView(frame)).catch((e) => {
        clearTimeout(timer);
        awaiting = null;
        reject(e);
      });
    });

  try {
    await BleClient.connect(deviceId);
    await BleClient.startNotifications(deviceId, LOCKMEBOX_SERVICE, LOCKMEBOX_TX, onNotify);

    let step = await relayStep({ boxId, line: null, sent: null });
    for (let i = 0; i < MAX_STEPS && step.send; i++) {
      const { command, frame } = step.send;
      const line = await sendAndAwait(command, frame);
      if (!line) return { ok: false, error: "noReply" };
      step = await relayStep({ boxId, line, sent: command });
    }
    if (step.problem) return { ok: false, error: step.problem };
    // Grenze erreicht, obwohl der Server noch etwas schicken wollte: nicht als Erfolg melden.
    if (step.send) return { ok: false, error: "notApplied" };
    return { ok: true, locked: step.locked };
  } catch (e) {
    const code = codeOf(e);
    if (code?.startsWith(RELAY_ERROR_PREFIX)) return { ok: false, error: "server", code: code.slice(RELAY_ERROR_PREFIX.length) || null };
    return { ok: false, error: "noReply" };
  } finally {
    await BleClient.disconnect(deviceId).catch(() => {});
  }
}
