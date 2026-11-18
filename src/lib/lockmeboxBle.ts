// Das Handy als Relais zur LockMeBox — die Client-Hälfte von `lockmeboxService.ts`.
//
// Ein Code für App UND Browser: `@capacitor-community/bluetooth-le` spricht in der iOS-/Android-App
// das native Bluetooth an und fällt im Browser auf Web Bluetooth zurück (Chrome/Edge auf Android und
// am Desktop). Safari — und damit JEDER Browser auf dem iPhone — kennt Web Bluetooth nicht; dort geht
// es nur in der App. Alle Module werden dynamisch geladen, damit nichts davon im Server-Rendering läuft.

import { fetchWithTimeout, parseApiErrorCode } from "@/lib/apiClient";
import { codedError, codeOf } from "@/lib/codedError";
import { isNativePlatform } from "@/lib/nativeApp";
import type { FirmwareSwapStart } from "@/lib/firmwareSwapService";
import {
  LOCKMEBOX_COMMAND_LETTER, LOCKMEBOX_FIRMWARE_LETTER, LOCKMEBOX_NAME_PREFIX, LOCKMEBOX_NAME_RE, LOCKMEBOX_RX, LOCKMEBOX_SERVICE,
  LOCKMEBOX_TX, splitLockmeboxFrames, type LockmeboxCommand, type LockmeboxInfo, type LockmeboxProblem,
  type LockmeboxRelayInput, type LockmeboxRelayResult,
} from "@/lib/lockmeboxProtocol";

/** So lange wartet das Handy auf die Antwort der Box auf einen Befehl. Der Motor braucht ein paar
 *  Sekunden, die Box antwortet erst danach — bei schwachem Akku oder schwergängigem Riegel länger,
 *  als 8 Sekunden reichten (Rückmeldung 6.5.2: Befehl ausgeführt, Antwort zu spät). */
const REPLY_TIMEOUT_MS = 20_000;
/** So schnell antwortet eine Box auf die Statusabfrage, wenn sie den Befehl lesen kann (ohne Motor).
 *  Bleibt sie darauf stumm, obwohl sie sich beim Verbinden gemeldet hat, versteht sie den Befehl nicht. */
const STATUS_TIMEOUT_MS = 6_000;
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
  /** Die Box hat auf einen Befehl nicht rechtzeitig geantwortet. */
  | "noReply"
  /** Die Box meldet sich beim Verbinden, ignoriert aber unsere Befehle — fast immer ein falscher
   *  `BLE_BRIDGE_KEY` (sie liest die verschlüsselten Befehle nicht). Die Oberfläche sagt nur „keine
   *  Kommunikation möglich"; die Ursache geht ins Server-Log (`reportKeyRejected`). */
  | "keyRejected"
  /** Die Verbindung zur Box kam nicht zustande — häufig belegt eine andere App (Hersteller-App) sie,
   *  denn die Box nimmt nur eine Verbindung zugleich an. */
  | "connectFailed"
  /** Der Befehl ging nicht bis zur Box (Schreiben fehlgeschlagen). */
  | "writeFailed"
  /** Der Server hat abgelehnt (Code in `code`) oder war nicht erreichbar (`code` leer). */
  | "server";

export type LockmeboxSessionOutcome =
  | { ok: true; locked: boolean | null; info: LockmeboxInfo | null }
  /** `lastLine`: das Letzte, was die Box vor dem Schweigen geschickt hat (auch angefangen) — hilft,
   *  ein Antwortformat zu erkennen, das der Tracker nicht kennt. */
  | { ok: false; error: LockmeboxSessionError; code?: string | null; lastLine?: string | null };

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

/** Ein Aufruf an den Server während einer Sitzung. Jeder Fehler auf diesem Weg ist einer des SERVERS
 *  oder der Leitung, nie der Box — getrennt markiert, damit der Träger nicht an der Box sucht, was am
 *  Netz liegt. */
async function postToServer<T>(url: string, body: unknown): Promise<T> {
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {
    throw codedError(RELAY_ERROR_PREFIX);
  });
  if (!res.ok) throw codedError(RELAY_ERROR_PREFIX + ((await parseApiErrorCode(res)) ?? ""));
  return res.json();
}

const relayStep = (body: LockmeboxRelayInput) => postToServer<LockmeboxRelayResult>("/api/box/ble", body);

/** Sagt dem Server, WARUM keine Verbindung möglich ist — die Ursache gehört ins Log des Betreibers,
 *  nicht in die Oberfläche. Fire-and-forget: ein Fehler hier ändert nichts am Ergebnis der Sitzung. */
function reportKeyRejected(boxId: string): void {
  void fetchWithTimeout("/api/box/ble/diagnostic", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ boxId, reason: "keyRejected" }),
  }).catch(() => {});
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

/** Die Geräteauswahl des Browsers bzw. der App: nur Geräte, die als LockMeBox werben. MUSS aus einem
 *  Klick heraus gerufen werden — der Browser zeigt die Auswahl nur auf eine Nutzeraktion hin. */
