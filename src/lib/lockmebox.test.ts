import crypto from "crypto";
import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { encryptLockmeboxCommand, generateLockmeboxPassword, lockmeboxPlaintext } from "./lockmebox";

// Ein Test-Schlüssel — der echte steht nur in der Umgebung der Instanzen.
const TEST_KEY = "000102030405060708090a0b0c0d0e0f";

function decrypt(frame: string): string {
  const body = Buffer.from(frame.slice(1, -1), "base64");
  const decipher = crypto.createDecipheriv("aes-128-cbc", Buffer.from(TEST_KEY, "hex"), body.subarray(0, 16));
  return Buffer.concat([decipher.update(body.subarray(16)), decipher.final()]).toString("utf8");
}

describe("encryptLockmeboxCommand", () => {
  beforeEach(() => { process.env.BLE_BRIDGE_KEY = TEST_KEY; });
  afterEach(() => { delete process.env.BLE_BRIDGE_KEY; });

  it("rahmt IV + AES-128-CBC als Base64 zwischen < und >", () => {
    const frame = encryptLockmeboxCommand("C/0/1/*/Abc123");
    expect(frame).toMatch(/^<[A-Za-z0-9+/=]+>$/);
    expect(decrypt(frame)).toBe("C/0/1/*/Abc123");
  });

  it("nimmt je Befehl einen frischen IV", () => {
    expect(encryptLockmeboxCommand("S")).not.toBe(encryptLockmeboxCommand("S"));
  });

  it("verweigert ohne gültigen Schlüssel", () => {
    process.env.BLE_BRIDGE_KEY = "zu-kurz";
    expect(() => encryptLockmeboxCommand("S")).toThrow();
  });
});

describe("lockmeboxPlaintext", () => {
  it("sperrt nur mit Passwort, ohne Timer", () => {
    expect(lockmeboxPlaintext("lock", "Abc123")).toBe("C/0/1/*/Abc123");
    expect(lockmeboxPlaintext("open", "Abc123")).toBe("O/Abc123");
    expect(lockmeboxPlaintext("status", "Abc123")).toBe("S");
  });
});

describe("generateLockmeboxPassword", () => {
  it("erzeugt 10 Buchstaben/Ziffern — mehr nimmt die Firmware nicht an", () => {
    for (let i = 0; i < 50; i++) expect(generateLockmeboxPassword()).toMatch(/^[A-Za-z0-9]{10}$/);
  });
});
