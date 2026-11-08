import { createSign } from "crypto";
import { createTokenCache } from "@/lib/tokenCache";
import { signJwt } from "@/lib/jwtSign";

/**
 * Der Provider-Token für APNs (ES256-JWT) — einmal gebaut und wiederverwendet.
 *
 * Apple verlangt das ausdrücklich: ein Token gilt höchstens eine Stunde, und wer bei jedem Push einen
 * neuen signiert, wird gedrosselt (`TooManyProviderTokenUpdates`, HTTP 429). Vorher entstand er je
 * Token-Gerät und Meldung neu, samt `readFileSync` des Schlüssels im Request-Pfad.
 */
const APNS_TOKEN_REUSE_MS = 50 * 60 * 1000; // Apple: nicht älter als 60 min — 10 min Luft

const cache = createTokenCache();

export interface ApnsAuthConfig {
  keyId: string;
  teamId: string;
  /** Liefert den PEM-Schlüssel. Wird nur bei Bedarf gerufen — nicht bei jedem Push. */
  loadKey: () => Promise<string>;
}

export function apnsProviderToken(cfg: ApnsAuthConfig, nowMs: number = Date.now()): Promise<string> {
  return cache.get(`${cfg.keyId}:${cfg.teamId}`, nowMs, async () => {
    const key = await cfg.loadKey();
    const jwt = signJwt({ alg: "ES256", kid: cfg.keyId }, { iss: cfg.teamId, iat: Math.floor(nowMs / 1000) },
      (input) => createSign("SHA256").update(input).sign({ key, dsaEncoding: "ieee-p1363" }));
    return { value: jwt, reuseForMs: APNS_TOKEN_REUSE_MS };
  });
}

/** Den Merker leeren — nach einem von Apple abgelehnten Token und in Tests. */
export function resetApnsTokenCache(): void {
  cache.reset();
}