async function pickLockmebox(ble: BleModule): Promise<FoundBox | SessionFailure> {
  const initError = await initBle(ble);
  if (initError) return { ok: false, error: initError };
  try {
    const device = await ble.BleClient.requestDevice({ namePrefix: LOCKMEBOX_NAME_PREFIX, optionalServices: [LOCKMEBOX_SERVICE] });
    const boxId = device.name ?? "";
    return LOCKMEBOX_NAME_RE.test(boxId) ? { deviceId: device.deviceId, boxId } : { ok: false, error: "noDevice" };
  } catch {
    return { ok: false, error: "noDevice" };
  }
}

/**
 * Sitzung per GERÄTEAUSWAHL — der Knopf „Mit Box verbinden" (aus einem Klick heraus, siehe
 * {@link pickLockmebox}). Koppelt auch eine neue Box.
 */
export async function runLockmeboxSession(): Promise<LockmeboxSessionOutcome> {
  const ble = await import("@capacitor-community/bluetooth-le");
  const found = await pickLockmebox(ble);
  return "ok" in found ? found : relaySession(ble, found);
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

/** Eine offene Verbindung zur Box, wie {@link withBoxLink} sie hergibt. */
interface BoxLink {
  /** Zeile schreiben und auf die erste Antwort warten, die mit `prefix` beginnt — `null` nach `timeoutMs`. */
  sendAndAwait(prefix: string, frame: string, timeoutMs: number): Promise<string | null>;
  /** Hat sich die Box beim Verbinden von selbst gemeldet, bevor wir etwas schrieben? */
  greeted(): boolean;
  /** Das Letzte, was die Box geschickt hat (auch angefangen) — für die Fehlermeldung. */
  lastLine(): string | null;
}

type SessionFailure = Extract<LockmeboxSessionOutcome, { ok: false }>;

/** Antwortet die Box nicht auf die Statusabfrage, obwohl sie sich gemeldet hat, liest sie unsere
 *  Befehle nicht (falscher Schlüssel) — sonst schweigt sie schlicht. */
function silenceError(link: BoxLink, boxId: string, command: LockmeboxCommand): SessionFailure {
  const error = command === "status" && link.greeted() ? "keyRejected" : "noReply";
  if (error === "keyRejected") reportKeyRejected(boxId);
  return { ok: false, error, lastLine: link.lastLine() };
}

/** Die Antwort-Kennung eines Relais-Befehls: die Box wiederholt seinen Buchstaben. */
const replyPrefix = (command: LockmeboxCommand) => `<${LOCKMEBOX_COMMAND_LETTER[command]}/`;

/**
 * Verbinden, Benachrichtigungen an, `run` ausführen, in jedem Fall trennen. Fehler unterwegs werden
 * zu Sitzungsfehlern: einer des Servers (`relayStep`/`codedError`) als `server`, sonst nach der
 * Stelle, an der es hakte.
 */
async function withBoxLink<T extends { ok: true }>(
  ble: BleModule,
  deviceId: string,
  run: (link: BoxLink) => Promise<T | SessionFailure>,
): Promise<T | SessionFailure> {
  const { BleClient, textToDataView, dataViewToText } = ble;

  // Die Box schickt eine Zeile in mehreren Stücken. `buffer` hält die angefangene; wartet gerade ein
  // Befehl auf Antwort, erfüllt die erste passende Zeile sein Versprechen. Zeilen davor (die Box
  // meldet sich beim Verbinden von selbst) fallen weg.
  let buffer = "";
  let lastFrame: string | null = null;
  // Die Box meldet sich beim Verbinden von selbst. Kam das VOR unserem ersten Befehl, lebt sie und
  // spricht — schweigt sie danach auf die Statusabfrage, liest sie unsere Befehle nicht.
  let greeted = false;
  let written = false;
  let stage: "connect" | "write" | "wait" = "connect";
  let awaiting: { prefix: string; resolve: (line: string | null) => void } | null = null;
  const onNotify = (value: DataView) => {
    const split = splitLockmeboxFrames(buffer + dataViewToText(value));
    buffer = split.rest;
    if (split.frames.length) {
      lastFrame = split.frames[split.frames.length - 1];
      if (!written) greeted = true;
    }
    const hit = awaiting && split.frames.find((l) => l.startsWith(awaiting!.prefix));
    if (hit) awaiting!.resolve(hit);
  };
  const link: BoxLink = {
    greeted: () => greeted,
    lastLine: () => buffer || lastFrame,
    sendAndAwait: (prefix, frame, timeoutMs) =>
      new Promise<string | null>((resolve, reject) => {
        const timer = setTimeout(() => done(null), timeoutMs);
        const done = (line: string | null) => {
          clearTimeout(timer);
          awaiting = null;
          resolve(line);
        };
        const mine = { prefix, resolve: done };
        awaiting = mine;
        stage = "write";
        written = true;
        // Nur setzen, solange DIESER Befehl noch wartet: kam die Antwort schon vor der Schreib-Quittung,
        // läuft längst der nächste Befehl, und ein spätes „wait“ verfälschte dessen Fehlerart.
        BleClient.write(deviceId, LOCKMEBOX_SERVICE, LOCKMEBOX_RX, textToDataView(frame)).then(() => { if (awaiting === mine) stage = "wait"; }, (e) => {
          clearTimeout(timer);
          awaiting = null;
          reject(e);
        });
      }),
  };

  try {
    await BleClient.connect(deviceId);
    await BleClient.startNotifications(deviceId, LOCKMEBOX_SERVICE, LOCKMEBOX_TX, onNotify);
    return await run(link);
  } catch (e) {
    const code = codeOf(e);
    if (code?.startsWith(RELAY_ERROR_PREFIX)) return { ok: false, error: "server", code: code.slice(RELAY_ERROR_PREFIX.length) || null };
    return { ok: false, error: stage === "connect" ? "connectFailed" : stage === "write" ? "writeFailed" : "noReply" };
  } finally {
    await BleClient.disconnect(deviceId).catch(() => {});
  }
}

/** Einen Befehl des Servers an die Box, ihre Antwort zurück an den Server — dessen nächster Schritt,
 *  oder warum es hier endet. */
async function relayRound(link: BoxLink, boxId: string, { command, frame }: NonNullable<LockmeboxRelayResult["send"]>): Promise<LockmeboxRelayResult | SessionFailure> {
  const line = await link.sendAndAwait(replyPrefix(command), frame, command === "status" ? STATUS_TIMEOUT_MS : REPLY_TIMEOUT_MS);
  if (!line) return silenceError(link, boxId, command);
  return relayStep({ boxId, line, sent: command });
}

const isFailure = (r: LockmeboxRelayResult | SessionFailure): r is SessionFailure => "ok" in r;

/** Status an den Server, dessen Befehl an die Box, Antwort zurück — bis der Server nichts mehr zu
 *  tun hat. */
async function relaySession(ble: BleModule, { deviceId, boxId }: FoundBox): Promise<LockmeboxSessionOutcome> {
  return withBoxLink(ble, deviceId, async (link) => {
    let step = await relayStep({ boxId, line: null, sent: null });
    for (let i = 0; i < MAX_STEPS && step.send; i++) {
      const next = await relayRound(link, boxId, step.send);
      if (isFailure(next)) return next;
      step = next;
    }
    if (step.problem) return { ok: false, error: step.problem };
    // Grenze erreicht, obwohl der Server noch etwas schicken wollte: nicht als Erfolg melden.
    if (step.send) return { ok: false, error: "notApplied" };
    return { ok: true, locked: step.locked, info: step.info };
  });
}

/** Was der Server für den Wechsel auf Heimdall zurückgibt, ohne den Befehl selbst. */
export type FirmwareSwapTicket = Omit<FirmwareSwapStart, "frame">;

/** So lange wartet das Handy nach dem Update-Befehl auf eine Antwort. Ob die Box überhaupt antwortet,
 *  ist nicht belegt — sie wechselt danach ins WLAN. Zählt also nur, dass der Befehl ankam. */
const FIRMWARE_REPLY_MS = 5_000;

/**
 * Die eigene LockMeBox auf Heimdall umstellen — aus einem Klick heraus ({@link pickLockmebox}), nur
 * für die gekoppelte Box `boxId`.
 *
 * 1. Stand abgleichen — der erste Schritt der Brücke wie bei „Box abfragen": der Tracker weiss danach,
 *    ob sie offen ist. Will er darauf einen Befehl schicken (ein Aufruf wartet) oder ist sie zu, endet
 *    es hier: gewechselt wird nur eine ruhende, offene Box, und den wartenden Befehl führt der Wechsel
 *    nicht nebenbei aus.
 * 2. Den Update-Befehl vom Server holen. Er prüft noch einmal selbst und entfernt die Kopplung.
 * 3. Befehl an die Box schreiben. Ab hier lädt sie selbst über das WLAN.
 */
export async function runLockmeboxFirmwareSwap(
  boxId: string,
  wifi: { ssid: string; password: string },
): Promise<({ ok: true } & FirmwareSwapTicket) | SessionFailure> {
  const ble = await import("@capacitor-community/bluetooth-le");
  const found = await pickLockmebox(ble);
  if ("ok" in found) return found;
  if (found.boxId !== boxId) return { ok: false, error: "noDevice" };

  return withBoxLink(ble, found.deviceId, async (link) => {
    const first = await relayStep({ boxId, line: null, sent: null });
    if (!first.send) return { ok: false, error: "notApplied" };
    const status = await relayRound(link, boxId, first.send);
    if (isFailure(status)) return status;
    if (status.problem) return { ok: false, error: status.problem };
    if (status.send || status.locked) return { ok: false, error: "server", code: "BOX_SWAP_BLOCKED" };

    const { frame, ...ticket } = await postToServer<FirmwareSwapStart>("/api/box/ble/firmware", { boxId, ...wifi });
    await link.sendAndAwait(`<${LOCKMEBOX_FIRMWARE_LETTER}`, frame, FIRMWARE_REPLY_MS);
    return { ok: true as const, ...ticket };
  });
}
