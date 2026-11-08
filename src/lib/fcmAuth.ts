import { createSign } from "crypto";
import { createTokenCache } from "@/lib/tokenCache";
import { signJwt } from "@/lib/jwtSign";

/**
 * Der OAuth-Access-Token für FCM HTTP v1 — aus dem Service-Account-Schlüssel des Firebase-Projekts.
 *
 * Ablauf (Google „Service account → OAuth 2.0"): ein RS256-JWT mit dem Scope
 * `firebase.messaging` an den `token_uri` des Kontos schicken, zurück kommt ein Access-Token, der
 * eine Stunde gilt. Er wird gemerkt wie der APNs-Provider-Token — eine Anfrage je Push wäre
 * gedrosselt und verlangsamte jeden Versand um einen Rundlauf.
 */
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const REUSE_MARGIN_MS = 5 * 60 * 1000;

const cache = createTokenCache();

/** Die Felder der Service-Account-JSON, die der Versand braucht. */
export interface FcmServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri: string;
}

export function parseServiceAccount(json: string): FcmServiceAccount {
  const sa = JSON.parse(json) as Partial<FcmServiceAccount>;
  if (!sa.project_id || !sa.client_email || !sa.private_key || !sa.token_uri) {
    throw new Error("FCM service account JSON lacks project_id/client_email/private_key/token_uri");
  }
  return sa as FcmServiceAccount;
}

/** Das signierte JWT, das gegen einen Access-Token getauscht wird. Exportiert für den Test. */
export function fcmAssertion(sa: FcmServiceAccount, nowMs: number): string {
  const iat = Math.floor(nowMs / 1000);
  return signJwt({ alg: "RS256", typ: "JWT" },
    { iss: sa.client_email, scope: FCM_SCOPE, aud: sa.token_uri, iat, exp: iat + 3600 },
    (input) => createSign("RSA-SHA256").update(input).sign(sa.private_key));
}

export function fcmAccessToken(
  sa: FcmServiceAccount,
  timeoutMs: number,
  nowMs: number = Date.now(),
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  return cache.get(sa.client_email, nowMs, async () => {
    const res = await fetchImpl(sa.token_uri, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: fcmAssertion(sa, nowMs),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`FCM token exchange failed: HTTP ${res.status}`);
    const body = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new Error("FCM token exchange returned no access_token");
    const lifetimeMs = (body.expires_in ?? 3600) * 1000;
    return { value: body.access_token, reuseForMs: Math.max(0, lifetimeMs - REUSE_MARGIN_MS) };
  });
}

/** Den Merker leeren — nach einem von FCM abgelehnten Token (401) und in Tests. */
export function resetFcmTokenCache(): void {
  cache.reset();
}
