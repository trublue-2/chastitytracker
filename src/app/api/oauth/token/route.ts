import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  getClient, consumeAuthorizationCode, createAccessToken, createRefreshToken, verifyRefreshToken,
  verifyPkceS256, OAUTH_TOKEN_TTL_MS, pruneExpiredOAuthRecords,
} from "@/lib/oauth";

/** Standard-Token-Response (access + refresh + Metadaten). */
function tokenResponse(accessToken: string, refreshToken: string, scope: string) {
  return NextResponse.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: Math.floor(OAUTH_TOKEN_TTL_MS / 1000),
    refresh_token: refreshToken,
    scope,
  });
}

/**
 * POST /api/oauth/token
 * Token endpoint (RFC 6749). Supports:
 *  - grant_type=authorization_code (§4.1.3, PKCE S256) → access + refresh token
 *  - grant_type=refresh_token (§6) → neuer access token, SELBER refresh token (nicht-rotierend)
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ?? "unknown";
  const rl = await checkRateLimit(`oauth-token:${ip}`, 30, 60_000);
  if (rl.limited) {
    return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
  }

  // Accept both application/x-www-form-urlencoded and application/json
  let params: Record<string, string>;
  const ct = req.headers.get("content-type") ?? "";
  try {
    if (ct.includes("application/json")) {
      params = await req.json() as Record<string, string>;
    } else {
      params = Object.fromEntries(await req.formData()) as Record<string, string>;
    }
  } catch {
    return NextResponse.json({ error: "invalid_request", error_description: "Unable to parse request body" }, { status: 400 });
  }

  const { grant_type: grantType, client_id: clientId } = params;

  if (grantType === "authorization_code") {
    return handleAuthorizationCode(params, clientId);
  }
  if (grantType === "refresh_token") {
    return handleRefreshToken(params, clientId);
  }
  return NextResponse.json({ error: "unsupported_grant_type" }, { status: 400 });
}

async function handleAuthorizationCode(params: Record<string, string>, clientId?: string) {
  const { code, redirect_uri: redirectUri, code_verifier: codeVerifier } = params;
  if (!code || !redirectUri || !clientId || !codeVerifier) {
    return NextResponse.json({ error: "invalid_request", error_description: "Missing required parameters" }, { status: 400 });
  }

  const client = await getClient(clientId);
  if (!client) return NextResponse.json({ error: "invalid_client" }, { status: 401 });

  const record = await consumeAuthorizationCode(code, clientId, redirectUri);
  if (!record) {
    return NextResponse.json({ error: "invalid_grant", error_description: "Code is invalid, expired, or already used" }, { status: 400 });
  }
  if (record.codeChallengeMethod !== "S256") {
    return NextResponse.json({ error: "invalid_grant", error_description: "Unsupported code_challenge_method" }, { status: 400 });
  }
  if (!verifyPkceS256(codeVerifier, record.codeChallenge)) {
    return NextResponse.json({ error: "invalid_grant", error_description: "PKCE verification failed" }, { status: 400 });
  }

  const scopes = record.scopes.split(" ").filter(Boolean);
  const [accessToken, refreshToken] = await Promise.all([
    createAccessToken(clientId, record.userId, scopes),
    createRefreshToken(clientId, record.userId, scopes),
  ]);
  // Lazy cleanup nur nach erfolgreichem Grant (fire-and-forget) — keine Last/DoS bei Müll-Requests.
  pruneExpiredOAuthRecords().catch(() => {});
  return tokenResponse(accessToken, refreshToken, record.scopes);
}

async function handleRefreshToken(params: Record<string, string>, clientId?: string) {
  const refreshTokenRaw = params.refresh_token;
  if (!refreshTokenRaw || !clientId) {
    return NextResponse.json({ error: "invalid_request", error_description: "Missing refresh_token or client_id" }, { status: 400 });
  }
  // Kein getClient nötig: ein gültiger Refresh-Token mit passender clientId impliziert den Client
  // (FK + onDelete:Cascade — gelöschter Client hätte keine Refresh-Tokens mehr).
  const record = await verifyRefreshToken(refreshTokenRaw);
  if (!record || record.clientId !== clientId) {
    return NextResponse.json({ error: "invalid_grant", error_description: "Refresh token is invalid or expired" }, { status: 400 });
  }

  // Nicht-rotierend: neuer Access-Token, derselbe Refresh-Token zurück (vermeidet Rotation-Race).
  const scopes = record.scopes.split(" ").filter(Boolean);
  const accessToken = await createAccessToken(clientId, record.userId, scopes);
  pruneExpiredOAuthRecords().catch(() => {});
  return tokenResponse(accessToken, refreshTokenRaw, record.scopes);
}
