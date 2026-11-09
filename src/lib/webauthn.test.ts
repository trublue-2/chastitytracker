import { afterEach, describe, expect, it, vi } from "vitest";
import { androidApkOrigin, getRpConfig } from "./webauthn";

// Öffentlicher Fingerabdruck des Release-Zertifikats und die Herkunft, die die App damit meldet
// (aus dem Fehler-Log einer abgelehnten Passkey-Registrierung, 09.11.2026).
const CERT = "0E:55:BF:B8:AB:46:FA:E0:5E:99:57:74:1D:86:02:5B:11:55:FA:49:FE:89:ED:25:3E:46:F4:94:FD:13:55:21";
const APP_ORIGIN = "android:apk-key-hash:DlW_uKtG-uBemVd0HYYCWxFV-kn-ie0lPkb0lP0TVSE";

afterEach(() => vi.unstubAllEnvs());

describe("androidApkOrigin", () => {
  it("leitet die WebAuthn-Herkunft der App aus dem Zertifikat ab", () => {
    expect(androidApkOrigin(CERT)).toBe(APP_ORIGIN);
  });
});

describe("getRpConfig().expectedOrigins", () => {
  it("nimmt neben der Instanz die App-Herkunft an", () => {
    vi.stubEnv("WEBAUTHN_RP_ORIGIN", "https://tracker.example.com");
    vi.stubEnv("ANDROID_CERT_SHA256", ` ${CERT.toLowerCase()} `);
    expect(getRpConfig().expectedOrigins).toEqual(["https://tracker.example.com", APP_ORIGIN]);
  });

  it("ohne Zertifikat nur die Instanz", () => {
    vi.stubEnv("WEBAUTHN_RP_ORIGIN", "https://tracker.example.com");
    vi.stubEnv("ANDROID_CERT_SHA256", "");
    expect(getRpConfig().expectedOrigins).toEqual(["https://tracker.example.com"]);
  });
});

describe("androidCertFingerprints", () => {
  it("verwirft Werte, die kein SHA-256-Fingerabdruck sind", () => {
    vi.stubEnv("WEBAUTHN_RP_ORIGIN", "https://tracker.example.com");
    vi.stubEnv("ANDROID_CERT_SHA256", `AA:BB, ${CERT}`);
    expect(getRpConfig().expectedOrigins).toEqual(["https://tracker.example.com", APP_ORIGIN]);
  });
});
