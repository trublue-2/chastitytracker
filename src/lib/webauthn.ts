// ---------------------------------------------------------------------------
// WebAuthn / Passkey configuration
// Uses @simplewebauthn/server for all crypto operations.
// ---------------------------------------------------------------------------

/**
 * Relying Party (RP) configuration.
 * rpId must match the domain the browser sees (no port, no protocol).
 * rpOrigin must match the full origin the browser sees.
 *
 * Falls back to localhost for local development.
 */
export function getRpConfig() {
  const rpId = process.env.WEBAUTHN_RP_ID ?? "localhost";
  const rpName = "KG Tracker";
  const rpOrigin = process.env.WEBAUTHN_RP_ORIGIN ?? "http://localhost:3000";

  return { rpId, rpName, rpOrigin };
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
  const token = require("crypto").randomBytes(32).toString("hex");
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
