import crypto from "crypto";
import { bleBridgeKey } from "@/lib/constants";
import { LOCKMEBOX_COMMAND_LETTER, type LockmeboxCommand } from "@/lib/lockmeboxProtocol";

/**
 * Die verschlüsselte Hälfte des LockMeBox-Protokolls — nur auf dem Server.
 *
 * Der Schlüssel kommt aus `BLE_BRIDGE_KEY` (vom Betreiber der Instanz, nicht im Repo). Das Handy
 * bekommt nur fertige Befehle zu sehen, nie den Schlüssel.
 */

function key(): Buffer {
  const hex = bleBridgeKey();
  if (!hex) throw new Error("BLE_BRIDGE_KEY fehlt oder ist kein 128-Bit-Hex-Schlüssel");
  return Buffer.from(hex, "hex");
}

/** Klartext → Befehlszeile (Rahmung siehe `lockmeboxProtocol.ts`), mit frischem Zufalls-IV je Befehl. */
export function encryptLockmeboxCommand(plaintext: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-128-cbc", key(), iv);
  const body = Buffer.concat([iv, cipher.update(plaintext, "utf8"), cipher.final()]);
  return `<${body.toString("base64")}>`;
}

/** Der Klartext eines Befehls. Sperren setzt nur den Passwortschutz (`C/<timer 0>/<pw 1>/<keine
 *  Zeit>/<pw>`), keinen Timer: die Box soll zu bleiben, bis der Tracker sie öffnet — ein Timer
 *  liesse sie weder vorzeitig öffnen (Reinigung) noch unbefristet sperren. */
export function lockmeboxPlaintext(command: LockmeboxCommand, password: string): string {
  const letter = LOCKMEBOX_COMMAND_LETTER[command];
  switch (command) {
    case "status": return letter;
    case "lock": return [letter, "0", "1", "*", password].join("/");
    case "open": return [letter, password].join("/");
  }
}

/** Das Box-Passwort: 10 Zeichen aus Buchstaben und Ziffern — mehr nimmt die Firmware nicht an. */
export function generateLockmeboxPassword(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 10 }, () => alphabet[crypto.randomInt(alphabet.length)]).join("");
}
