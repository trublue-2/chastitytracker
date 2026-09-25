/**
 * Das Bluetooth-Protokoll der LockMeBox mit Werks-Firmware — der Teil, den Server UND Handy teilen.
 *
 * Bewusst **importfrei**: der Server wertet die Statuszeilen aus (`lockmeboxService.ts`), der
 * Browser/die App zerlegt den Byte-Strom in genau diese Zeilen (`lockmeboxBle.ts`). Zwei Fassungen
 * derselben Rahmung liefen auseinander. Die Verschlüsselung der Befehle steht NICHT hier: sie
 * braucht den Schlüssel, und der verlässt den Server nie (`lockmebox.ts`).
 *
 * Quelle: Reverse Engineering von App und Firmware, am Gerät geprüft (FW 15, 25.09.2026).
 * - Befehle an die Box: `<` + base64(IV ‖ AES-128-CBC(Klartext)) + `>`, Klartext z.B. `S`
 *   (Status), der `C`-Befehl mit Passwort (sperren, Aufbau in `lockmebox.ts`), `O/<pw>` (öffnen).
 * - Antworten der Box: KLARTEXT, `<` + 16 Felder (ab FW 15: 17) mit `/` + Schlussstrich + `>`.
 */

/** Nordic UART Service: Befehle gehen an RX (Write mit Antwort), Status kommt über TX (Notify). */
export const LOCKMEBOX_SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
export const LOCKMEBOX_RX = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
export const LOCKMEBOX_TX = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

/** So wirbt die Box: `LOCKMEBOX-<id>`. Der Name ist zugleich ihre `BoxStatus.boxId`. */
export const LOCKMEBOX_NAME_PREFIX = "LOCKMEBOX-";
export const LOCKMEBOX_NAME_RE = /^LOCKMEBOX-\d{1,6}$/;

/** Die drei Befehle, die der Tracker schickt. `status` fragt nur ab. */
export const LOCKMEBOX_COMMANDS = ["status", "lock", "open"] as const;
export type LockmeboxCommand = (typeof LOCKMEBOX_COMMANDS)[number];

/** Das Kennzeichen, mit dem die Box eine Antwort beginnt (Feld 0) — sie wiederholt den Befehl. */
export const LOCKMEBOX_COMMAND_LETTER: Record<LockmeboxCommand, string> = { status: "S", lock: "C", open: "O" };

/** Ergebnis-Bit „Passwort falsch" (Feld 4). */
const RESULT_PASSWORD_WRONG = 32;
/** Akku-Feld: 200 = lädt (ohne Prozentangabe). */
const SOC_CHARGING = 200;

export interface LockmeboxStatus {
  /** Feld 1: Riegel zu? */
  locked: boolean;
  /** Feld 4, Bit 32: das mitgeschickte Passwort war falsch. */
  passwordWrong: boolean;
  /** Feld 5 in Prozent; `null`, solange die Box lädt (dann meldet sie keine Zahl). */
  battery: number | null;
  charging: boolean;
  /** Feld 14, z.B. `"15"` für Firmware 1.5. */
  fwVersion: string;
}

/**
 * Zerlegt empfangenen Text in vollständige Zeilen `<…>`; der Rest (eine angefangene Zeile) kommt
 * zurück und wird mit dem nächsten Stück weitergeführt. Die Box verschickt eine Zeile in mehreren
 * Benachrichtigungen zu je ~20 Byte.
 */
export function splitLockmeboxFrames(buffer: string): { frames: string[]; rest: string } {
  const frames: string[] = [];
  let rest = buffer;
  let end = rest.indexOf(">");
  while (end !== -1) {
    const start = rest.lastIndexOf("<", end);
    if (start !== -1) frames.push(rest.slice(start, end + 1));
    rest = rest.slice(end + 1);
    end = rest.indexOf(">");
  }
  return { frames, rest };
}

