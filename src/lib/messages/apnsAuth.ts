import { createSign } from "crypto";

/**
 * Der Provider-Token für APNs (ES256-JWT) — einmal gebaut und wiederverwendet.
 *
 * Apple verlangt das ausdrücklich: ein Token gilt höchstens eine Stunde, und wer bei jedem Push einen
 * neuen signiert, wird gedrosselt (`TooManyProviderTokenUpdates`, HTTP 429). Vorher entstand er je
 * Token-Gerät und Meldung neu, samt `readFileSync` des Schlüssels im Request-Pfad.
 */
const APNS_TOKEN_REUSE_MS = 50 * 60 * 1000; // Apple: nicht älter als 60 min — 10 min Luft

interface CachedToken {
  jwt: string;
  issuedAtMs: number;
  /** Woran der Token hängt: ein geänderter Schlüssel (Rotation, anderer Test) verwirft ihn. */
  identity: string;
}

let cached: CachedToken | null = null;
/** Läuft gerade eine Signatur, hängen sich parallele Aufrufer (ein Push je Gerät) an dieselbe. */
let pending: Promise<string> | null = null;

export interface ApnsAuthConfig {
  keyId: string;
  teamId: string;
  /** Liefert den PEM-Schlüssel. Wird nur bei Bedarf gerufen — nicht bei jedem Push. */
  loadKey: () => Promise<string>;
}

export async function apnsProviderToken(cfg: ApnsAuthConfig, nowMs: number = Date.now()): Promise<string> {
  const identity = `${cfg.keyId}:${cfg.teamId}`;
  if (cached && cached.identity === identity && nowMs - cached.issuedAtMs < APNS_TOKEN_REUSE_MS) return cached.jwt;
  if (pending) return pending;
  const signing = (async () => {
    const key = await cfg.loadKey();
    const iat = Math.floor(nowMs / 1000);
    const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: cfg.keyId })).toString("base64url");
    const claims = Buffer.from(JSON.stringify({ iss: cfg.teamId, iat })).toString("base64url");
    const sig = createSign("SHA256").update(`${header}.${claims}`).sign({ key, dsaEncoding: "ieee-p1363" });
    const jwt = `${header}.${claims}.${sig.toString("base64url")}`;
    cached = { jwt, issuedAtMs: nowMs, identity };
    return jwt;
  })();
  // Zurücksetzen NACH der Zuweisung (auch bei Fehlschlag): ein `finally` im Rumpf liefe bei einem
  // synchronen Wurf vor `pending = …` und liesse das gescheiterte Versprechen für immer stehen.
  pending = signing;
  const clear = () => { if (pending === signing) pending = null; };
  signing.then(clear, clear);
  return signing;
}

/** Nur für Tests: den Merker leeren. */
export function resetApnsTokenCache(): void {
  cached = null;
  pending = null;
}
