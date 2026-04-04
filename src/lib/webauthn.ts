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
