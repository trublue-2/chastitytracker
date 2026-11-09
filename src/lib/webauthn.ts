// ---------------------------------------------------------------------------
// WebAuthn / Passkey configuration
// Uses @simplewebauthn/server for all crypto operations.
// ---------------------------------------------------------------------------
import crypto from "crypto";
import { APP_NAME } from "@/lib/constants";

/**
 * Relying Party (RP) configuration.
 * rpId must match the domain the browser sees (no port, no protocol).
 * rpOrigin must match the full origin the browser sees; expectedOrigins adds the Android app's.
 *
 * Falls back to localhost for local development.
 */
export function getRpConfig() {
  const rpId = process.env.WEBAUTHN_RP_ID ?? "localhost";
  // Anzeige-Name im Passkey-Dialog des Betriebssystems. NICHT die Identität — das ist `rpId`;
  // ein Wechsel hier entwertet also keine bestehenden Passkeys.
  const rpName = APP_NAME;
  const rpOrigin = process.env.WEBAUTHN_RP_ORIGIN ?? "http://localhost:3000";
  // Die Android-App (WebView im App-Modus) meldet als Herkunft nicht die Instanz, sondern sich
  // selbst: `android:apk-key-hash:<base64url(SHA-256 des Signatur-Zertifikats)>`.
  const expectedOrigins = [rpOrigin, ...androidCertFingerprints().map(androidApkOrigin)];

  return { rpId, rpName, expectedOrigins };
}

/** `ANDROID_CERT_SHA256`: öffentliche Fingerabdrücke des APK-Signatur-Zertifikats, kommagetrennt. */
export function androidCertFingerprints(): string[] {
  return (process.env.ANDROID_CERT_SHA256 ?? "")
    .split(",")
    .map((f) => f.trim().toUpperCase())
    .filter((f) => SHA256_FINGERPRINT.test(f));
}

const SHA256_FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

/** `0E:55:…` → `android:apk-key-hash:DlW…` (WebAuthn-Herkunft einer Android-App). */
export function androidApkOrigin(fingerprint: string): string {
  return `android:apk-key-hash:${Buffer.from(fingerprint.replace(/:/g, ""), "hex").toString("base64url")}`;
}

// ---------------------------------------------------------------------------
// In-memory challenge store (short-lived, per-user)
// Challenges are valid for 5 minutes and cleaned up periodically.
// ---------------------------------------------------------------------------

const challengeStore = new Map<string, { challenge: string; expiresAt: number }>();

const CHALLENGE_TTL = 5 * 60 * 1000; // 5 minutes

export function setChallenge(userId: string, challenge: string) {
  challengeStore.set(userId, {
    challenge,
    expiresAt: Date.now() + CHALLENGE_TTL,
  });

  // Cleanup expired challenges (lazy)
  if (challengeStore.size > 100) {
    const now = Date.now();
    for (const [key, val] of challengeStore) {
      if (val.expiresAt < now) challengeStore.delete(key);
    }
  }
}

export function getAndDeleteChallenge(userId: string): string | null {
  const entry = challengeStore.get(userId);
  if (!entry) return null;
  challengeStore.delete(userId);
  if (entry.expiresAt < Date.now()) return null;
  return entry.challenge;
}

// ---------------------------------------------------------------------------
// Passkey-to-Credentials bridge token store
// One-time tokens consumed by the Credentials provider to create a session.
// ---------------------------------------------------------------------------

const passkeyTokens = new Map<string, { userId: string; expiresAt: number }>();
const PASSKEY_TOKEN_TTL = 60_000; // 1 minute

export function createPasskeyToken(userId: string): string {
  const token = crypto.randomBytes(32).toString("hex");
  passkeyTokens.set(token, {
    userId,
    expiresAt: Date.now() + PASSKEY_TOKEN_TTL,
  });

  // Cleanup expired tokens
  if (passkeyTokens.size > 50) {
    const now = Date.now();
    for (const [k, v] of passkeyTokens) {
      if (v.expiresAt < now) passkeyTokens.delete(k);
    }
  }

  return token;
}

export function consumePasskeyToken(token: string): string | null {
  const entry = passkeyTokens.get(token);
  if (!entry) return null;
  passkeyTokens.delete(token);
  if (entry.expiresAt < Date.now()) return null;
  return entry.userId;
}