/**
 * Eine Statuszeile lesen — `null`, wenn sie nicht die erwartete Form hat.
 *
 * Der Schlussstrich (`<…/1/>`) wird abgeschnitten: Java verwirft leere Endfelder beim Aufteilen,
 * die Hersteller-App sieht ihn deshalb nie. Ab Firmware 15 kommt ein 17. Feld (`boxConfig`) dazu;
 * gezählt werden nur die ersten 16.
 */
export function parseLockmeboxStatus(frame: string): LockmeboxStatus | null {
  const m = /^<([^<>]*)>$/.exec(frame.trim());
  if (!m) return null;
  const f = m[1].replace(/\/+$/, "").split("/");
  if (f.length < 16) return null;
  const num = (s: string) => (/^\d+$/.test(s) ? Number(s) : NaN);
  const locked = num(f[1]);
  const result = num(f[4]);
  const soc = num(f[5]);
  if (![0, 1].includes(locked) || Number.isNaN(result) || Number.isNaN(soc)) return null;
  return {
    locked: locked === 1,
    passwordWrong: (result & RESULT_PASSWORD_WRONG) !== 0,
    battery: soc > 100 ? null : soc,
    charging: soc === SOC_CHARGING,
    fwVersion: f[14],
  };
}

export type LockmeboxProblem = "passwordWrong" | "notApplied";

/** Ein Schritt der Handy-Brücke, wie das Handy ihn an `/api/box/ble` schickt. */
export interface LockmeboxRelayInput {
  boxId: string;
  /** Die zuletzt von der Box empfangene Statuszeile; `null` beim ersten Schritt einer Sitzung. */
  line: string | null;
  /** Der Befehl, auf den `line` antwortet; `null` beim ersten Schritt. */
  sent: LockmeboxCommand | null;
}

export interface LockmeboxRelayResult {
  /** Der nächste Befehl samt fertig verschlüsselter Zeile — `null` = fertig, Verbindung trennen. */
  send: { command: LockmeboxCommand; frame: string } | null;
  /** Warum die Sitzung ohne Erfolg endet; `null` = alles vollzogen. */
  problem: LockmeboxProblem | null;
  /** Riegel zu laut der zuletzt gelesenen Zeile; `null` = noch keine gelesen. */
  locked: boolean | null;
}

/**
 * Was folgt aus der gelesenen Zeile? Rein und ohne Datenbank — die EINE Stelle der Regel.
 *
 * - `settled`: die Box steht, wo das anstehende Kommando sie haben will. Es ist damit erledigt,
 *   egal ob dieser Befehl oder ein früherer es herbeigeführt hat.
 * - `command`: der nächste Befehl, `status` solange noch keine Zeile gelesen ist.
 * - `problem`: warum die Sitzung ohne Erfolg endet. Ein falsches Passwort beim Öffnen heisst, die
 *   Box wurde anderswo (Hersteller-App) verschlossen. Verlangt der Zustand nach einer Antwort
 *   DENSELBEN Befehl noch einmal, hat er nicht gewirkt — ein zweiter Versuch in derselben Sitzung
 *   liefe in dieselbe Wand, statt sich im Kreis zu drehen endet sie mit `notApplied`.
 */
export function nextLockmeboxCommand(
  status: Pick<LockmeboxStatus, "locked" | "passwordWrong"> | null,
  pending: "lock" | "open" | null,
  sent: LockmeboxCommand | null,
): { command: LockmeboxCommand | null; problem: LockmeboxProblem | null; settled: boolean } {
  if (!status) return { command: "status", problem: null, settled: false };
  const wanted = pending === "lock" && !status.locked ? "lock" : pending === "open" && status.locked ? "open" : null;
  const settled = pending !== null && wanted === null;
  if (status.passwordWrong && sent === "open") return { command: null, problem: "passwordWrong", settled };
  if (wanted && wanted === sent) return { command: null, problem: "notApplied", settled };
  return { command: wanted, problem: null, settled };
}
